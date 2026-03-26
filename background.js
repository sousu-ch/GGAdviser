// GGAdviser 用 background.js (高速かつクリーンな順次キャプチャ)
import "./content_scripts/utils/constants.js";
import "./content_scripts/utils/prompts.js";
import "./background/services/GridOverlayService.js";

import { DEBUG } from "./background/modules/bg_utils.js";
import { initStorageOnInstalled } from "./background/modules/bg_storage.js";
import { 
  _openOrActivateGemini, 
  _broadcastStopToAnyGemini, 
  handleObtainMapTitle 
} from "./background/modules/bg_api.js";
import { 
  onMapReadyForClean, 
  onMapTabReady, 
  handleGeoGuessrAnalyze, 
  startSequentialCapture 
} from "./background/modules/bg_capture.js";

chrome.runtime.onInstalled.addListener(() => {
  initStorageOnInstalled();
});

chrome.runtime.onMessageExternal.addListener(handleMessage);
chrome.runtime.onMessage.addListener(handleMessage);

// 統合メッセージハンドラールーター
function handleMessage(request, sender, sendResponse) {
  const action = request.action || request.type;
  const data = request.data || request.payload;
  const tabId = sender.tab ? sender.tab.id : null;

  (async () => {
    switch (action) {
      case "PING":
        sendResponse({ status: "ok" });
        break;

      case "DATA_COLLECTED":
        handleGeoGuessrAnalyze(data);
        sendResponse({ status: "redirected_to_map" });
        break;

      case GG_CONSTANTS.ACTIONS.START_CAPTURE_INPLACE:
        startSequentialCapture(data, tabId, true);
        sendResponse({ status: "started" });
        break;

      case "MAP_READY_FOR_Clean":
        if (tabId) await onMapReadyForClean(tabId, data);
        sendResponse({ status: "received" });
        break;

      case "MAP_TAB_READY":
        if (tabId) await onMapTabReady(tabId);
        sendResponse({ status: "received" });
        break;

      case "API_VIEWER_LOADED":
        sendResponse({ status: "ack" });
        break;

      case "LOG":
        sendResponse({ status: "ok" });
        break;

      case "SHOW_IMAGE_OVERLAY":
        // 画像オーバーレイ要求をリレー (Iframe -> Main)
        if (tabId) {
          chrome.tabs
            .sendMessage(tabId, {
              action: "SHOW_IMAGE_OVERLAY",
              data: data,
              coord: request.coord,
              title: request.title,
              imgIndex: request.imgIndex,
              linkId: request.linkId,
            })
            .catch(() => {});
        }
        sendResponse({ status: "relayed" });
        break;

      case "CTX_INJECT_QUERY":
        // グリッドクエリを Gemini タブにリレー (送信元タブには iframe が含まれる)
        if (sender.tab) {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "INJECT_GRID_LINK",
            text: request.text,
          });
        }
        sendResponse({ status: "relayed" });
        break;

      case "SEND_TO_GEMINI":
        // タブの再利用とリロードなしの送信
        const targetUrl = self.GG_CONSTANTS ? self.GG_CONSTANTS.URLS.GEMINI : "https://gemini.google.com/app";
        const prompt = request.prompt;

        // 1. 既存の Gemini タブを見つける
        chrome.tabs.query({ url: targetUrl + "*" }, (tabs) => {
          const existingTab = tabs.length > 0 ? tabs[0] : null;

          if (existingTab) {
            // A. 再利用ロジック
            // タブにフォーカス (リロードなし)
            chrome.tabs.update(existingTab.id, { active: true }, () => {
              // フォーカスが落ち着くまで少し待ち、メッセージを送信
              setTimeout(() => {
                chrome.tabs.sendMessage(existingTab.id, {
                  action: "PASTE_PROMPT",
                  text: prompt,
                });
              }, 500);
            });
          } else {
            // B. 新しいタブのロジック (フォールバック)
            chrome.tabs.create({ url: targetUrl }, async (tab) => {
              // 新しいタブの ID を追跡
              if (tab && tab.id) {
                await chrome.storage.local.set({ gg_gemini_tab_id: tab.id });
              }
            });
          }
        });
        sendResponse({ status: "processed" });
        break;

      case "GG_PARSED_RESPONSE":
        // パースされたゲームデータをマップタブにリレーして自動復帰
        // 1. オリジンタブ ID を取得
        const storageRes = await chrome.storage.local.get("gg_origin_tab_id");
        let targetTabId = storageRes.gg_origin_tab_id;

        // フォールバック: ID がない場合はクエリを実行
        if (!targetTabId) {
          const mapTabs = await chrome.tabs.query({
            url: "*://map-making.app/maps/*",
          });
          if (mapTabs.length > 0) targetTabId = mapTabs[0].id;
        }

        if (targetTabId) {
          // 2. データを転送 (テキストを含む)
          chrome.tabs
            .sendMessage(targetTabId, {
              action: "GG_GAME_DATA_FETCH",
              data: data,
              text: request.text,
            })
            .catch((e) => {});

          // 3. 自動復帰 (タブ切り替え)
          try {
            await chrome.tabs.update(targetTabId, { active: true });
          } catch (e) {
            // 自動復帰失敗
          }
        }
        sendResponse({ status: "forwarded" });
        break;

      case "GG_HINT_HOVER":
      case "GG_HINT_CLICK":
      case "GG_GRID_CLICK":
        // 同一タブ内のコンテキスト間で同期イベントをリレー
        if (tabId) {
          chrome.tabs.sendMessage(tabId, request).catch(() => {});
        }
        sendResponse({ status: "relayed" });
        break;

      case GG_CONSTANTS.ACTIONS.STOP_GENERATION:
        // 停止コマンドを Gemini タブにリレー
        // 最適化: 可能であれば追跡 ID を使用
        chrome.storage.local.get("gg_gemini_tab_id", (res) => {
          const trackedId = res.gg_gemini_tab_id;
          if (trackedId) {
            chrome.tabs.get(trackedId, (tab) => {
              if (
                !chrome.runtime.lastError &&
                tab &&
                tab.url &&
                tab.url.includes("gemini.google.com")
              ) {
                chrome.tabs
                  .sendMessage(trackedId, { action: GG_CONSTANTS.ACTIONS.STOP_GENERATION })
                  .catch(() => {});
              } else {
                // フォールバック: 追跡タブがない場合はクエリを実行
                _broadcastStopToAnyGemini();
              }
            });
          } else {
            _broadcastStopToAnyGemini();
          }
        });
        sendResponse({ status: "processed" });
        break;

      case "OPEN_GEMINI_TAB":
        // Gemini タブを開くかフォーカスし、オリジンを保存
        if (tabId) {
          // 自動復帰のためにマップタブ ID をオリジンとして保存
          await chrome.storage.local.set({ gg_origin_tab_id: tabId });
        }
        await _openOrActivateGemini(data);
        sendResponse({ status: "opening" });
        break;

      case "OBTAIN_MAP_TITLE":
        // [Phase 2] URLからHTMLの<title>を取得するAPI
        await handleObtainMapTitle(data, sendResponse);
        break;

      default:
        break;
    }
  })();
  return true; // 非同期応答のためにチャンネルを開いたままにする
}

