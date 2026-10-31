import { sendToast } from "./bg_utils.js";
import { getActiveMapUrl } from "./bg_storage.js";

// 連携先 AI サービスごとの URL 定義。
// appUrl: 新規チャットの URL / tabPattern: 既存タブの検索 / reusePattern: プロンプト送信先に再利用するタブ。
// (Claude / ChatGPT は送信後に /chat/<id> や /c/<id> へ遷移するため、再利用の判定は新規チャットの URL に限定しない)
const AI_TARGETS = {
  [GG_CONSTANTS.AI_SERVICES.GEMINI]: {
    appUrl: GG_CONSTANTS.URLS.GEMINI,
    host: "gemini.google.com",
    tabPattern: "https://gemini.google.com/*",
    reusePattern: "https://gemini.google.com/app*",
  },
  [GG_CONSTANTS.AI_SERVICES.CLAUDE]: {
    appUrl: GG_CONSTANTS.URLS.CLAUDE,
    host: "claude.ai",
    tabPattern: "https://claude.ai/*",
    reusePattern: "https://claude.ai/*",
  },
  [GG_CONSTANTS.AI_SERVICES.CHATGPT]: {
    appUrl: GG_CONSTANTS.URLS.CHATGPT,
    host: "chatgpt.com",
    tabPattern: "https://chatgpt.com/*",
    reusePattern: "https://chatgpt.com/*",
  },
};

/**
 * 設定画面で選択された連携先 AI の定義を返す。未設定・不正値は Gemini とする。
 * @returns {Promise<{appUrl: string, host: string, tabPattern: string, reusePattern: string}>}
 */
export async function getAiTarget() {
  const key = GG_CONSTANTS.STORAGE_KEYS.AI_SERVICE;
  const res = await chrome.storage.local.get(key);
  return AI_TARGETS[res[key]] || AI_TARGETS[GG_CONSTANTS.AI_SERVICES.GEMINI];
}

/**
 * AI サービスのタブをスマートにアクティブ化または作成する内部ヘルパー。
 * 既存のタブがある場合はそれを利用し、ない場合は新規作成する。
 * データの注入は AI ページ側(gemini.js / claude.js)が読込時に finalData を読んで行う。
 * 追跡タブ ID は、サービスによらず gg_gemini_tab_id に保存する。
 * @returns {Promise<void>}
 */
export async function _openOrActivateAi() {
  const { appUrl, tabPattern } = await getAiTarget();

  // 1. 既存のタブを検索
  const tabs = await chrome.tabs.query({ url: tabPattern });
  let targetTab = tabs.length > 0 ? tabs[0] : null;

  // 2. タブの作成または取得
  if (!targetTab) {
    targetTab = await chrome.tabs.create({ url: appUrl, active: true });
  }

  // ID を保存
  if (targetTab && targetTab.id) {
    await chrome.storage.local.set({ gg_gemini_tab_id: targetTab.id });
  }

  // 3. 強制遷移 / リロード
  // URLが新規チャットの URL と完全に一致する場合のみリロード
  // それ以外 (例: "/app/12345" や "/chat/<id>" のような個別チャット) は新規チャットへ遷移させる
  const isExactAppRoot = targetTab.url === appUrl || targetTab.url === appUrl + "/";

  if (isExactAppRoot) {
    await chrome.tabs.reload(targetTab.id);
    await chrome.tabs.update(targetTab.id, { active: true });
  } else {
    await chrome.tabs.update(targetTab.id, { url: appUrl, active: true });
  }

  // ウィンドウフォーカス
  if (targetTab.windowId) {
    chrome.windows.update(targetTab.windowId, { focused: true }).catch(() => {});
  }
}

/**
 * 開いている連携先 AI のタブに対して、生成停止コマンド（GG_STOP_GENERATION）を送る。
 * ユーザーが途中で分析を中止した場合などに使用される。
 * @returns {Promise<void>}
 */
export async function _broadcastStopToAnyAi() {
  const { tabPattern } = await getAiTarget();
  chrome.tabs.query({ url: tabPattern }, (tabs) => {
    if (tabs.length > 0) {
      const aiTab = tabs[0];
      chrome.tabs
        .sendMessage(aiTab.id, { action: GG_CONSTANTS.ACTIONS.STOP_GENERATION })
        .catch(() => {});
    }
  });
}

/**
 * 指定された URL から HTML の <title> タグの内容を取得し、アドバイザー向けにクリーンアップして返す。
 * 主に Map-making.app のプロジェクト名を取得するために使用される（Phase 2）。
 * @param {Object} data 取得対象の URL を含むオブジェクト。
 * @param {Function} sendResponse フロントエンドへのレスポンス返送用関数。
 * @returns {Promise<void>}
 */
export async function handleObtainMapTitle(data, sendResponse) {
  if (data && data.mapId) {
    const mapId = data.mapId;
    
    // セキュリティ対策: mapId が安全な形式（英数字、ハイフン、アンダースコア）であることを確認
    if (!/^[a-zA-Z0-9_-]+$/.test(mapId)) {
      sendResponse({ status: "error", error: "Invalid Map ID format" });
      return;
    }

    // 宛先 URL を背景側で組み立てる（フロントからの URL 指定を排除）
    const fetchUrl = `https://map-making.app/maps/${mapId}`;

    fetch(fetchUrl)
      .then(res => res.text())
      .then(html => {
        const match = html.match(/<title>([^<]*?)<\/title>/i);
        let title = match && match[1] ? match[1].trim() : "";
        // 余分な接尾辞を除去して、純粋なマップ名だけにする
        title = title.replace(/\s*[・･·-]\s*Map Making App$/i, "").trim();
        
        sendResponse({ status: "success", title: title });
      })
      .catch(e => {
        sendResponse({ status: "error", error: e.toString() });
      });
  } else {
    sendResponse({ status: "error", error: "No URL provided" });
  }
}
