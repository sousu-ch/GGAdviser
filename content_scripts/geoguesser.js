// Geoguesser Breakdown 画面用スクリプト
(function () {
  // console.log("GGAdviser: Content Script Loaded (Result Page Check)");
  
  // --- インターセプター戦略のグローバル状態 ---
  window.lastCapturedGameData = null;

  // --- インターセプターの注入 ---
  const interceptorScript = document.createElement("script");
  interceptorScript.src = chrome.runtime.getURL(
    "content_scripts/gg_interceptor.js",
  );
  interceptorScript.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(interceptorScript);

  // --- 定数定義 (依存性排除のためローカル定義) ---
  const LOCAL_CONSTANTS = {
    SELECTORS: {
      ROUND_ITEM: '[class*="game-summary_playedRound"]',
      SELECTED_ROUND: '[class*="game-summary_selectedRound"]',
      ANALYZE_BTN_ID: 'gg-analyze-btn',
      GAME_SUMMARY_CONTAINER: 'div[class*="buttons_buttons"]',
      ROUND_NUMBER: '[data-qa="round-number"]',
    },
    EVENTS: {
      GAME_DATA_FETCH: "GG_GAME_DATA_FETCH",
      ANALYSIS_START: "GG_ANALYSIS_START"
    },
    STORAGE_KEYS: {
      PROMPT_TEMPLATE: 'gg_prompt_template',
      LAST_GUESS_DATA: 'ggadviser_last_guess_data'
    }
  };

  const LOCAL_STYLES = {
    // Result画面用: 絶対配置で右上に配置
    RESULT_BTN: `
      cursor: pointer;
      height: 48px;
      display: inline-flex;
      align-items: center;
      position: absolute;
      right: -240px; /* カードの右側に配置するためのオフセット */
      top: 0;
      width: 220px; 
      justify-content: center;
    `,
    // Game画面用: 上端揃え、ネイティブスタイル合わせ
    GAME_BTN: (height, fontSize, fontWeight) => `
      margin: 0 !important;
      margin-left: 15px !important;
      align-self: flex-start !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
      z-index: 999999 !important;
      min-width: 200px !important;
      height: ${height} !important;
      font-size: ${fontSize} !important;
      font-weight: ${fontWeight} !important;
    `
  };

  // --- パッシブデータリスナー ---
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data && event.data.type === LOCAL_CONSTANTS.EVENTS.GAME_DATA_FETCH) {
      window.lastCapturedGameData = event.data.data;
    }
  });

  // --- 戦略の初期化 ---
  const strategies = [
    new InterceptorStrategy(),
    new NextDataStrategy(),
    new ApiV3Strategy(),
  ];

  /**
   * Geoguessr UI から現在選択されているラウンドインデックスを決定する。
   */
  function getSelectedRoundIndex(totalRounds) {
    try {
      // 1. Game Page Logic (High Priority)
      if (location.pathname.includes("/game/")) {
        const roundNumEl = document.querySelector(LOCAL_CONSTANTS.SELECTORS.ROUND_NUMBER);
        if (roundNumEl) {
           // Text usually "ROUND\n1 / 5" or "1 / 5"
           const text = roundNumEl.innerText; 
           const match = text.match(/(\d+)\s*\//);
           if (match) {
             const currentRound = parseInt(match[1], 10);
             if (!isNaN(currentRound) && currentRound > 0) {
                // console.log(`[getSelectedRoundIndex] Game Page Detected: Round ${currentRound}`);
                return currentRound - 1; 
             }
           }
        }
      }

      // 2. Duel/Game Summary Logic
      const summaryItems = Array.from(document.querySelectorAll(LOCAL_CONSTANTS.SELECTORS.ROUND_ITEM));
      const summarySelected = document.querySelector(LOCAL_CONSTANTS.SELECTORS.SELECTED_ROUND);
      
      const roundElements = summaryItems.filter(
        (el) =>
          el.className.includes("playedRound__") &&
          !el.className.includes("playedRounds"),
      );

      if (roundElements.length > 0 && summarySelected) {
        const foundIdx = roundElements.indexOf(summarySelected);
        if (foundIdx !== -1) return foundIdx;
      }

      // 3. Result Page Logic
      const resultItems = Array.from(document.querySelectorAll('[class*="coordinate-results_clickableColumn"]'));
      const resultSelected = document.querySelector('[class*="coordinate-results_selectedColumn"]');

      if (resultItems.length > 0 && resultSelected) {
          const validResultItems = resultItems.filter(el => el.innerText.match(/Round\s+\d+/i) || el.innerText.includes("Round"));
          const foundIdx = validResultItems.indexOf(resultSelected);
          if (foundIdx !== -1) return foundIdx;
          
          // Fallback: parse text from selected
          const match = resultSelected.innerText.match(/Round\s+(\d+)/i);
          if (match) {
              return parseInt(match[1], 10) - 1;
          }
      }

    } catch (e) {
      console.warn("Error determining selected round:", e);
    }
    return totalRounds - 1;
  }

  /**
   * 利用可能な戦略を反復処理してデータ抽出プロセスを調整する。
   */
  /**
   * 利用可能な戦略を反復処理してデータ抽出プロセスを調整する。
   * @param {string} [overrideGameId] - 抽出するゲームID（指定時優先）
   * @param {number} [overrideRoundIndex] - 抽出するラウンドインデックス（指定時優先）
   */
  async function extractBreakdownData(overrideGameId = null, overrideRoundIndex = null) {
    let currentGameId = overrideGameId;
    if (!currentGameId) {
      const urlMatch = location.pathname.match(
        /\/(?:duels|results|game)\/([A-Za-z0-9]+)/,
      );
      currentGameId = urlMatch ? urlMatch[1] : null;
    }

    let targetRoundIndex = overrideRoundIndex;
    if (targetRoundIndex === null) {
      targetRoundIndex = getSelectedRoundIndex(5);
    }
    
    // console.log(`[extractBreakdownData] GameID: ${currentGameId}, RoundIndex: ${targetRoundIndex} (Override: ${overrideRoundIndex})`);

    let currentStrategies = [...strategies];
    if (location.pathname.startsWith("/game/") || location.pathname.includes("/results/")) {
      currentStrategies = [
        ...strategies.filter(s => s instanceof ApiV3Strategy),
        ...strategies.filter(s => !(s instanceof ApiV3Strategy))
      ];
    }

    let errors = [];

    for (const strategy of currentStrategies) {
      try {
        const data = await strategy.extract(
          currentGameId,
          targetRoundIndex,
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

    return { error: "位置データの抽出に失敗しました。リロードしてください。" };
  }

  /**
   * 抽出されたデータを処理し、Prompt Template を付与して background へ送信する共通関数。
   */
  async function sendGameData(data, label, originalText, btn) {
    try {
      label.innerText = "分析中...";
      if (btn) {
        btn.style.pointerEvents = "none";
        btn.style.opacity = "0.5";
      }

      window.dispatchEvent(
        new CustomEvent(LOCAL_CONSTANTS.EVENTS.ANALYSIS_START),
      );

      chrome.storage.local.get(
        LOCAL_CONSTANTS.STORAGE_KEYS.PROMPT_TEMPLATE,
        (res) => {
          const template =
            res[LOCAL_CONSTANTS.STORAGE_KEYS.PROMPT_TEMPLATE] ||
            (typeof GG_PROMPTS !== "undefined" ? GG_PROMPTS.DEFAULT : "");
          data.promptTemplate = template;

          // Guessデータが存在する場合は Map Making App 連携用に Storage に保存しておく
          if (data.actualLocation && data.guessLocation) {
            chrome.storage.local.set({
              [LOCAL_CONSTANTS.STORAGE_KEYS.LAST_GUESS_DATA]: {
                actualLocation: data.actualLocation,
                guessLocation: data.guessLocation,
                timestamp: Date.now()
              }
            });
          }

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
                if (btn) {
                  btn.style.pointerEvents = "auto";
                  btn.style.opacity = "1";
                }
              }, 3000);
            },
          );
        },
      );
    } catch (err) {
      console.warn("GGAdviser: sendGameData Error", err);
      label.innerText = "ERROR";
      if (btn) {
        btn.style.pointerEvents = "auto";
        btn.style.opacity = "1";
      }
    }
  }

  // --- グローバルクリックリスナー ---
  document.addEventListener(
    "click",
    async (e) => {
      const btn = e.target.closest("[id^='" + LOCAL_CONSTANTS.SELECTORS.ANALYZE_BTN_ID + "']");
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const label = btn.querySelector(".button_label__ERkjz") || btn;
      const originalText = label.innerText;

      try {
        label.innerText = "データ取得中...";
        
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

        await sendGameData(data, label, originalText, btn);

      } catch (err) {
        console.warn("GGAdviser: Click Error", err);
        label.innerText = "ERROR";
        setTimeout(() => {
          label.innerText = originalText;
        }, 2000);
      }
    },
    true,
  );

  /**
   * Geoguessr の結果サマリーページに ANALYZE ボタンを挿入する。
   */
  function injectAnalyzeButton() {
    const buttonContainer = document.querySelector(
      LOCAL_CONSTANTS.SELECTORS.GAME_SUMMARY_CONTAINER,
    );
    if (
      !buttonContainer ||
      document.getElementById(LOCAL_CONSTANTS.SELECTORS.ANALYZE_BTN_ID)
    )
      return;

    const analyzeBtn = document.createElement("a");
    analyzeBtn.id = LOCAL_CONSTANTS.SELECTORS.ANALYZE_BTN_ID;
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
    // console.log("GGAdviser: Summary Button Injected");
  }

  /**
   * Result画面（最終結果ページ）に ANALYZE ボタンを挿入する。
   */
  function injectResultButton() {
    const card = document.querySelector('.info-card_card__y3eBq');
    if (!card) return;

    const btnId = "gg-analyze-btn-result-v2";
    if (document.getElementById(btnId)) return;

    const container = card.parentElement;
    if (!container) return;

    container.style.position = "relative";

    const analyzeBtn = document.createElement("a");
    analyzeBtn.id = btnId;
    analyzeBtn.href = "#";
    analyzeBtn.className = "next-link_anchor__CQUJ3 button_link__LWagc button_variantSecondary__hvM_F";
    analyzeBtn.style.cssText = LOCAL_STYLES.RESULT_BTN;

    const wrapper = document.createElement("div");
    wrapper.className = "button_wrapper__zayJ3";

    const label = document.createElement("span");
    label.className = "button_label__ERkjz";
    label.innerText = "Map Marking App";

    wrapper.appendChild(label);
    analyzeBtn.appendChild(wrapper);

    analyzeBtn.onclick = (e) => {
      e.preventDefault();
      const selectedCol = document.querySelector('.coordinate-results_selectedColumn__pyhOZ');
      
      let roundNumber = 1;
      if (selectedCol) {
        const roundMatch = selectedCol.innerText.match(/Round\s+(\d+)/i);
        if (roundMatch) {
          roundNumber = parseInt(roundMatch[1], 10);
        } else if (selectedCol.innerText.includes('Total')) {
          window.ToastManager?.show("通知", "Round 1 を表示します（ラウンドを選択すると切り替わります）", "info");
        }
      }

      const gameId = location.pathname.split("/").pop();
      const roundIndex = roundNumber - 1;

      (async () => {
        const originalText = label.innerText;
        label.innerText = "分析中...";
        analyzeBtn.style.opacity = "0.7";
        try {
          const breakdownData = await extractBreakdownData(gameId, roundIndex);
          if (breakdownData) {
            chrome.runtime.sendMessage({
              type: "OPEN_MAP_MAKING_APP",
              data: { ...breakdownData, promptTemplate: await getPromptTemplate() }
            });
            label.innerText = "送信完了！";
            setTimeout(() => { label.innerText = originalText; analyzeBtn.style.opacity = "1"; }, 2000);
          }
        } catch (err) {
          label.innerText = "エラー";
          setTimeout(() => { label.innerText = originalText; analyzeBtn.style.opacity = "1"; }, 2000);
        }
      })();
    };

    container.appendChild(analyzeBtn);
    // console.log("GGAdviser: Result Button Injected");
  }

  /**
   * Game画面（途中経過）の NEXT ボタン横に ANALYZE ボタンを挿入する。
   */
  function injectGameButton() {
    const anchor = Array.from(document.querySelectorAll('button, a, [role="button"], div[class*="button_button"]')).find(el => {
      const txt = (el.innerText || "").toUpperCase();
      if (txt.includes('GUESS') || el.offsetWidth === 0) return false;
      return txt.includes('VIEW RESULTS') || txt.includes('NEXT ROUND') || txt.includes('VIEW SUMMARY') || txt === 'NEXT';
    });
    
    if (!anchor) return;
    
    const btnId = LOCAL_CONSTANTS.SELECTORS.ANALYZE_BTN_ID + "-game";
    if (document.getElementById(btnId)) return;

    const container = anchor.parentElement?.parentElement;
    if (!container) return;

    const analyzeBtn = document.createElement("a");
    analyzeBtn.id = btnId;
    analyzeBtn.href = "#";
    analyzeBtn.className = "next-link_anchor__CQUJ3 button_link__LWagc button_variantSecondary__hvM_F button_sizeLargeWide__oGw78";
    
    const targetHeight = "59px";
    const targetFontSize = "20px";
    const targetFontWeight = "700";

    analyzeBtn.style.cssText = LOCAL_STYLES.GAME_BTN(targetHeight, targetFontSize, targetFontWeight);

    const wrapper = document.createElement("div");
    wrapper.className = "button_wrapper__zayJ3"; 

    const label = document.createElement("span");
    label.className = "button_label__ERkjz";
    label.innerText = "Map Marking App";
    // ラベルにもフォントスタイルを適用
    label.style.fontSize = targetFontSize;
    label.style.fontWeight = targetFontWeight;

    wrapper.appendChild(label);
    analyzeBtn.appendChild(wrapper);

    container.appendChild(analyzeBtn);
    // console.log(`GGAdviser: Game Button Injected (Fixed Style)`);
  }

  function tryInject() {
    const isSummary = location.href.includes("/summary");
    const isResult = location.pathname.includes("/results/");

    if (isSummary) {
      injectAnalyzeButton();
    }
    
    if (isResult) {
      injectResultButton();
    }

    const isGameOrResult = location.pathname.includes("/game/") || isResult;
    if (isGameOrResult) {
      injectGameButton();
    }
  }

  const uiObserver = new MutationObserver((mutations) => {
    tryInject();
  });

  /*
    MutationObserver の設定:
    - childList: DOMの追加・削除を検知 (SPA遷移)
    - characterData: テキストの変更を検知 (ラウンド数の変化など)
  */
  uiObserver.observe(document.body, { 
    childList: true, 
    subtree: true, 
    attributes: true, 
    characterData: true,
    attributeFilter: ['class'] 
  });

  setInterval(tryInject, 500);

  [0, 500, 1000, 2000, 5000].forEach(delay => {
    setTimeout(tryInject, delay);
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SHOW_TOAST") {
      window.ToastManager.show(
        request.title,
        request.message,
        request.type,
      );
    }
  });

  // Helper for getPromptTemplate (not defined in snippet but necessary for injectResultButton logic)
  function getPromptTemplate() {
     return new Promise(resolve => {
        chrome.storage.local.get(LOCAL_CONSTANTS.STORAGE_KEYS.PROMPT_TEMPLATE, res => {
           resolve(res[LOCAL_CONSTANTS.STORAGE_KEYS.PROMPT_TEMPLATE] || (typeof GG_PROMPTS !== "undefined" ? GG_PROMPTS.DEFAULT : ""));
        });
     });
  }

})();
