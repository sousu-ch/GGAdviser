/**
 * Gemini 用コンテンツスクリプト: GGAdviser (v1.1.0 対応版)
 * Gemini の入力欄への画像・テキストの転送支援、および生成完了後のレスポンスパースを担当する。
 * 堅牢な MutationObserver により、Gemini の動的な UI 変化を監視し、生成の「開始」と「終了」を正確に検知する。
 */

(function () {
  const path = window.location.pathname;

  // ヘルパー
  function findInputArea() {
    return (
      document.querySelector(".ql-editor") ||
      document.querySelector("#prompt-textarea") ||
      document.querySelector("rich-textarea")
    );
  }

  // 診断用マーカー（即時実行）
  try {
    const manifestVer = chrome.runtime.getManifest().version;
    if (document.body) {
      document.body.setAttribute("data-gg-gemini-loaded", manifestVer);
    } else {
      // bodyがまだない場合（run_at: document_startのためあり得る）
      document.addEventListener("DOMContentLoaded", () => {
        document.body.setAttribute("data-gg-gemini-loaded", manifestVer);
      });
    }
  } catch (e) {
    /* Ignore */
  }

  const DEBUG = false;
  const _warn = (msg) => { if (DEBUG) console.warn(`[GGAdviser:Gemini:WARN] ${msg}`); };
  const _error = (msg, err) => { if (DEBUG) console.error(`[GGAdviser:Gemini:ERROR] ${msg}`, err || ""); };




  // ========================================================================================================
  // グローバルシングルトン: 永続的な画像インジェクター
  // ========================================================================================================
  const parser =
    typeof ResponseParser !== "undefined" ? new ResponseParser() : null;

  // 生成ロジックの状態
  let generationObserver = null;
  let isGenerating = false;
  let isStopRequested = false; // 生成前のキャンセルキャンセル不可フラグ
  let lastSentText = ""; // Memory storage to prevent duplicate recovery

  // ガード: Geminiアプリ以外では実行しない
  if (path !== "/" && !path.startsWith("/app")) {
    return;
  }

  // 二重実行防止
  if (window.__GG_GEMINI_INITIALIZED) {
    return;
  }
  window.__GG_GEMINI_INITIALIZED = true;

  // finalData の有効期間。ANALYZE から Gemini を開くまでと、添付失敗後の開き直しを想定した長さ。
  // これを過ぎた finalData は古い解析の残りとみなし、注入せずに捨てる。
  const FINAL_DATA_TTL_MS = 10 * 60 * 1000;

  // 画像の貼り付けは、添付を確認できるまで再試行する。
  const ATTACH_MAX_TRIES = 3; // 貼り付けの試行回数の上限
  const ATTACH_CONFIRM_MS = 4000; // 1回の貼り付け後に添付を待つ時間

  // 初期化時に一度だけストレージを確認 (ポーリングはしない)
  // これにより、リロード直後の新しいページが自分でデータを取りに行けるようにする
  // (古いページはすでに初期化済みなので、これを実行しない -> 持ち逃げ防止)
  function checkStorageOnceOnStart() {
    if (!chrome || !chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get(GG_CONSTANTS.STORAGE_KEYS.FINAL_DATA, (res) => {
      if (res && res[GG_CONSTANTS.STORAGE_KEYS.FINAL_DATA]) {
        const data = res[GG_CONSTANTS.STORAGE_KEYS.FINAL_DATA];
        // 保存時刻が無い(旧版のデータ)または期限切れなら、注入せずに捨てる
        const age = Date.now() - data.savedAt;
        if (!(age >= 0 && age <= FINAL_DATA_TTL_MS)) {
          chrome.storage.local.remove(GG_CONSTANTS.STORAGE_KEYS.FINAL_DATA);
          return;
        }
        // 入力欄が見つかるまで少し待つ必要があるかもしれないが、executeInjection内で待機ロジックがあるため直接呼ぶ
        executeInjection(data);
      }
    });
  }

  checkStorageOnceOnStart();

  /**
   * 指定されたデータ（画像および構築済みプロンプトテキスト）を Gemini の UI へ注入する。
   * 送信ボタンのクリック可能性の待機、画像のペースト処理、テキストの流し込みを順次実行する。
   * @param {Object} data 注入対象の全データ。
   * @returns {Promise<void>}
   */
  async function executeInjection(data) {

    isStopRequested = false; // 開始時にフラグをリセット

    let inputArea = null;
    for (let i = 0; i < 20; i++) {
      if (isStopRequested) {

        return;
      }
      inputArea = findInputArea();
      if (inputArea) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!inputArea) return;

    inputArea.focus();

    // 1. 画像の添付
    // 添付を確認できない場合は、プロンプトだけが入った状態にせず、エラーにして止める。
    // finalData は残すので、Gemini を開き直せば再試行できる。
    const images = data.mapData?.images || [];
    if (images.length === 0) {
      _attachFailed("送信する画像がありません。");
      return;
    }
    for (let i = 0; i < images.length; i++) {
      if (isStopRequested) {

        return;
      }

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

    // 全画像の添付を確認できたので、この finalData は使用済み。Gemini を開き直しても再注入しない。
    chrome.storage.local.remove(GG_CONSTANTS.STORAGE_KEYS.FINAL_DATA);

    await new Promise((r) => setTimeout(r, 1000));

    if (isStopRequested) {

      return;
    }



    // 2. テキストの構築
    const metadata = data.mapData?.metadata || {};
    const replacementData = {
      url: data.directUrl || "N/A",
      address: metadata.address || "N/A",
      date: metadata.date || "",
      lat: data.actualLocation?.lat || "",
      lng: data.actualLocation?.lng || "",
    };

    // --- Guess 座標の注入ロジック (Step 2-2) ---
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
    let promptText =
      typeof PromptBuilder !== "undefined"
        ? PromptBuilder.build(templateToUse, replacementData)
        : `GeoGuessr analysis for ${replacementData.address}\nURL: ${replacementData.url}`;

    // --- ヘルパー: ハリス（Haversine）公式による2点間の距離計算 (km) ---
    function calculateDistance(lat1, lon1, lat2, lon2) {
      const R = 6371; // 地球の半径 (km)
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    }

    // 3. テキストの挿入
    const finalInputArea = findInputArea();
    if (finalInputArea) {
      finalInputArea.focus();
      finalInputArea.click();
      await new Promise((r) => setTimeout(r, 100));

      const startSuccess = document.execCommand(
        "insertText",
        false,
        promptText,
      );
      if (!startSuccess) finalInputArea.innerText = promptText;

      finalInputArea.dispatchEvent(new Event("input", { bubbles: true }));
      finalInputArea.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // 4. 生成状態の監視開始
    // ユーザー自身による送信後、Gemini の回答が完了するのをリッスン。
    if (parser) {
      setupGenerationObserver();
    }
  }

  function _attachFailed(detail) {
    _error("Image attach failed: " + detail);
    if (window.ToastManager) {
      window.ToastManager.show(
        "GGAdviser: 画像を添付できませんでした",
        detail + " プロンプトは入力していません。Gemini を開き直して再試行してください。",
        "error",
        10000,
      );
    }
  }

  // 添付の確認用スナップショット。Gemini の添付 UI は DOM が変わりやすいため、
  // 入力エリア内の画像系要素の数と、貼り付けたファイル名の出現の両方を見る。
  function _snapshotAttachments(fileName) {
    const scope =
      document.querySelector("input-area-v2, .input-area-container, div.input-area") ||
      document.body;
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

      const target = findInputArea() || inputArea;
      const editor = target.querySelector(".ql-editor") || target;
      const before = _snapshotAttachments(file.name);

      try {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        editor.focus();
        editor.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: dataTransfer, bubbles: true }),
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
   * Gemini の生成状態を監視する MutationObserver のセットアップ。
   * 送信ボタンが「停止ボタン」に変化したことを検知して生成開始とし、
   * ボタンが消えた、または送信ボタンに戻った時点で生成終了とみなして ResponseParser を呼び出す。
   */
  function setupGenerationObserver() {
    if (generationObserver) return;

    /**
     * 最新の AI メッセージ（Model）のコンテナ要素を特定して取得する。
     * プロンプト（User）側のテンプレートを誤検知しないための精密セレクター。
     * @returns {HTMLElement|null}
     */
    function _getLatestModelMessage() {
      // AI 回答にのみ付随するフィードバックボタン（良い回答 / Good response）をフックにする
      const feedbackButtons = document.querySelectorAll('[aria-label="良い回答"], [aria-label="Good response"], [aria-label="悪い回答"], [aria-label="Bad response"]');
      
      if (feedbackButtons.length > 0) {
        // 最後のボタン（＝最新のメッセージブロック）を特定
        const latestButton = feedbackButtons[feedbackButtons.length - 1];
        
        // ボタンが含まれるメッセージコンテナを特定（2026年最新DOMに対応するセレクター）
        const container = latestButton.closest('response-container') ||
                          latestButton.closest('.response-container') ||
                          latestButton.closest('model-response') ||
                          latestButton.closest('.model-response-container') || 
                          latestButton.closest('article');
        if (container) return container;
      }

      // フィードバックボタンがまだない（生成完了直後など）場合の代替セレクター
      const modelContainers = document.querySelectorAll('response-container, .response-container, model-response, .model-response-container, article');
      if (modelContainers.length > 0) {
        return modelContainers[modelContainers.length - 1];
      }

      return null;
    }

    const targetNode = document.body;
    const config = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-label", "style", "class"],
    };

    generationObserver = new MutationObserver((mutations) => {
      const currentlyGenerating = _isStopButtonVisible();

      if (!isGenerating && currentlyGenerating) {
        isGenerating = true;

      } else if (isGenerating && !currentlyGenerating) {
        isGenerating = false;


        // テキストが落ち着くまでポーリングで待機 (最大5秒)
        (async () => {
          for (let attempt = 0; attempt < 10; attempt++) {
            const modelEl = _getLatestModelMessage();
            if (!modelEl) {
              // まだAIの回答コンテナが出現していない場合は、次のMutationを待つために少し待機してcontinue
              await new Promise((r) => setTimeout(r, 500));
              continue;
            }

            let textToParse = modelEl.innerText;

            if (parser) {
              const parseResult = parser.parse(textToParse);
              
              // 厳格な回収成功条件（プロンプト等への誤判定を完全に防ぐ）
              const text = textToParse || "";
              const hasMarkers = text.includes("[解説開始]") && text.includes("[解説終了]");
              const isNewText = parseResult.text && parseResult.text.trim() !== lastSentText;

              // 有効なデータが見つかり、新しくかつ解説マーカーが揃っている場合のみ送信
              if (parseResult.data && isNewText && hasMarkers) {
                // メモリ上の履歴を更新
                lastSentText = parseResult.text.trim();

                // 正常にパース・回収できた段階でストレージからFINAL_DATAをクリーンアップする
                try {
                  chrome.storage.local.remove(GG_CONSTANTS.STORAGE_KEYS.FINAL_DATA);
                } catch (e) {}

                window.dispatchEvent(
                  new CustomEvent(GG_CONSTANTS.EVENTS.GAME_DATA_FETCH, {
                    detail: parseResult.data,
                  }),
                );
                try {
                  chrome.runtime.sendMessage({
                    action: "GG_PARSED_RESPONSE",
                    data: parseResult.data,
                    text: parseResult.text,
                  });
                } catch (e) {}
                // Clean up
                if (generationObserver) {
                  generationObserver.disconnect();
                  generationObserver = null;
                }
                return; // 成功
              }
            }
            // まだ見つからないか条件を満たさない場合は 500ms 待機して再試行
            await new Promise((r) => setTimeout(r, 500));
          }
          _warn("Generation ended but valid data not found after 5 seconds polling.");
        })();
      }
    });

    generationObserver.observe(targetNode, config);
  }

  function _isStopButtonVisible() {
    // 1. 送信入力エリアのラッパーを特定
    const inputAreaContainer = document.querySelector('input-area-v2, .input-area-container, div.input-area');
    if (!inputAreaContainer) return false;

    // 2. そのエリア内に停止ボタンが存在するかのみで判定（存在＝生成中。表示計算ラグ offsetParent を完全回避）
    const stopBtn = inputAreaContainer.querySelector(
      'button[aria-label*="Stop"], button[aria-label*="停止"], button[aria-label*="生成を停止"], button[aria-label*="回答を停止"]'
    );
    return !!stopBtn;
  }

  // 双方向通信とハイライト
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // コンテキスト内リンクマーク
      if (
        (request.action === "INJECT_GRID_LINK" ||
          request.action === "PASTE_PROMPT") &&
        request.text
      ) {

        const inputArea = findInputArea();
        if (inputArea) {
          inputArea.focus();
          inputArea.click();

          inputArea.click();

          // 次の (手動) 送信のために生成オブザーバーを再アクティブ化
          // これにより、フォローアップ回答の完了を確実にリッスンできる。
          if (typeof setupGenerationObserver === "function") {
            setupGenerationObserver();

          }

          const success = document.execCommand(
            "insertText",
            false,
            request.text,
          );
          if (!success) {
            if (inputArea.contentEditable === "true")
              inputArea.innerText += request.text;
            else inputArea.value += request.text;
          }
          inputArea.dispatchEvent(new Event("input", { bubbles: true }));
          inputArea.dispatchEvent(new Event("change", { bubbles: true }));
          sendResponse({ status: "injected" });
        } else {
          sendResponse({ status: "error", message: "Input not found" });
        }
      }

      // 停止コマンドを受信
      if (request.action === GG_CONSTANTS.ACTIONS.STOP_GENERATION) {


        // 0. 中止フラグを設定 (生成前)
        isStopRequested = true;

        // 1. ネイティブの停止ボタンをクリック (入力エリア内から最新のラベルを含めて探す)
        const inputArea = document.querySelector('input-area-v2, .input-area-container, div.input-area');
        const stopBtn = inputArea ? inputArea.querySelector(
          'button[aria-label*="Stop"], button[aria-label*="停止"], button[aria-label*="生成を停止"], button[aria-label*="回答を停止"]'
        ) : null;
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


        return;
      }
    });
  }

})();