// タブのライフサイクルとゾンビのクリーンアップ (ファイルの最後に追加)
chrome.tabs.onRemoved.addListener(async (removedTabId, removeInfo) => {
  try {
    const res = await chrome.storage.local.get([
      "gg_gemini_tab_id",
      "gg_origin_tab_id",
    ]);
    const geminiId = res.gg_gemini_tab_id;
    const mapId = res.gg_origin_tab_id;

    if (geminiId && removedTabId === geminiId) {
      // 1. ゾンビデータを削除 (F2にとって重要)
      await chrome.storage.local.remove("finalData");

      // 2. サイドバーをアンロック
      if (mapId) {
        chrome.tabs
          .sendMessage(mapId, {
            action: GG_CONSTANTS.ACTIONS.UNLOCK_SIDEBAR,
          })
          .catch(() => {});
      }

      // 3. 追跡 ID をクリア
      await chrome.storage.local.remove("gg_gemini_tab_id");
    }
  } catch (e) {
    if (DEBUG) console.error("[GGAdviser:BG] Error in onRemoved handler:", e);
  }
});

// --- マップ名の自動同期機能 (Map Making App) ---
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // ページがロード完了し、URLが対象かつタイトルが存在する場合
  if (changeInfo.status === "complete" && tab.url && tab.url.includes("map-making.app/maps/") && tab.title) {
    const cleanUrl = tab.url.split("#")[0];
    const currentTitle = tab.title.replace(/\s*[・･·-]\s*Map Making App$/i, "").trim();
    
    if (currentTitle) {
      try {
        const storage = await chrome.storage.local.get("gg_maps_list");
        let mapsList = storage.gg_maps_list || [];
        let updated = false;
        
        mapsList = mapsList.map(mapData => {
          // 同じURLで名前が変わっている場合のみ更新
          if (mapData.url === cleanUrl && mapData.name !== currentTitle) {
            mapData.name = currentTitle;
            updated = true;
          }
          return mapData;
        });
        
        // 変更があった場合のみ保存
        if (updated) {
          await chrome.storage.local.set({ gg_maps_list: mapsList });
        }
      } catch (e) {
        // ignore
      }
    }
  }
});
