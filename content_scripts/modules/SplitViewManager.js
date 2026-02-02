/**
 * SplitViewManager.js
 * 拡張機能のメインレイアウト（分割表示、サイドパネル、画像オーバーレイの連携）を管理する。
 * 旧来の iframe 方式から、直接 DOM を操作する Proxy Chat 方式への移行を統括する。
 */
class SplitViewManager {
  /**
   * SplitViewManager の初期状態を設定する。
   * デバッグモード、表示設定、および各管理クラスのインスタンス化を行う。
   */
  constructor() {
    /** @type {boolean} デバッグログの表示制御フラグ */
    this.debugMode = false;

    this.resizerHorizontal = null;
    this.resizerVertical = null;

    // Meta Hunter モード用のマネージャーをインスタンス化
    this.gridManager = new GridOverlayManager();
    this.gameUI = new GameUI();

    if (this.debugMode) {
      this.gridManager.debugMode = true;
    }

    // GameUI からのハイライト要求を監視
    window.addEventListener("GG_HIGHLIGHT_REQ", (e) => {
      this.gridManager.highlightCell(e.detail.coord, e.detail.imageIndex);
    });

    window.addEventListener("GG_SHOW_EVIDENCE_REQ", (e) => {

      // imgData に null を渡し、ストレージからの取得を強制する
      const { imgIndex, title, coord, linkId } = e.detail;
      this.gridManager.showOverlay(null, coord, title, imgIndex, linkId);
    });
  }

  // 便利なゲッター
  get uiEnabled() {
    return GG_STATE.get(GG_CONSTANTS.STORAGE_KEYS.UI_ENABLED);
  }
  get wideEnabled() {
    return GG_STATE.get(GG_CONSTANTS.STORAGE_KEYS.WIDE_ENABLED);
  }
  get quizEnabled() {
    return GG_STATE.get(GG_CONSTANTS.STORAGE_KEYS.QUIZ_MODE);
  }

  /**
   * 統一されたプレフィックスを持つ内部ログヘルパー。
   */

  _error(msg, err) {
    console.error(`[GGAdviser:ERROR] ${msg}`, err || "");
  }

  /**
   * 拡張機能の UI に必要なスタイルシートをページに注入する。
   * 「Ghost Mode」等をサポートするため、早期の呼び出しを可能にしている。
   */
  injectStylesheets() {
    if (!chrome.runtime || !chrome.runtime.getURL) return;

    const cssFiles = [
      { id: GG_CONSTANTS.SELECTORS.SPLIT_CSS_ID, path: "css/split_view.css" },
      {
        id: GG_CONSTANTS.SELECTORS.UI_COMPONENTS_CSS_ID,
        path: "css/ui_components.css",
      },
      { id: "gg-sidebar-theme-css", path: "css/sidebar_theme.css" },
    ];

    cssFiles.forEach((css) => {
      if (!document.getElementById(css.id)) {
        const link = document.createElement("link");
        link.id = css.id;
        link.rel = "stylesheet";
        link.href = chrome.runtime.getURL(css.path);
        (document.head || document.documentElement).appendChild(link);
      }
    });
  }

