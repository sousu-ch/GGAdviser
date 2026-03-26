import { sendToast } from "./bg_utils.js";
import { getActiveMapUrl } from "./bg_storage.js";

/**
 * Gemini タブをスマートにアクティブ化または作成する内部ヘルパー。
 * 既存の Gemini タブがある場合はそれを利用し、ない場合は新規作成する。
 * データ（text）が含まれる場合は、ロード完了後に注入（CMD_INJECT_DATA）を試みる。
 * @param {Object} [data] 注入するデータ（プロンプト等）を含むオブジェクト。
 * @returns {Promise<void>}
 */
export async function _openOrActivateGemini(data) {
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

  // 3. ロード待機リスナーのセットアップ (リロード/遷移の前にセットする)
  if (data && data.text) {
    const listener = (tid, changeInfo, tab) => {
      if (tid === targetTab.id && changeInfo.status === "complete") {
        // メモ: changeInfo.status === "complete" の時点で URL チェックを厳密にしすぎると失敗することがあるため
        // tabId が一致し、ロード完了した事実を信頼して注入を試みる。
        chrome.tabs.onUpdated.removeListener(listener);
        
        // ロード完了後、わずかに待ってから送信 (500ms)
        setTimeout(() => {
          chrome.tabs.sendMessage(tid, {
            action: "CMD_INJECT_DATA",
            data: null
          }).catch(e => {});
        }, 500);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  }

  // 4. 強制遷移 / リロード
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
