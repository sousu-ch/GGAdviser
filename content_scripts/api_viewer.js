/**
 * api_viewer.js
 * Map-making.app にインジェクトされるコーディネータースクリプト。
 * PanoBridge (マップ座標取得ロジック) と SplitViewManager (UI描画ロジック) を統合管理する。
 * ブラウザのバックグラウンド、および Gemini コンテンツスクリプトとのメッセージリレーを担当する。
 */

const DEBUG = false;


const _warn = (msg) => { if(DEBUG) console.warn(`[GGAdviser:App:WARN] ${msg}`); };
const _error = (msg, err) => { if(DEBUG) console.error(`[GGAdviser:App:ERROR] ${msg}`, err || ""); };



// モジュールの初期化
const bridge = new PanoBridge();
const ui = new SplitViewManager();
const gameUI = ui.gameUI; // Use the instance managed by ui

// DevTools アクセスのために Window に公開
window.bridge = bridge;
window.ui = ui;
window.gameUI = gameUI;

let remotePromptTemplate = null; // リモートトリガーからのプロンプトをキャッシュ

// ロジック開始
bridge.init();

// グリッドクエリのイベントリスナー (SplitViewManager から)
window.addEventListener(GG_CONSTANTS.EVENTS.GRID_QUERY, (e) => {
  if (e.detail && e.detail.text) {

    chrome.runtime.sendMessage({
      action: GG_CONSTANTS.ACTIONS.CTX_INJECT_QUERY,
      text: e.detail.text,
    });
  }
});

/**
 * UI の初期化を行い、分析開始時のメインハンドラーを登録する。
 * [Phase 5] 複数プロンプト管理および履歴座標（Guessデータ）の統合を含む。
 */
