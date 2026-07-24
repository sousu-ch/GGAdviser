if (!window.location.hostname.includes("geoguessr.com")) {
  console.log("[GGAdviser] Script execution skipped on this domain.");
} else {
  (function () {
  const DEBUG = false;
  
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

  // --- パッシブデータリスナー ---
  window.addEventListener("message", (event) => {
    if (event.origin !== "https://www.geoguessr.com") return;
    if (event.source !== window) return;
    if (event.data && event.data.type === GG_CONSTANTS.EVENTS.GAME_DATA_FETCH) {
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
      // 0. URL Query Parameter Logic (Most reliable for summary pages)
      const urlParams = new URLSearchParams(window.location.search);
      const roundParam = urlParams.get('round');
      if (roundParam) {
        const r = parseInt(roundParam, 10);
        if (!isNaN(r) && r > 0) {
          return r - 1;
        }
      }

      // 1. Game Page Logic (High Priority)
      if (location.pathname.includes("/game/")) {
        // 1. 複数のセレクタを順に試して、現在のラウンド数インジケーターを取得
        // data-qa="round-number" や ハッシュ付きクラス名の両方に対応
        const selectors = GG_CONSTANTS.SELECTORS.ROUND_NUMBER.split(',').map(s => s.trim());
        let roundNumEl = null;
        for (const s of selectors) {
          roundNumEl = document.querySelector(s);
          if (roundNumEl) break;
        }

        if (roundNumEl) {
          const text = roundNumEl.innerText;
          // "ROUND 1 / 5" または "Round 1" 形式から数値を抽出
          const match = text.match(/(\d+)\s*\//) || text.match(/Round\s*(\d+)/i);
          if (match) {
            const currentRound = parseInt(match[1], 10);
            if (!isNaN(currentRound) && currentRound > 0) {
              // 調査の結果、GeoGuessrの結果画面（中間・最終とも）の表示は
              // すでに「完了したラウンド」を正確に指していることが判明したため、
              // 単純に -1 してインデックス化するだけで全てのケースで正しく動作する。
              const finalIdx = currentRound - 1;
              return finalIdx;
            }
          }
        }
      }

      // 2. Duel/Game Summary Logic
      const summaryItems = Array.from(document.querySelectorAll(GG_CONSTANTS.SELECTORS.ROUND_ITEM));
      const summarySelected = document.querySelector(GG_CONSTANTS.SELECTORS.SELECTED_ROUND);
      
      const roundElements = summaryItems.filter(
        (el) =>
          (el.className.includes("playedRound__") || el.className.includes("roundCard__")) &&
          !el.className.includes("playedRounds"),
      );

      if (roundElements.length > 0 && summarySelected) {
        const foundIdx = roundElements.indexOf(summarySelected);
        if (foundIdx !== -1) return foundIdx;
      }

      // 3. Result Page Logic (言語非依存: 選択列の位置でラウンドを判定)
      // 列は [ラウンド1..N, トータル] の順に並び、末尾がトータル列。
      // selectedColumn の clickable 列内での位置が、そのまま0始まりのラウンドインデックス。
      // 旧実装は英語 "Round N" テキストに依存していたため、日本語等で判定に失敗していた。
      const resultItems = Array.from(document.querySelectorAll('[class*="coordinate-results_clickableColumn"]'));
      const resultSelected = document.querySelector('[class*="coordinate-results_selectedColumn"]');

      if (resultItems.length > 0 && resultSelected) {
          const roundColCount = resultItems.length - 1; // 末尾はトータル列
          const posIdx = resultItems.indexOf(resultSelected);
          if (posIdx >= 0 && posIdx < roundColCount) return posIdx;

          // フォールバック: 選択列テキストの数字を抽出 (ラウンド1 / Round 1 / 第1ラウンド 等)
          const match = resultSelected.innerText.match(/(\d+)/);
          if (match) {
              const r = parseInt(match[1], 10);
              if (r > 0 && r <= resultItems.length) return r - 1;
          }
      }

    } catch (e) {
      if (DEBUG) console.warn("Error determining selected round:", e);
    }
    return totalRounds - 1;
  }

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
        if (DEBUG) {
          console.warn(
            `GGAdviser: Strategy ${strategy.constructor.name} failed:`,
            e,
          );
        }
        errors.push(e.message);
      }
    }

    return { error: "位置データの抽出に失敗しました。リロードしてください。" };
  }

  /**
   * 抽出されたデータを処理し、Prompt Template を付与して background へ送信する共通関数。
   */
  async function sendGameData(data, label, originalHTML, btn) {
    try {
      const span = label.tagName === 'SPAN' ? label : label.querySelector('span');
      if (span) span.innerText = "分析中...";
      
      if (btn) {
        btn.style.pointerEvents = "none";
        btn.style.opacity = "0.5";
      }

      window.dispatchEvent(
        new CustomEvent(GG_CONSTANTS.EVENTS.ANALYSIS_START),
      );

      chrome.storage.local.get(
        [GG_CONSTANTS.STORAGE_KEYS.ACTIVE_PROMPT_ID],
        (res) => {
          let template = "";
          const activeId = res[GG_CONSTANTS.STORAGE_KEYS.ACTIVE_PROMPT_ID];

          // ストレージから取得したプロンプトIDに基づいてテンプレートを検索
          if (activeId && typeof GG_PROMPTS !== "undefined" && GG_PROMPTS.PRESETS) {
            const preset = GG_PROMPTS.PRESETS.find(p => p.id === activeId);
            if (preset) {
              template = preset.content;
            }
          }

          // IDに紐づくプリセットが見つからない場合はデフォルトプロンプトを使用
          if (!template) {
            template = (typeof GG_PROMPTS !== "undefined" ? GG_PROMPTS.DEFAULT : "");
          }

          data.promptTemplate = template;

          // Guessデータが存在する場合は Map Making App 連携用に Storage に保存
          if (data.actualLocation && data.guessLocation) {
            chrome.storage.local.set({
              [GG_CONSTANTS.STORAGE_KEYS.LAST_GUESS_DATA]: {
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
                if (DEBUG) {
                  console.error(
                    "GGAdviser: SendMessage Error",
                    chrome.runtime.lastError,
                  );
                }
                window.ToastManager.show(
                  "Error",
                  "接続が切れました。ページをリロードしてください。",
                  "error",
                );
                if (span) span.innerText = "ERROR";
                
                // エラー表示後、2秒後に元のHTMLに復旧させる
                setTimeout(() => {
                  if (btn && originalHTML) {
                    btn.innerHTML = originalHTML;
                    btn.style.pointerEvents = "auto";
                    btn.style.opacity = "1";
                  }
                }, 2000);
                return;
              }
              setTimeout(() => {
                if (btn && originalHTML) {
                  btn.innerHTML = originalHTML;
                  btn.style.pointerEvents = "auto";
                  btn.style.opacity = "1";
                } else {
                  const span = label.tagName === 'SPAN' ? label : label.querySelector('span');
                  if (span) span.innerText = originalHTML;
                  if (btn) {
                    btn.style.pointerEvents = "auto";
                    btn.style.opacity = "1";
                  }
                }
              }, 3000);
            },
          );
        },
      );
    } catch (err) {
      if (DEBUG) console.warn("GGAdviser: sendGameData Error", err);
      if (btn && originalHTML) {
        btn.innerHTML = originalHTML;
        btn.style.pointerEvents = "auto";
        btn.style.opacity = "1";
      } else {
        const span = label.tagName === 'SPAN' ? label : label.querySelector('span');
        if (span) span.innerText = "ERROR";
        if (btn) {
          btn.style.pointerEvents = "auto";
          btn.style.opacity = "1";
        }
      }
    }
  }

  // --- グローバルクリックリスナー ---
  document.addEventListener(
    "click",
    async (e) => {
      const btn = e.target.closest("[id^='" + GG_CONSTANTS.SELECTORS.ANALYZE_BTN_ID + "']");
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const span = btn.querySelector("span") || btn;
      const originalHTML = btn.innerHTML;

      try {
        span.innerText = "データ取得中...";
        
        const data = await extractBreakdownData();

        if (!data || data.error) {
          if (DEBUG) console.error("GGAdviser: Data extraction failed", data);
          window.ToastManager.show(
            "Error",
            data ? data.error : "分析データの取得に失敗しました。",
            "error",
          );
          span.innerText = "ERROR";
          setTimeout(() => {
            btn.innerHTML = originalHTML;
          }, 2000);
          return;
        }

        await sendGameData(data, span, originalHTML, btn);

      } catch (err) {
        if (DEBUG) console.warn("GGAdviser: Click Error", err);
        span.innerText = "ERROR";
        setTimeout(() => {
          btn.innerHTML = originalHTML;
        }, 2000);
      }
    },
    true,
  );

  /**
   * Geoguessr の結果サマリーページに ANALYZE ボタンを挿入する。
   */
  function injectAnalyzeButton() {
    const buttonContainer = document.querySelector('[role="tablist"]');
    if (
      !buttonContainer ||
      document.getElementById(GG_CONSTANTS.SELECTORS.ANALYZE_BTN_ID)
    )
      return;

    const analyzeBtn = document.createElement("button");
    analyzeBtn.id = GG_CONSTANTS.SELECTORS.ANALYZE_BTN_ID;
    analyzeBtn.type = "button";
    analyzeBtn.className = "tabs_trigger__KOf2y gg-map-making-tab-btn";

    analyzeBtn.innerHTML = `
      <span>
        <span class="gg-map-making-icon"></span>
        <span class="duel-breakdown_tabLabelFull__jFgO_">Map Making App</span>
        <span class="duel-breakdown_tabLabelShort__tfiLz">MAP</span>
      </span>
    `;

    buttonContainer.appendChild(analyzeBtn);
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
    analyzeBtn.className = "gg-map-making-btn gg-btn-result";

    const label = document.createElement("span");
    label.innerText = "Map Making App";

    analyzeBtn.appendChild(label);

    // クリック処理は下部のグローバル委譲リスナー（[id^='gg-analyze-btn']）が担当する。
    container.appendChild(analyzeBtn);
  }

  /**
   * Game画面（途中経過）の NEXT ボタン横に ANALYZE ボタンを挿入する。
   */
  function injectGameButton() {
    // 言語非依存: ラウンド結果の続行ボタン(次へ/結果を見る/NEXT/VIEW RESULTS 等)は
    // 全言語で data-qa="close-round-result" を持つ。まずこれで特定する。
    let anchor = document.querySelector('[data-qa="close-round-result"]');

    // フォールバック: 将来 data-qa が変わった場合に備えたテキスト照合(英語+日本語)
    if (!anchor) {
      anchor = Array.from(document.querySelectorAll('button, a, [role="button"], div[class*="button_button"]')).find(el => {
        if (el.offsetWidth === 0) return false;
        const txt = (el.innerText || "").trim();
        const up = txt.toUpperCase();
        if (up.includes('GUESS') || txt.includes('推測')) return false;
        return up.includes('VIEW RESULTS') || up.includes('NEXT ROUND') || up.includes('VIEW SUMMARY') || up === 'NEXT'
            || txt.includes('結果を見る') || txt.includes('次へ') || txt.includes('サマリー');
      });
    }

    if (!anchor) return;
    
    const btnId = GG_CONSTANTS.SELECTORS.ANALYZE_BTN_ID + "-game";
    if (document.getElementById(btnId)) return;

    const container = anchor.parentElement?.parentElement;
    if (!container) return;

    const analyzeBtn = document.createElement("a");
    analyzeBtn.id = btnId;
    analyzeBtn.href = "#";
    analyzeBtn.className = "gg-map-making-btn gg-btn-game";

    const label = document.createElement("span");
    label.innerText = "Map Making App";
    analyzeBtn.appendChild(label);

    container.appendChild(analyzeBtn);
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
    if (request.action === GG_CONSTANTS.ACTIONS.SHOW_TOAST) {
      window.ToastManager.show(
        request.title,
        request.message,
        request.type,
      );
    }
  });

})();
}