  /**
   * 分割表示コンポーネントおよび UI 状態の初期化。
   * @param {Function} onAnalyze - 分析（ANALYZE）ボタンがクリックされた際のコールバック
   */
  init(onAnalyze) {
    if (!window.location.pathname.startsWith("/maps/")) {
      return;
    }

    this.onAnalyze = onAnalyze;

    // グローバル状態の初期化
    GG_STATE.initialize({
      [GG_CONSTANTS.STORAGE_KEYS.UI_ENABLED]: true,
      [GG_CONSTANTS.STORAGE_KEYS.WIDE_ENABLED]: false,
      [GG_CONSTANTS.STORAGE_KEYS.QUIZ_MODE]: true,
    }).then(() => {
      this.injectStylesheets();

      // UIの初期設定
      this.applyUIState();
      this.applyWideState();

      // エントリーポイントは GG_STATE の準備完了を保証するため .then() 内に記述する
      const hash = location.hash;
      if (hash.includes("gg_mode=result")) {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () =>
            this.initResultSplitView(),
          );
        } else {
          this.initResultSplitView();
        }
      } else {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () =>
            this.initManualMode(),
          );
        } else {
          this.initManualMode();
        }
      }

      // 状態変更の監視 (UI応答の一元化)
      GG_STATE.addListener((key, value) => {
        if (key === GG_CONSTANTS.STORAGE_KEYS.UI_ENABLED) this.applyUIState();
        if (key === GG_CONSTANTS.STORAGE_KEYS.WIDE_ENABLED)
          this.applyWideState();
        if (key === GG_CONSTANTS.STORAGE_KEYS.QUIZ_MODE) {
          window.dispatchEvent(
            new CustomEvent("GG_TOGGLE_QUIZ", { detail: { enabled: value } }),
          );
        }

        // 状態を HeaderManager に伝播
        if (this.headerManager) {
          this.headerManager.updateState(this.uiEnabled, this.wideEnabled);
        }
      });

      // SPAナビゲーションのサポート: URL変更を監視
      let lastPath = window.location.pathname;
      setInterval(() => {
        if (window.location.pathname !== lastPath) {

          lastPath = window.location.pathname;
          if (lastPath.startsWith("/maps/")) {
            this.wrapContent(); // ラッピング状態を維持
            // メモ: HeaderManager は自身の再注入必要性を監視している
          }
        }
      }, 1000);
    });

    // サイドバーUI切り替え要求の監視
    window.addEventListener("GG_UI_REQ_TOGGLE_QUIZ", () => {
      this.toggleQuiz();
    });
  }

  /**
   * 自動分析ワークフロー（URL入力 -> パノラマ待機 -> 分析クリック）を処理する。
   */
  handleAutoAnalyze(targetUrl) {
    if (!targetUrl) return;

    // 新しい分析を開始する際、オーバーレイが開いていれば閉じる
    this.closeOverlay();

    // 現在の UI 状態 (ON/OFF) を尊重する。強制的に有効にしない。
    // UI が OFF の場合の予期しないレイアウトシフトを防ぐため、initManualMode() も削除しました。

    // 1. 直接 URL で検索入力をトリガー
    this.autoInputSearch(targetUrl);

    // ANALYZE ボタンの自動クリックを削除。
    // ユーザーが手動でクリックする必要があります。
  }

  initManualMode() {
    if (document.getElementById(GG_CONSTANTS.SELECTORS.GEMINI_PANEL_ID)) return;

    this.buildLayout(true); // マニュアルモードでも Gemini をロード
  }

  /**
   * 標準的なスプリットビュー初期化のエントリーポイント。
   */
  initResultSplitView() {
    if (document.getElementById(GG_CONSTANTS.SELECTORS.GEMINI_PANEL_ID)) return;

    this.buildLayout(true);
  }

  /**
   * 結果ビューを手動でトリガーする公開メソッド（例: Backgroundメッセージ経由）
   */
  showResult(targetUrl) {
    // 結果を表示する前にゴーストモード（キャプチャモード）を終了
    this.setCaptureActive(false);

    // 分析結果を表示するためUIを有効化
    this.ensureUIEnabled();

    const existingPanel = document.getElementById(
      GG_CONSTANTS.SELECTORS.GEMINI_PANEL_ID,
    );
    if (!existingPanel) {
      this.initResultSplitView();
    } else {
      // ローカルでリセットすべき iframe は存在しない。
      // 履歴のクリアやビューのリセットが必要な場合は GameUI が処理する。
      // 現状は、非表示（hidden）の場合は表示されるようにする（デフォルトでflex）。
    }
  }

  /**
   * メインレイアウト構造（パネル、スプリッター、CSS）を構築する。
   * @param {boolean} loadGemini - Geminiのiframeコンテンツを即座に描画するかどうか。
   */
  buildLayout(loadGemini) {
    if (document.getElementById(GG_CONSTANTS.SELECTORS.GEMINI_PANEL_ID)) return;

    // 1. テーマ固有のCSSファイルが読み込まれていることを確認
    this.injectStylesheets();

    // 2. メインコンテンツをラッパー内に分離
    this.wrapContent();

    const body = document.body;
    body.classList.add("gg-split-mode"); // [Main | Splitter | Panel] グリッド全体を制御

    // 右パネル（Geminiコンテナ）の作成
    const geminiPanel = document.createElement("div");
    geminiPanel.id = GG_CONSTANTS.SELECTORS.GEMINI_PANEL_ID;
    geminiPanel.style.display = "flex";
    geminiPanel.style.flexDirection = "column";

    // 垂直スプリッターハンドルの作成
    const splitter = document.createElement("div");
    splitter.id = GG_CONSTANTS.SELECTORS.SPLITTER_ID;

    // 構造要素を追加
    body.appendChild(splitter);
    body.appendChild(geminiPanel);

    // A. コントロールパネルの描画（タイトル/ボタンを含むヘッダーセクション）
    this.renderControlPanel(geminiPanel);

    // B. サイドパネル（Div）の描画 - Iframeを置換
    this.renderSidePanel(geminiPanel);

    // C. スプリッターのドラッグエンジンを初期化
    this.initSplitter(splitter);

    // D. ヘッダーコントロールの初期化（委譲）
    this.initHeaderControls();
  }

  /**
   * アプリヘッダー内の AI/WIDE 切り替えボタンを処理する HeaderControlManager を初期化する。
   */
  initHeaderControls() {
    if (this.headerManager) return;

    try {
      // 優先度チェック: クラスが利用可能か確認
      const ManagerClass =
        window.HeaderControlManager ||
        (typeof HeaderControlManager !== "undefined"
          ? HeaderControlManager
          : null);

      if (!ManagerClass) {
        this._error("HeaderControlManager class not found in global scope.");
        return;
      }

      this.headerManager = new ManagerClass({
        onToggleUI: () => this.toggleUI(),
        onToggleWide: () => this.toggleWide(),
        onReinject: () => {
          this.wrapContent();
          if (this.wideEnabled) this.initWideResizer();
        },
        initialState: {
          uiEnabled: this.uiEnabled,
          wideEnabled: this.wideEnabled,
        },
      });

      if (this.debugMode) this.headerManager.debugMode = true;

      this.headerManager.init();
      this.headerManager.updateState(this.uiEnabled, this.wideEnabled);
    } catch (e) {
      this._error("Failed to initialize HeaderControlManager", e);
    }
  }


  /**
   * Geminiパネル内の上部コントロールセクションを描画する。
   * タブシステム（チャット vs 分析）を含む。
   * @param {HTMLElement} container - パネルコンテナ。
   */
  renderControlPanel(container) {
    const header = document.createElement("div");
    header.className = GG_CONSTANTS.CLASSES.CONTROL_HEADER;
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";

    // 1. タブコンテナ（左側）
    const tabContainer = document.createElement("div");
    tabContainer.className = "gg-sidebar-tabs";
    tabContainer.style.display = "flex";
    tabContainer.style.gap = "8px";

    // Tab: Chat
    const chatTab = this.createTabButton("チャット", "chat", true);
    chatTab.onclick = () => this.switchTab("chat");

    // Tab: Meta Data
    const metaTab = this.createTabButton("分析", "meta", false);
    metaTab.onclick = () => this.switchTab("meta");

    tabContainer.appendChild(chatTab);
    tabContainer.appendChild(metaTab);

    // 2. アクションボタン（右側）
    const btn = document.createElement("button");
    btn.id = "gg-manual-analyze-btn";
    btn.className = GG_CONSTANTS.CLASSES.ANALYZE_BUTTON;
    btn.innerText = "ANALYZE";
    // サイドバー統合用のコンパクトスタイル - より目立つように更新
    btn.style.padding = "6px 14px"; // 高さを増やす
    btn.style.fontSize = "13px";
    btn.style.fontWeight = "700";
    // btn.style.flexGrow = "1"; // ユーザーフィードバックにより削除
    btn.style.marginLeft = "8px";

    btn.onclick = () => {
      // キャプチャロジックを復元
      if (this.onAnalyze) {
        this.onAnalyze();
      }
    };

    header.appendChild(tabContainer);
    header.appendChild(btn);
    container.appendChild(header);

    this.tabButtons = { chat: chatTab, meta: metaTab };
  }

  createTabButton(text, id, isActive) {
    const btn = document.createElement("button");
    btn.innerText = text;
    btn.dataset.tab = id;
    btn.className = `gg-tab-btn ${isActive ? "active" : ""}`;
    return btn;
  }

  switchTab(mode) {
    if (!this.tabButtons) return;

    // ボタンの更新
    Object.values(this.tabButtons).forEach((btn) => {
      const isActive = btn.dataset.tab === mode;
      btn.classList.toggle("active", isActive);
    });

    // コンテンツ分離のために GameUI に伝達
    if (this.gameUI) {
      this.gameUI.setTabMode(mode);
    }
  }


  /**
   * 新しい「Proxy Chat」UI用のサイドパネル(Div)を描画する。
   * 旧 Iframe を置き換える。
   * @param {HTMLElement} container - パネルコンテナ。
   */
  renderSidePanel(container) {
    // コンテンツ用ラッパー
    const contentWrapper = document.createElement("div");
    contentWrapper.className = "gg-side-panel-content";
    contentWrapper.style.flex = "1";
    contentWrapper.style.position = "relative";
    contentWrapper.style.overflow = "hidden";
    contentWrapper.style.display = "flex";
    contentWrapper.style.flexDirection = "column";

    // 1. Meta Panel (Div) - GameUI (Chat & Results) のターゲット
    const metaPanel = document.createElement("div");
    metaPanel.id = "gg-meta-panel";
    metaPanel.className = "gg-meta-panel"; // Use theme class
    metaPanel.style.width = "100%";
    metaPanel.style.height = "100%";
    metaPanel.style.overflowY = "auto";
    metaPanel.style.display = "block";
    metaPanel.style.boxSizing = "border-box";
    metaPanel.style.position = "relative";

    contentWrapper.appendChild(metaPanel);
    container.appendChild(contentWrapper);

    // 参照を更新。'chat' と 'meta' はどちらもこのパネルを指す。
    // 統合されたため、または 'chat' タブもこのパネルを表示するため。
    this.panels = { chat: metaPanel, meta: metaPanel };
  }

  /**
   * 元のページコンテンツを特定の div でラップし、拡張機能の UI から分離する。
   * アプリ固有のコンテナが見つかればそれを使用し、なければ body 直下の要素を移動する。
   */
  wrapContent() {
    // URLの二重ガード
    if (!window.location.pathname.startsWith("/maps/")) return;

    const mainWrapperId = GG_CONSTANTS.SELECTORS.MAIN_WRAPPER_ID;
    if (document.getElementById(mainWrapperId)) {
      // 既に適切にラップされているか、無効なIDが残っているかを確認
      const wrapper = document.getElementById(mainWrapperId);
      if (wrapper.children.length > 0) return;
    }

    // 戦略 1: 既存の App Container があればそれを使用 (React に最適)
    const appContainer = document.querySelector(
      GG_CONSTANTS.SELECTORS.MAP_APP_WRAPPER,
    );
    if (appContainer) {
      appContainer.id = mainWrapperId;
      return;
    }

    // 戦略 2: フォールバック（bodyの子要素を移動）
    const wrapper = document.createElement("div");
    wrapper.id = mainWrapperId;
    // 拡張機能のUI要素を除いて子要素を移動
    const children = Array.from(document.body.childNodes);
    children.forEach((child) => {
      if (
        child.id !== GG_CONSTANTS.SELECTORS.GEMINI_PANEL_ID &&
        child.id !== GG_CONSTANTS.SELECTORS.SPLITTER_ID &&
        child.tagName !== "SCRIPT" &&
        child.tagName !== "LINK"
      ) {
        wrapper.appendChild(child);
      }
    });
    document.body.appendChild(wrapper);
  }

  /**
   * ResizerEngine を使用して、ドラッグ可能なスプリッターバーのマウスイベントリスナーを設定する。
   * @param {HTMLElement} splitter - スプリッターハンドル要素。
   */
  initSplitter(splitter) {
    const geminiPanel = document.getElementById(
      GG_CONSTANTS.SELECTORS.GEMINI_PANEL_ID,
    );
    // iframeの検索は不要

    this.resizerHorizontal = new ResizerEngine({
      handle: splitter,
      direction: "horizontal",
      iframes: [], // 操作するiframeなし
      onResize: (newSize, percent) => {
        document.documentElement.style.setProperty(
          "--map-width",
          `${percent}%`,
        );
        window.dispatchEvent(new Event("resize"));
      },
    });
  }

  /**
   * UI が有効であることを保証する。リモートで分析が開始された場合などに有用。
   */
  ensureUIEnabled() {
    if (!this.uiEnabled) {
      GG_STATE.set(GG_CONSTANTS.STORAGE_KEYS.UI_ENABLED, true);
    }
  }

  /**
   * マップアプリの検索ボックスに Google Maps URL を自動入力する。
   * Google Maps API の遅延読み込みを考慮してリトライループを使用する。
   */
  autoInputSearch(manualUrl = null) {
    let targetUrl = manualUrl;
    if (!targetUrl && location.hash.includes("gg_gm_url")) {
      const hashParams = new URLSearchParams(location.hash.substring(1)); // # を削除
      targetUrl = hashParams.get("gg_gm_url");
    }

    if (!targetUrl) {
      return;
    }

    // this._debug(`autoInputSearch starting with URL: ${targetUrl}`);

    try {
      // 検索ボックスを探すリトライループ（マップが遅延読み込みされる可能性があるため）
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;

        // 入力欄を探すために一元化されたセレクタを使用
        let input = null;
        for (const selector of GG_CONSTANTS.SELECTORS.SEARCH_INPUTS) {
          input = document.querySelector(selector);
          if (input) break;
        }

        if (input) {
          clearInterval(interval);

          if (input.value === targetUrl) {
            return;
          }

          input.focus();
          input.value = targetUrl;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));

          setTimeout(() => {
            input.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                bubbles: true,
              }),
            );
            input.dispatchEvent(
              new KeyboardEvent("keypress", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                bubbles: true,
              }),
            );
            input.dispatchEvent(
              new KeyboardEvent("keyup", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                bubbles: true,
              }),
            );
          }, 200);
        } else if (attempts > 20) {
          clearInterval(interval);
        }
      }, 500);
    } catch (e) {
      this._error("Auto-input failed", e);
    }
  }

  /**
   * UI の有効状態を切り替え、設定を保存する。
   */
  toggleUI() {
    GG_STATE.set(GG_CONSTANTS.STORAGE_KEYS.UI_ENABLED, !this.uiEnabled);
  }

  /**
   * ワイドモードの状態を切り替え、設定を保存する。
   */
  toggleWide() {
    GG_STATE.set(GG_CONSTANTS.STORAGE_KEYS.WIDE_ENABLED, !this.wideEnabled);
  }

  /**
   * クイズモードの状態を切り替え、設定を保存する。
   */
  toggleQuiz() {
    GG_STATE.set(GG_CONSTANTS.STORAGE_KEYS.QUIZ_MODE, !this.quizEnabled);
  }

  /**
   * 現在のワイドモード状態をDOMに適用する（CSSとbodyクラスの注入）。
   */
  applyWideState() {
    const body = document.body;
    if (this.wideEnabled) {
      body.classList.add("gg-wide-mode");

      // レイアウト修正CSSの注入
      const cssFiles = [
        {
          id: GG_CONSTANTS.SELECTORS.WIDE_CSS_ID,
          path: "css/layout_fixer.css",
        },
        {
          id: GG_CONSTANTS.SELECTORS.UI_COMPONENTS_CSS_ID,
          path: "css/ui_components.css",
        },
      ];

      cssFiles.forEach((css) => {
        if (!document.getElementById(css.id)) {
          const link = document.createElement("link");
          link.id = css.id;
          link.rel = "stylesheet";
          link.href = chrome.runtime.getURL(css.path);
          (document.head || document.documentElement).appendChild(link);
        }
      });

      this.initWideResizer();
    } else {
      body.classList.remove("gg-wide-mode");
      const resizer = document.getElementById("gg-mmapp-resizer");
      if (resizer) resizer.remove();

      const map = document.querySelector(".map-embed");
      if (map) {
        map.style.removeProperty("flex");
        map.style.removeProperty("height");
      }
    }
  }

  // ==========================================
  // ワイドモードリサイザーエンジン
  // ==========================================

  /**
   * ResizerEngine を使用してリサイザーハンドルを注入および初期化するエントリーポイント。
   */
  initWideResizer(retryCount = 0) {
    if (!this.wideEnabled || document.getElementById("gg-mmapp-resizer"))
      return;

    const map = document.querySelector(".map-embed");

    // マップ要素がなければリトライ（最大10秒）
    if (!map) {
      if (retryCount < 10) {
        setTimeout(() => this.initWideResizer(retryCount + 1), 1000);
      }
      return;
    }

    const resizer = document.createElement("div");
    resizer.id = "gg-mmapp-resizer";

    // ユーザー提案によりシンプル化: 常にマップの直後に配置する
    map.insertAdjacentElement("afterend", resizer);

    // プレビューiframeの取得（存在すれば）
    const preview = document.querySelector(".location-preview");
    const mapIframe = map.querySelector("iframe") || map;
    const previewIframe = preview
      ? preview.querySelector(".location-preview__embed")
      : null;

    this.resizerVertical = new ResizerEngine({
      handle: resizer,
      direction: "vertical",
      iframes: [mapIframe, previewIframe], // previewIframe が null でも ResizerEngine は安全に無視する
      minSize: 150,
      maxOffset: 250,
      onResize: (newHeight) => {
        map.style.setProperty("flex", `0 0 ${newHeight}px`, "important");
        map.style.setProperty("height", `${newHeight}px`, "important");
        window.dispatchEvent(new Event("resize"));
      },
    });
  }

  /**
   * 現在のUI状態をDOMに適用する。
   */
  applyUIState() {
    if (this.uiEnabled) {
      document.body.classList.remove("gg-ui-disabled");

    } else {
      document.body.classList.add("gg-ui-disabled");

    }
  }
  /**
   * 高速キャプチャ用の「ゴーストモード」を切り替える。
   * パノラマを最大化し、他のすべてのUI要素を非表示にする。
   * @param {boolean} active - キャプチャモードがアクティブかどうか。
   */
  setCaptureActive(active) {
    if (active) {
      document.documentElement.classList.add("gg-capture-active");
      // Google Maps が新しいコンテナサイズに適応するのを助けるためにウィンドウリサイズイベントを強制発火
      window.dispatchEvent(new Event("resize"));
    } else {
      document.documentElement.classList.remove("gg-capture-active");
      // メインワールドに表示スタイルの復元を通知
      window.dispatchEvent(new CustomEvent("GG_EXIT_CAPTURE"));
      window.dispatchEvent(new Event("resize"));
    }
  }

  /**
   * メインマップラッパー（左側）の上に画像オーバーレイを表示する。
   * GridOverlayManager に委譲。
   */
  showImageOverlay(
    imgData,
    coord = null,
    title = "",
    imgIndex = -1,
    linkId = null,
  ) {
    if (!imgData) return;
    this.ensureUIEnabled();

    // GridOverlayManager へ委譲
    this.gridManager.showOverlay(imgData, coord, title, imgIndex, linkId);
  }

  closeOverlay() {
    if (this.gridManager) {
      this.gridManager.closeOverlay();
    }
  }
}