ui.init(async () => {


  // 停止ボタンをすぐに表示できるようにサイドバーが存在することを確認
  ui.showResult();
  if (ui.gameUI) {
    ui.gameUI.setWaitingState(true); // 修正: キャプチャ/貼り付け中に停止ボタンを有効化
  }

  // チャット履歴をクリアするための開始シグナル
  window.dispatchEvent(new CustomEvent("GG_ANALYSIS_START"));

  // 1. メインワールドから座標を取得
  try {
    let data = null;
    for (let i = 0; i < 5; i++) {
      try {
        data = await bridge.requestCurrentCoordinates();
        if (data && data.lat) break;
      } catch (err) {
        _warn(`試行 ${i + 1} 回目で座標取得に失敗しました。再試行中...`, err);
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!data)
      throw new Error(
        "5回の試行後マップ座標を取得できませんでした。パノラマはロードされていますか？",
      );



    // 最新のプロンプトリストとアクティブなプロンプトIDを取得
    const res = await chrome.storage.local.get([
      GG_CONSTANTS.STORAGE_KEYS.ACTIVE_PROMPT_ID,
      GG_CONSTANTS.STORAGE_KEYS.PROMPTS_CUSTOM,
      GG_CONSTANTS.STORAGE_KEYS.LAST_GUESS_DATA
    ]);

    const activePromptId = res[GG_CONSTANTS.STORAGE_KEYS.ACTIVE_PROMPT_ID] || (GG_PROMPTS.PRESETS.length > 0 ? GG_PROMPTS.PRESETS[0].id : null);
    const customPrompts = res[GG_CONSTANTS.STORAGE_KEYS.PROMPTS_CUSTOM] || {};
    
    // プロンプト内容の解決: カスタム編集があれば優先、なければプリセットから取得
    let promptContent = "";
    if (activePromptId) {
      const custom = customPrompts[activePromptId];
      if (custom && custom.content) {
        promptContent = custom.content;
      } else {
        const preset = (GG_PROMPTS.PRESETS || []).find(p => p.id === activePromptId);
        if (preset) {
          promptContent = preset.content;
        }
      }
    }

    data.promptTemplate = promptContent || remotePromptTemplate || "";

    // 推測座標の適用 (Step 2-1)
    const lastGuessData = res[GG_CONSTANTS.STORAGE_KEYS.LAST_GUESS_DATA];
    if (lastGuessData) {
      data.guessLocation = lastGuessData.guessLocation;
      data.actualLocationFromHistory = lastGuessData.actualLocation;
    }


    // キャプチャ前にゴーストモードに入る
    ui.setCaptureActive(true);

    // キャプチャのためにバックグラウンドへ送信 (インプレースモード)
    chrome.runtime.sendMessage(
      {
        type: GG_CONSTANTS.ACTIONS.START_CAPTURE_INPLACE,
        data: {
          ...data,
          guessLocation: data.guessLocation,
          actualLocationFromHistory: data.actualLocationFromHistory
        },
      },
      (res) => {
        if (chrome.runtime.lastError) {
          _error("キャプチャ開始失敗", chrome.runtime.lastError);
          ui.setCaptureActive(false); // エラー時に復元
          window.ToastManager.show(
            "Error",
            "背景スクリプトへの接続に失敗しました: " +
              chrome.runtime.lastError.message,
            "error",
          );
        } else {

        }
      },
    );
  } catch (e) {
    _error("分析が中断されました", e);
    window.ToastManager.show("Error", e.message, "error");
  }
});

/**
 * バックグラウンド、または他のコンテンツスクリプトからこのタブへ送られてくるメッセージのリッスン。
 * キャプチャ結果の表示、エラー回復、リモートコマンドの処理を担当する。
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === GG_CONSTANTS.ACTIONS.GG_LOG) {

  } else if (request.action === GG_CONSTANTS.ACTIONS.SHOW_RESULT) {

    ui.showResult(request.data);
    // キャプチャしたデータがストレージに準備できている状態で Gemini タブを開く
    chrome.runtime.sendMessage({
      action: "OPEN_GEMINI_TAB",
      data: {},
    });
  } else if (request.action === GG_CONSTANTS.ACTIONS.RESTORE_UI_ERROR) {

    ui.setCaptureActive(false);
    const errData = request.data || {};
    window.ToastManager.show(
      errData.title || "Capture Failed",
      errData.detail || errData.message || "An error occurred during sequential capture. Please try again.",
      "error",
    );
  } else if (request.action === GG_CONSTANTS.ACTIONS.REMOTE_ANALYZE) {

    remotePromptTemplate = request.promptTemplate;
    if (ui) ui.handleAutoAnalyze(request.url); // 自動検索トリガーを復元
  } else if (request.action === GG_CONSTANTS.ACTIONS.UNLOCK_SIDEBAR) {
    // Gemini タブが閉じられたときにサイドバーを自動でアンロック

    if (ui && ui.gameUI) {
      ui.gameUI.setWaitingState(false);
      window.ToastManager.show(
        "Recovery",
        "Geminiタブが閉じられたため、入力を復旧しました。",
        "warning",
      );
    }
  } else if (request.action === GG_CONSTANTS.ACTIONS.SHOW_TOAST) {
    window.ToastManager.show(
      request.title,
      request.message,
      request.type || "info",
    );
  } else if (request.action === "SHOW_IMAGE_OVERLAY") {

    ui.showImageOverlay(
      request.data,
      request.coord,
      request.title,
      request.imgIndex,
      request.linkId,
    );
  } else if (request.action === "GG_GAME_DATA_FETCH") {


    // テキストが確実に GameUI に渡されるようにする
    const eventData = request.data || {};
    if (request.text) {
      eventData.explanationText = request.text;
    }

    // GameUI 用の内部 Window イベントに転送
    window.dispatchEvent(
      new CustomEvent(GG_CONSTANTS.EVENTS.GAME_DATA_FETCH, {
        detail: eventData,
      }),
    );
  }

  // 双方向メッセージングリレー
  // 1. Iframe -> Main Page
  if (
    request.action === GG_CONSTANTS.EVENTS.HINT_HOVER ||
    request.action === GG_CONSTANTS.EVENTS.HINT_CLICK
  ) {

    window.dispatchEvent(
      new CustomEvent(request.action, {
        detail: {
          coord: request.coord,
          imgIndex: request.imgIndex,
          linkId: request.linkId,
        },
      }),
    );
  }
  // 2. Main Page -> Iframe
  // メモ: これはハイライト用の GridOverlayManager のパターンと一致する
  if (request.action === GG_CONSTANTS.ACTIONS.HIGHLIGHT_HINT) {

    // iframe に転送するためには、通常 gemini.js がリッスンしていることを確認する必要がある。
    // 今のところ、gemini.js がリッスンしている chrome.runtime.sendMessage を介してリレーする。
    // 実際、gemini.js はすでに chrome.runtime.onMessage をリッスンしている。
  }
});

/**
 * グリッドオーバーレイ上でのユーザーインタラクション（ホバー/クリック）を検知し、
 * 他のコンポーネント（Gemini 等）へ同期させるためにバックグラウンドへ転送する。
 */
window.addEventListener(GG_CONSTANTS.EVENTS.GRID_HOVER, (e) => {
  chrome.runtime.sendMessage({
    action: GG_CONSTANTS.EVENTS.GRID_HOVER,
    coord: e.detail.coord,
    imgIndex: e.detail.imgIndex,
    linkId: e.detail.linkId,
    isWholeImage: e.detail.isWholeImage,
  });
});
window.addEventListener(GG_CONSTANTS.EVENTS.GRID_CLICK, (e) => {
  chrome.runtime.sendMessage({
    action: GG_CONSTANTS.EVENTS.GRID_CLICK,
    coord: e.detail.coord,
    imgIndex: e.detail.imgIndex,
    linkId: e.detail.linkId,
  });
});
