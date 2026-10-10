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
   * 別のラウンドで代用はしない。特定できない場合は null を返す。
   * - /game/ はラウンド選択UIを持たないため null (API の直近プレイ済みラウンドを使う)
   * - /results/ で TOTAL 列が選択されている場合も null
   * @returns {number|null} 0始まりのラウンドインデックス。特定できなければ null。
   */
  function getSelectedRoundIndex() {
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

      // 1. Game Page Logic: /game/ はラウンド選択UIを持たないため null を返す。
      // ラウンド決定は extractBreakdownData で API の guesses.length に基づいて行う。
      if (location.pathname.includes("/game/")) {
        return null;
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
          if (posIdx === roundColCount) return null; // TOTAL 列はラウンドを特定できない

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
    return null;
  }

  /**
   * 画面に応じた戦略でデータを抽出する。
   * - /game/, /results/ (通常ゲーム): ApiV3 のみ。失敗しても他の戦略には落とさない。
   * - /duels/: Interceptor -> NextData の順に試す。
   * ラウンドを特定できない場合は、別ラウンドで代用せず { error } を返す。
   * @param {string} [overrideGameId] - 抽出するゲームID（指定時優先）
   * @param {number|null} [overrideRoundIndex] - 抽出するラウンドインデックス（指定時優先）
   * @returns {Promise<Object>} 抽出データ、または { error: string }。
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
      targetRoundIndex = getSelectedRoundIndex();
    }

    // /game/ はラウンド選択UIを持たない。null は「API 上の直近プレイ済みラウンド」を意味する。
    // それ以外でラウンドを特定できない場合は、別ラウンドで代用せずエラーにする。
    // URL には言語プレフィックスが付く(/ja/game/...)ので、先頭一致ではなく部分一致で判定する。
    const isGamePage = location.pathname.includes("/game/");
    if (targetRoundIndex === null && !isGamePage) {
      return { error: "ラウンドを特定できませんでした。ラウンドを選択してから実行してください。" };
    }

    // 通常ゲームは ApiV3 のみ(失敗時に別経路へ落とさない)。デュエルは Interceptor -> NextData。
    const isClassic = isGamePage || location.pathname.includes("/results/");
    const currentStrategies = strategies.filter((s) => isClassic === (s instanceof ApiV3Strategy));

    let unexpected = null;
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
        // 確定した失敗は、理由を表示してそこで止める(他の戦略に落とさない)
        if (e instanceof ExtractionError) {
          return { error: e.message };
        }
        if (DEBUG) {
          console.warn(
            `GGAdviser: Strategy ${strategy.constructor.name} failed:`,
            e,
          );
        }
        unexpected = e;
      }
    }

    if (unexpected) {
      return {
        error: `予期しないエラーが発生しました: ${unexpected.message} ページをリロードして再試行してください。`,
      };
    }
    return { error: "ゲームデータを取得できませんでした。" };
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

    // 本家ボタンの実寸に追従させる(画面幅やメディアクエリで寸法が変わるため)
    const syncSize = (btn) => {
      const cs = getComputedStyle(anchor);
      btn.style.setProperty("--gg-next-h", cs.height);
      btn.style.setProperty("--gg-next-fs", cs.fontSize);
    };

    const existing = document.getElementById(btnId);
    if (existing) {
      syncSize(existing);
      return;
    }

    const container = anchor.parentElement?.parentElement;
    if (!container) return;

    const analyzeBtn = document.createElement("a");
    analyzeBtn.id = btnId;
    analyzeBtn.href = "#";
    analyzeBtn.className = "gg-map-making-btn gg-btn-game";
    syncSize(analyzeBtn);

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
