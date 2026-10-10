import { sendToast } from "./bg_utils.js";
import { getActiveMapUrl } from "./bg_storage.js";

/**
 * Gemini タブをスマートにアクティブ化または作成する内部ヘルパー。
 * 既存の Gemini タブがある場合はそれを利用し、ない場合は新規作成する。
 * データの注入は Gemini ページ側(gemini.js)が読込時に finalData を読んで行う。
 * @returns {Promise<void>}
 */
export async function _openOrActivateGemini() {
  const GEMINI_APP_URL = "https://gemini.google.com/app";
  const MATCH_URL_PREFIX = "https://gemini.google.com/";

  // 1. 既存のタブを検索
  const tabs = await chrome.tabs.query({ url: MATCH_URL_PREFIX + "*" });
  let targetTab = tabs.length > 0 ? tabs[0] : null;

  // 2. タブの作成または取得
  if (!targetTab) {
    targetTab = await chrome.tabs.create({ url: GEMINI_APP_URL, active: true });
  }

  // ID を保存
  if (targetTab && targetTab.id) {
    await chrome.storage.local.set({ gg_gemini_tab_id: targetTab.id });
  }

  // 3. 強制遷移 / リロード
  // URLが "https://gemini.google.com/app" と完全に一致する場合のみリロード
  // それ以外 (例: "/app/12345" のような個別チャット) はルートへ遷移させて新規チャットにする
  const isExactAppRoot = targetTab.url === GEMINI_APP_URL || targetTab.url === GEMINI_APP_URL + "/";

  if (isExactAppRoot) {
    await chrome.tabs.reload(targetTab.id);
    await chrome.tabs.update(targetTab.id, { active: true });
  } else {
    await chrome.tabs.update(targetTab.id, { url: GEMINI_APP_URL, active: true });
  }

  // ウィンドウフォーカス
  if (targetTab.windowId) {
    chrome.windows.update(targetTab.windowId, { focused: true }).catch(() => {});
  }
}

/**
 * 開いているすべての Gemini タブに対して、生成停止コマンド（GG_STOP_GENERATION）をブロードキャストする。
 * ユーザーが途中で分析を中止した場合などに使用される。
 * @returns {void}
 */
export function _broadcastStopToAnyGemini() {
  chrome.tabs.query({ url: "https://gemini.google.com/*" }, (tabs) => {
    if (tabs.length > 0) {
      const gTab = tabs[0];
      chrome.tabs
        .sendMessage(gTab.id, { action: GG_CONSTANTS.ACTIONS.STOP_GENERATION })
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
