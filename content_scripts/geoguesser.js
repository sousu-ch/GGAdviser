// Geoguesser Breakdown 画面用スクリプト
(function () {
  // --- インターセプター戦略のグローバル状態 ---
  // InterceptorStrategy は、パッシブリスナーによってこれが入力されることを期待する。
  // 戦略は window.lastCapturedGameData にアクセスできる。
  window.lastCapturedGameData = null;

  // --- インターセプターの注入 ---
  // Fetch API 呼び出しをキャプチャするためにメインワールドのインターセプターを注入する
  const interceptorScript = document.createElement("script");
  interceptorScript.src = chrome.runtime.getURL(
    "content_scripts/gg_interceptor.js",
  );
  interceptorScript.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(interceptorScript);

  // --- パッシブデータリスナー ---
  // アプリが自然にデータをフェッチするたびに、最新のゲームデータを維持する。
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data && event.data.type === GG_CONSTANTS.EVENTS.GAME_DATA_FETCH) {
      window.lastCapturedGameData = event.data.data;
    }
  });

  // --- 戦略の初期化 ---
  // 戦略は manifest.json の順序でこのスクリプトの前にロードされる
  // InterceptorStrategy クラスと NextDataStrategy クラスがスコープ内で利用可能であると想定する。
  const strategies = [new InterceptorStrategy(), new NextDataStrategy()];

  /**
   * Geoguessr UI から現在選択されているラウンドインデックスを決定する。
   * 選択が見つからない場合は、最後のラウンドにフォールバックする。
   * @param {number} totalRounds - ゲームの合計ラウンド数。
   * @returns {number} 選択されたラウンドの 0 ベースのインデックス。
   */
  function getSelectedRoundIndex(totalRounds) {
    try {
      const allElements = Array.from(
        document.querySelectorAll(GG_CONSTANTS.SELECTORS.ROUND_ITEM),
      );
      const roundElements = allElements.filter(
        (el) =>
          el.className.includes("playedRound__") &&
          !el.className.includes("playedRounds"),
      );
      const selectedElement = document.querySelector(
        GG_CONSTANTS.SELECTORS.SELECTED_ROUND,
      );

      if (roundElements.length > 0 && selectedElement) {
        const foundIdx = roundElements.indexOf(selectedElement);
        if (foundIdx !== -1) {
          return foundIdx;
        }
      }
    } catch (e) {
      console.warn("Error determining selected round:", e);
    }
    return totalRounds - 1;
  }

  /**
   * 利用可能な戦略を反復処理してデータ抽出プロセスを調整する。
   * @returns {Promise<Object>} 抽出されたラウンドデータまたはエラーオブジェクト。
   */
  async function extractBreakdownData() {
    // 1. コンテキストの識別
    const urlMatch = location.pathname.match(
      /\/(?:duels|results|game)\/([0-9a-f]+)/,
    );
    const currentGameId = urlMatch ? urlMatch[1] : null;

    // デフォルトのラウンドインデックス (楽観的)
    const optimisticRoundIndex = getSelectedRoundIndex(5);

    // 2. 戦略の実行
    let errors = [];

    for (const strategy of strategies) {
      try {
        const data = await strategy.extract(
          currentGameId,
          optimisticRoundIndex,
        );

        if (data) {
          return data;
        }
      } catch (e) {
        console.warn(
          `GGAdviser: Strategy ${strategy.constructor.name} failed:`,
          e,
        );
        errors.push(e.message);
      }
    }

    // console.error("GGAdviser: すべての戦略が失敗しました。", errors);
    return { error: "位置データの抽出に失敗しました。リロードしてください。" };
  }

  // --- グローバルクリックリスナー ---
  document.addEventListener(
    "click",
    async (e) => {
      // ボタンを見つけるために上にトラバース
      const btn = e.target.closest("#" + GG_CONSTANTS.SELECTORS.ANALYZE_BTN_ID);
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const label = btn.querySelector(".button_label__ERkjz") || btn;
      const originalText = label.innerText;

      try {
        label.innerText = "データ取得中..."; // UI 状態を更新
        // 非同期データ抽出を待機
        const data = await extractBreakdownData();

        if (!data || data.error) {
          console.error("GGAdviser: Data extraction failed", data);
          window.ToastManager.show(
            "Error",
            data ? data.error : "分析データの取得に失敗しました。",
            "error",
          );
          label.innerText = "ERROR";
          setTimeout(() => {
            label.innerText = originalText;
          }, 2000);
          return;
        }

        label.innerText = "分析中...";
        btn.style.pointerEvents = "none";
        btn.style.opacity = "0.5";

        // サイドバーをクリア
        window.dispatchEvent(
          new CustomEvent(GG_CONSTANTS.EVENTS.ANALYSIS_START),
        );

        chrome.storage.local.get(
          GG_CONSTANTS.STORAGE_KEYS.PROMPT_TEMPLATE,
          (res) => {
            const template =
              res[GG_CONSTANTS.STORAGE_KEYS.PROMPT_TEMPLATE] ||
              (typeof GG_PROMPTS !== "undefined" ? GG_PROMPTS.DEFAULT : "");
            data.promptTemplate = template;

            chrome.runtime.sendMessage(
              { type: "DATA_COLLECTED", payload: data },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "GGAdviser: SendMessage Error",
                    chrome.runtime.lastError,
                  );
                  window.ToastManager.show(
                    "Error",
                    "接続が切れました。ページをリロードしてください。",
                    "error",
                  );
                  label.innerText = "ERROR";
                  return;
                }
                setTimeout(() => {
                  label.innerText = originalText;
                  btn.style.pointerEvents = "auto";
                  btn.style.opacity = "1";
                }, 3000);
              },
            );
          },
        );
      } catch (err) {
        console.warn("GGAdviser: Click Error", err);
        label.innerText = "ERROR";
      }
    },
    true,
  ); // キャプチャフェーズ

  /**
   * Geoguessr の結果サマリーページに ANALYZE ボタンを挿入する。
   * ボタンコンテナの存在を確認し、重複挿入を回避する。
   */
  function injectAnalyzeButton() {
    const buttonContainer = document.querySelector(
      GG_CONSTANTS.SELECTORS.GAME_SUMMARY_CONTAINER,
    );
    if (
      !buttonContainer ||
      document.getElementById(GG_CONSTANTS.SELECTORS.ANALYZE_BTN_ID)
    )
      return;

    const analyzeBtn = document.createElement("a");
    analyzeBtn.id = GG_CONSTANTS.SELECTORS.ANALYZE_BTN_ID;
    analyzeBtn.href = "#";
    analyzeBtn.className =
      "next-link_anchor__CQUJ3 button_link__LWagc button_variantSecondary__hvM_F";
    analyzeBtn.style.cursor = "pointer";

    const wrapper = document.createElement("div");
    wrapper.className = "button_wrapper__zayJ3";

    const label = document.createElement("span");
    label.className = "button_label__ERkjz";
    label.innerText = "Map Marking APP";

    wrapper.appendChild(label);
    analyzeBtn.appendChild(wrapper);

    buttonContainer.appendChild(analyzeBtn);
  }

  const uiObserver = new MutationObserver((mutations) => {
    if (location.href.includes("/summary")) {
      injectAnalyzeButton();
    }
  });

  uiObserver.observe(document.body, { childList: true, subtree: true });

  if (location.href.includes("/summary")) {
    setTimeout(injectAnalyzeButton, 1000);
  }
  // --- ランタイムメッセージリスナー (バックグラウンド -> コンテンツ) ---
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SHOW_TOAST") {
      window.ToastManager.show(
        request.title,
        request.message,
        request.type,
      );
    }
  });

})();
