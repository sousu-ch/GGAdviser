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

  function findSendButton() {
    return document.querySelector(
      'button[aria-label*="送信"], button[aria-label*="Send"], .send-button',
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
  /* 
  // [DELETED] ImageInjector Legacy Code
  const globalInjector =
    typeof ImageInjector !== "undefined" ? new ImageInjector() : null;
  */
  const parser =
    typeof ResponseParser !== "undefined" ? new ResponseParser() : null;

  // 生成ロジックの状態
  let generationObserver = null;
  let isGenerating = false;
  let isStopRequested = false; // 生成前のキャンセルキャンセル不可フラグ

  // 双方向同期フォーカス (グリッド -> チャット)の状態
  let currentSelected = null; // { coord, imgIndex }

  // ガード: Geminiアプリ以外では実行しない
  if (path !== "/" && !path.startsWith("/app")) {
    return;
  }

  // 二重実行防止
  if (window.__GG_GEMINI_INITIALIZED) {
    return;
  }
  window.__GG_GEMINI_INITIALIZED = true;

  // バックグラウンドからの明示的な注入コマンドを待機 (プッシュ型)
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "CMD_INJECT_DATA") {
        // データペイロードが直接送られてくる場合と、ストレージから読む場合に対応
        const data = request.data || null;

        if (data) {
          executeInjection(data);
          sendResponse({ status: "injeciton_started" });
        } else {
          // ペイロードがない場合はストレージを確認 (後方互換またはバックアップ)
          chrome.storage.local.get(GG_CONSTANTS.STORAGE_KEYS.FINAL_DATA, (res) => {
            if (res && res[GG_CONSTANTS.STORAGE_KEYS.FINAL_DATA]) {
              executeInjection(res[GG_CONSTANTS.STORAGE_KEYS.FINAL_DATA]);
            }
          });
          sendResponse({ status: "checking_storage" });
        }
      }
    });
  }

  // 初期化時に一度だけストレージを確認 (ポーリングはしない)
  // これにより、リロード直後の新しいページが自分でデータを取りに行けるようにする
  // (古いページはすでに初期化済みなので、これを実行しない -> 持ち逃げ防止)
  function checkStorageOnceOnStart() {
    if (!chrome || !chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get(GG_CONSTANTS.STORAGE_KEYS.FINAL_DATA, (res) => {
      if (res && res[GG_CONSTANTS.STORAGE_KEYS.FINAL_DATA]) {
        const data = res[GG_CONSTANTS.STORAGE_KEYS.FINAL_DATA];
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

    chrome.storage.local.remove(GG_CONSTANTS.STORAGE_KEYS.FINAL_DATA); // 開始時に移動

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
    const images = data.mapData?.images || [];
    for (let i = 0; i < images.length; i++) {
      if (isStopRequested) {

        return;
      }

      const currentInput = findInputArea();
      if (currentInput) {
        await attachImageInternal(currentInput, images[i], i + 1);
      }
      if (i < images.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    if (images.length > 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }

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

  async function attachImageInternal(inputArea, dataUrl, index) {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `streetview_${index}.png`, {
        type: "image/png",
      });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      const pasteEvent = new ClipboardEvent("paste", {
        clipboardData: dataTransfer,
        bubbles: true,
      });
      const target = inputArea.querySelector(".ql-editor") || inputArea;
      target.focus();
      target.dispatchEvent(pasteEvent);
      return true;
    } catch (e) {
      return false;
    }
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
            let textToParse = "";

            if (modelEl) {
              textToParse = modelEl.innerText;
            } else {
              // フォールバック: レンダリング初期フェーズでモデル要素がまだ見つからない場合、
              // もしくは将来のUI変更でセレクターが全滅した場合は全体の bodyText を使用する。
              // ただし、ユーザー入力エリア内のテンプレート誤判定を防を防ぐため、入力テキストを除去する。
              let bodyText = document.body.innerText;
              const inputArea = findInputArea();
              if (inputArea) {
                const inputText = inputArea.innerText || inputArea.value || "";
                if (inputText && bodyText.includes(inputText)) {
                  bodyText = bodyText.replace(inputText, "");
                }
              }
              textToParse = bodyText;
            }

            if (parser) {
              const parseResult = parser.parse(textToParse);
              // 有効なデータが見つかれば送信
              if (parseResult.data && (parseResult.data.global_clues || parseResult.data.is_fallback)) {
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
            // まだ見つからない場合は 500ms 待機して再試行
            await new Promise((r) => setTimeout(r, 500));
          }
          _warn("Generation ended but valid data not found after 5 seconds polling.");
        })();
      }
    });

    generationObserver.observe(targetNode, config);
  }

  function _isStopButtonVisible() {
    // Gemini 生成に特有の「停止」ボタンを探す
    const stopBtn = document.querySelector(
      'button[aria-label*="Stop"], button[aria-label*="停止"], button[aria-label*="生成を停止"]',
    );
    return stopBtn && stopBtn.offsetParent !== null; // 可視性をチェック
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

        // 1. ネイティブの停止ボタンをクリック
        const stopBtn = document.querySelector(
          'button[aria-label*="Stop"], button[aria-label*="停止"], button[aria-label*="生成を停止"]',
        );
        if (stopBtn && stopBtn.offsetParent !== null) {
          stopBtn.click();
          

        } else {

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

      // グリッドインタラクション
      if (request.action === GG_CONSTANTS.EVENTS.GRID_HOVER) {
        // 既存のオレンジ色のハイライトをクリア
        document
          .querySelectorAll(".gg-hint-link.gg-active-amber")
          .forEach((el) => el.classList.remove("gg-active-amber"));

        if (request.imgIndex === -1) {
          // ハードリーブ時にすべてを強制クリア
          document
            .querySelectorAll(".gg-hint-link.gg-active-blue")
            .forEach((el) => el.classList.remove("gg-active-blue"));
          currentSelected = null;
          return;
        }

        // 一時的な選択: 別のアイテムに移動する場合は青をクリア
        if (currentSelected) {
          if (
            request.imgIndex !== currentSelected.imgIndex ||
            (request.coord && request.coord !== currentSelected.coord)
          ) {
            document
              .querySelectorAll(".gg-hint-link.gg-active-blue")
              .forEach((el) => el.classList.remove("gg-active-blue"));
            currentSelected = null;
          }
        }

        // ハイライトルール
        if (request.imgIndex > 0) {
          let selector = `.gg-hint-link[data-img-index="${request.imgIndex}"]`;

          if (request.coord) {
            // テキスト側のホバー: 1対1のマッピング (マス単体)
            selector += `[data-coord="${request.coord}"]`;
          }
          // それ以外: グリッド側のホバー (coord=null) または画像全体 -> すべてハイライト

          document.querySelectorAll(selector).forEach((el) => {
            if (!el.classList.contains("gg-active-blue")) {
              el.classList.add("gg-active-amber");
            }
          });
        }
      } else if (request.action === GG_CONSTANTS.EVENTS.GRID_CLICK) {
        // 選択前にすべての状態をクリア
        document
          .querySelectorAll(
            ".gg-hint-link.gg-active-amber, .gg-hint-link.gg-active-blue",
          )
          .forEach((el) => {
            el.classList.remove("gg-active-amber", "gg-active-blue");
          });

        if (request.coord) {
          const selector = `.gg-hint-link[data-coord="${request.coord}"][data-img-index="${request.imgIndex}"]`;
          document.querySelectorAll(selector).forEach((el) => {
            el.classList.add("gg-active-blue");
          });
          currentSelected = {
            coord: request.coord,
            imgIndex: request.imgIndex,
          };
        }
      }
    });
  }

  function cleanupObservers() {
    if (generationObserver) {
      generationObserver.disconnect();
      generationObserver = null;
    }
    isGenerating = false;
  }
})();
