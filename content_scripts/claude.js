/**
 * Claude (claude.ai) 用コンテンツスクリプト: GGAdviser
 * Claude の入力欄への画像・テキストの転送支援、および生成完了後のレスポンスパースを担当する。
 * gemini.js と同じ役割で、DOM に依存する部分(入力欄・添付確認・生成状態・最新の回答)だけを claude.ai 向けにしている。
 * claude.ai は SPA で、送信後に /new から /chat/<id> へ遷移してもこのスクリプトは再読込されない。
 */

(function () {
  // ヘルパー
  // 入力欄は ProseMirror (tiptap) の contenteditable。data-testid を優先し、構造的な手がかりへフォールバックする。
  function findInputArea() {
    return (
      document.querySelector('[data-testid="chat-input"]') ||
      document.querySelector('.ProseMirror[contenteditable="true"]') ||
      document.querySelector('[role="textbox"][contenteditable="true"]')
    );
  }

  // 入力欄・添付・送信/停止ボタンをまとめて含む領域。見つからなければ入力欄自身を返す。
  function findComposer() {
    const input = findInputArea();
    return input ? input.closest("fieldset") || input : null;
  }

  // 診断用マーカー（即時実行）
  try {
    const manifestVer = chrome.runtime.getManifest().version;
    document.body.setAttribute("data-gg-claude-loaded", manifestVer);
  } catch (e) {
    /* Ignore */
  }

  const DEBUG = false;
  const _warn = (msg) => { if (DEBUG) console.warn(`[GGAdviser:Claude:WARN] ${msg}`); };
  const _error = (msg, err) => { if (DEBUG) console.error(`[GGAdviser:Claude:ERROR] ${msg}`, err || ""); };

  // 二重実行防止
  if (window.__GG_CLAUDE_INITIALIZED) {
    return;
  }
  window.__GG_CLAUDE_INITIALIZED = true;

  const parser =
    typeof ResponseParser !== "undefined" ? new ResponseParser() : null;

  // 生成ロジックの状態
  let generationObserver = null;
  let isGenerating = false;
  let isStopRequested = false; // 生成前のキャンセルフラグ
  let lastSentText = ""; // Memory storage to prevent duplicate recovery

  // finalData の有効期間。ANALYZE から Claude を開くまでと、添付失敗後の開き直しを想定した長さ。
  // これを過ぎた finalData は古い解析の残りとみなし、注入せずに捨てる。
  const FINAL_DATA_TTL_MS = 10 * 60 * 1000;

  // 画像の貼り付けは、添付を確認できるまで再試行する。
  const ATTACH_MAX_TRIES = 3; // 貼り付けの試行回数の上限
  const ATTACH_CONFIRM_MS = 4000; // 1回の貼り付け後に添付を待つ時間

  // 生成中のみ入力欄に現れる停止ボタン。言語に依存しない data-testid を優先する。
  const STOP_BUTTON_SELECTOR =
    '[data-testid="chat-input-stop"], button[aria-label*="停止"], button[aria-label*="Stop"]';

  // 初期化時に一度だけストレージを確認 (ポーリングはしない)
  // 連携先が Claude に設定されている場合に限り、新規チャット (/new) を開いた直後の注入を行う。
  // 既存のチャットや、連携先が Gemini のときに開いた claude.ai には注入しない。
  function checkStorageOnceOnStart() {
    if (!chrome || !chrome.storage || !chrome.storage.local) return;
    if (window.location.pathname !== "/new") return;

    const keys = GG_CONSTANTS.STORAGE_KEYS;
    chrome.storage.local.get([keys.FINAL_DATA, keys.AI_SERVICE], (res) => {
      if (!res || res[keys.AI_SERVICE] !== GG_CONSTANTS.AI_SERVICES.CLAUDE) return;
      const data = res[keys.FINAL_DATA];
      if (!data) return;

      // 保存時刻が無い(旧版のデータ)または期限切れなら、注入せずに捨てる
      const age = Date.now() - data.savedAt;
      if (!(age >= 0 && age <= FINAL_DATA_TTL_MS)) {
        chrome.storage.local.remove(keys.FINAL_DATA);
        return;
      }
      executeInjection(data);
    });
  }

  checkStorageOnceOnStart();

  /**
   * 2点間の距離 (km) をハーヴァサイン公式で計算する。
   */
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // 地球の半径 (km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 入力欄のカーソル位置にテキストを挿入する。改行は段落として扱われる。
   * execCommand が使えない場合は、テキストの paste イベントで ProseMirror に取り込ませる。
   */
  function insertText(editor, text) {
    editor.focus();
    if (document.execCommand("insertText", false, text)) return;
    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", text);
    editor.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dataTransfer, bubbles: true, cancelable: true }),
    );
  }

  /**
   * 指定されたデータ（画像および構築済みプロンプトテキスト）を Claude の UI へ注入する。
   * 画像のペースト処理、テキストの流し込みを順次実行する。
   * @param {Object} data 注入対象の全データ。
   * @returns {Promise<void>}
   */
  async function executeInjection(data) {

    isStopRequested = false; // 開始時にフラグをリセット

    let inputArea = null;
    for (let i = 0; i < 20; i++) {
      if (isStopRequested) return;
      inputArea = findInputArea();
      if (inputArea) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!inputArea) return;

    inputArea.focus();

    // 1. 画像の添付
    // 添付を確認できない場合は、プロンプトだけが入った状態にせず、エラーにして止める。
    // finalData は残すので、Claude を開き直せば再試行できる。
    const images = data.mapData?.images || [];
    if (images.length === 0) {
      _attachFailed("送信する画像がありません。");
      return;
    }
    for (let i = 0; i < images.length; i++) {
      if (isStopRequested) return;

      const currentInput = findInputArea();
      const attached = currentInput
        ? await attachImageInternal(currentInput, images[i], i + 1)
        : false;
      if (!attached) {
        if (!isStopRequested) _attachFailed(`画像 ${i + 1}/${images.length} の添付を確認できませんでした。`);
        return;
      }
      if (i < images.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // 全画像の添付を確認できたので、この finalData は使用済み。Claude を開き直しても再注入しない。
    chrome.storage.local.remove(GG_CONSTANTS.STORAGE_KEYS.FINAL_DATA);

    await new Promise((r) => setTimeout(r, 1000));

    if (isStopRequested) return;

    // 2. テキストの構築
    const metadata = data.mapData?.metadata || {};
    const replacementData = {
      url: data.directUrl || "N/A",
      address: metadata.address || "N/A",
      date: metadata.date || "",
      lat: data.actualLocation?.lat || "",
      lng: data.actualLocation?.lng || "",
    };

    // --- Guess 座標の注入ロジック ---
    if (data.guessLocation && data.actualLocationFromHistory && data.actualLocation) {
      const distKm = calculateDistance(
        data.actualLocation.lat, data.actualLocation.lng,
        data.actualLocationFromHistory.lat, data.actualLocationFromHistory.lng
      );

      // 100m (0.1km) 以内の場合は、GeoGuessr から遷移してきた同一地点の解説リクエストとみなす
      if (distKm <= 0.1) {
        replacementData.guess_lat = data.guessLocation.lat;
        replacementData.guess_lng = data.guessLocation.lng;
        // 誤差距離（distance）はアドバイスの質に関与しないため提示を廃止（テンプレート維持のため空置換）
        replacementData.guess_distance = "";
      }
    }

    const templateToUse =
      data.promptTemplate ||
      (typeof GG_PROMPTS !== "undefined" ? GG_PROMPTS.DEFAULT : "");
    const promptText =
      typeof PromptBuilder !== "undefined"
        ? PromptBuilder.build(templateToUse, replacementData)
        : `GeoGuessr analysis for ${replacementData.address}\nURL: ${replacementData.url}`;

    // 3. テキストの挿入
    const finalInputArea = findInputArea();
    if (finalInputArea) {
      finalInputArea.click();
      await new Promise((r) => setTimeout(r, 100));
      insertText(finalInputArea, promptText);
    }

    // 4. 生成状態の監視開始
    // ユーザー自身による送信後、Claude の回答が完了するのをリッスン。
    setupGenerationObserver();
  }

  function _attachFailed(detail) {
    _error("Image attach failed: " + detail);
    if (window.ToastManager) {
      window.ToastManager.show(
        "GGAdviser: 画像を添付できませんでした",
        detail + " プロンプトは入力していません。Claude を開き直して再試行してください。",
        "error",
        10000,
      );
    }
  }

  // 添付の確認用スナップショット。添付 UI は DOM が変わりやすいため、
  // 入力エリア内の画像系要素の数と、貼り付けたファイル名の出現の両方を見る。
  // (claude.ai はファイル名に接頭辞を付けるため、名前は部分一致で見る)
  function _snapshotAttachments(fileName) {
    const scope = findComposer() || document.body;
    return {
      mediaCount: scope.querySelectorAll("img, canvas").length,
      hasName: scope.innerHTML.includes(fileName),
    };
  }

  function _isAttached(before, fileName) {
    const now = _snapshotAttachments(fileName);
    return now.mediaCount > before.mediaCount || (now.hasName && !before.hasName);
  }

  /**
   * 画像を貼り付け、添付が確認できるまで上限つきで再試行する。
   * @returns {Promise<boolean>} 添付を確認できたときのみ true。
   */
  async function attachImageInternal(inputArea, dataUrl, index) {
    let file;
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const type = blob.type || "image/jpeg";
      const ext = type.split("/")[1] || "jpg";
      file = new File([blob], `streetview_${index}.${ext}`, { type });
    } catch (e) {
      _error("Image decode failed", e);
      return false;
    }

    for (let attempt = 0; attempt < ATTACH_MAX_TRIES; attempt++) {
      if (isStopRequested) return false;

      const editor = findInputArea() || inputArea;
      const before = _snapshotAttachments(file.name);

      try {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        editor.focus();
        editor.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: dataTransfer, bubbles: true, cancelable: true }),
        );
      } catch (e) {
        _error("Paste dispatch failed", e);
      }

      const deadline = Date.now() + ATTACH_CONFIRM_MS;
      while (Date.now() < deadline) {
        if (isStopRequested) return false;
        await new Promise((r) => setTimeout(r, 250));
        if (_isAttached(before, file.name)) return true;
      }
      _warn(`Attach not confirmed (attempt ${attempt + 1}/${ATTACH_MAX_TRIES}).`);
    }
    return false;
  }

  /**
   * 最新の Claude の回答メッセージ要素を取得する。
   * ユーザー側の発言 (user-message) を誤検知しないよう、assistant-message のみを対象にする。
   * @returns {HTMLElement|null}
   */
  function _getLatestModelMessage() {
    const messages = document.querySelectorAll('[data-testid="assistant-message"]');
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }

  function _findStopButton() {
    const composer = findComposer();
    return composer ? composer.querySelector(STOP_BUTTON_SELECTOR) : null;
  }

  /**
   * Claude の生成状態を監視する MutationObserver のセットアップ。
   * 入力欄に停止ボタンが現れたことを検知して生成開始とし、
   * 停止ボタンが消えた時点で生成終了とみなして ResponseParser を呼び出す。
   */
  function setupGenerationObserver() {
    if (generationObserver || !parser) return;

    generationObserver = new MutationObserver(() => {
      const currentlyGenerating = !!_findStopButton();

      if (!isGenerating && currentlyGenerating) {
        isGenerating = true;

      } else if (isGenerating && !currentlyGenerating) {
        isGenerating = false;

        // テキストが落ち着くまでポーリングで待機 (最大5秒)
        (async () => {
          for (let attempt = 0; attempt < 10; attempt++) {
            const modelEl = _getLatestModelMessage();
            // 回答のコンテナがまだない、または描画が終わっていない場合は待つ
            if (!modelEl || modelEl.getAttribute("data-is-streaming") === "true") {
              await new Promise((r) => setTimeout(r, 500));
              continue;
            }

            // 回答の innerText には非表示の見出し(「Claude の応答：」)やツール使用表示が混ざる。
            // ResponseParser は最後のマーカー対を使うため、そのままでも解析できる。
            const textToParse = modelEl.innerText;
            const parseResult = parser.parse(textToParse);

            // 厳格な回収成功条件（プロンプト等への誤判定を完全に防ぐ）
            const text = textToParse || "";
            const hasMarkers = text.includes("[解説開始]") && text.includes("[解説終了]");
            const isNewText = parseResult.text && parseResult.text.trim() !== lastSentText;

            // 有効なデータが見つかり、新しくかつ解説マーカーが揃っている場合のみ送信
            if (parseResult.data && isNewText && hasMarkers) {
              lastSentText = parseResult.text.trim();

              // 正常にパース・回収できた段階でストレージから FINAL_DATA をクリーンアップする
              try {
                chrome.storage.local.remove(GG_CONSTANTS.STORAGE_KEYS.FINAL_DATA);
              } catch (e) {}

              try {
                chrome.runtime.sendMessage({
                  action: "GG_PARSED_RESPONSE",
                  data: parseResult.data,
                  text: parseResult.text,
                });
              } catch (e) {}

              if (generationObserver) {
                generationObserver.disconnect();
                generationObserver = null;
              }
              return; // 成功
            }

            // まだ見つからないか条件を満たさない場合は 500ms 待機して再試行
            await new Promise((r) => setTimeout(r, 500));
          }
          _warn("Generation ended but valid data not found after 5 seconds polling.");
        })();
      }
    });

    generationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-label", "data-is-streaming"],
    });
  }

  // 双方向通信
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (
        (request.action === "INJECT_GRID_LINK" ||
          request.action === "PASTE_PROMPT") &&
        request.text
      ) {
        const inputArea = findInputArea();
        if (inputArea) {
          inputArea.click();

          // 次の (手動) 送信のために生成オブザーバーを再アクティブ化
          // これにより、フォローアップ回答の完了を確実にリッスンできる。
          setupGenerationObserver();

          insertText(inputArea, request.text);
          sendResponse({ status: "injected" });
        } else {
          sendResponse({ status: "error", message: "Input not found" });
        }
      }

      // 停止コマンドを受信
      if (request.action === GG_CONSTANTS.ACTIONS.STOP_GENERATION) {
        // 0. 中止フラグを設定 (生成前)
        isStopRequested = true;

        // 1. ネイティブの停止ボタンをクリック
        const stopBtn = _findStopButton();
        if (stopBtn) {
          stopBtn.click();
        }

        // 2. オブザーバーを切断
        if (generationObserver) {
          generationObserver.disconnect();
          generationObserver = null;
        }

        // 3. 状態をリセット
        isGenerating = false;
      }
    });
  }

})();
