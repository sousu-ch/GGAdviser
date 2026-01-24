// GGAdviser 用 background.js (高速かつクリーンな順次キャプチャ)
importScripts("content_scripts/utils/constants.js");
importScripts("content_scripts/utils/prompts.js");
importScripts("background/services/GridOverlayService.js");

const DEBUG = false;

/**
 * アクティブなタブまたは特定のタブにトースト通知を送信するヘルパー。
 */
async function sendToast(title, message, type = "info", tabId = null) {
  const payload = { action: "SHOW_TOAST", title, message, type };
  if (tabId) {
    chrome.tabs.sendMessage(tabId, payload).catch(() => {});
  } else {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local
    .get(["gg_prompt_template", "gg_map_base_url"])
    .then((res) => {
      if (!res.gg_prompt_template) {
        // 共有定数から GeoGuessr 中心のデフォルトテンプレートを更新
        const defaultTemplate = GG_PROMPTS.DEFAULT;
        chrome.storage.local.set({ gg_prompt_template: defaultTemplate });
      }
      if (!res.gg_map_base_url) {
        chrome.storage.local.set({ gg_map_base_url: "" });
      }
    });
});

chrome.runtime.onMessageExternal.addListener(handleMessage);
chrome.runtime.onMessage.addListener(handleMessage);

// ちらつきを防ぐために注入されたタブを追跡
const injectedTabs = new Set();

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

      case "START_CAPTURE_INPLACE":
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
        // [NEW] グリッドクエリを Gemini タブにリレー (送信元タブには iframe が含まれる)
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
        const targetUrl = GG_CONSTANTS.URLS.GEMINI;
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
            // 必要に応じてウィンドウにもフォーカス
            const targetTab = await chrome.tabs.get(targetTabId);
            if (targetTab && targetTab.windowId) {
            }
          } catch (e) {
            // 自動復帰失敗
          }
        } else {
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

      case "GG_STOP_GENERATION":
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
                  .sendMessage(trackedId, { action: "GG_STOP_GENERATION" })
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

        function _broadcastStopToAnyGemini() {
          chrome.tabs.query({ url: "https://gemini.google.com/*" }, (tabs) => {
            if (tabs.length > 0) {
              const gTab = tabs[0];
              chrome.tabs
                .sendMessage(gTab.id, { action: "GG_STOP_GENERATION" })
                .catch(() => {});
            }
          });
        }
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

      default:
        break;
    }
  })();
  return true; // 非同期応答のためにチャンネルを開いたままにする
}

/**
 * Gemini タブをスマートにアクティブ化または作成するヘルパー関数
 * 不要なリロードを防ぎ、貼り付け前にロード完了を確実に待機する。
 */
async function _openOrActivateGemini(data) {
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
 * クリーンなキャプチャタブのためのフェーズ 2 初期化を処理する。
 */
async function onMapReadyForClean(tabId, data) {
  const res = await chrome.storage.local.get("captureState");
  const state = res.captureState;
  const isInPlace = state && state.isInPlace && state.tabId === tabId;

  if (!isInPlace && !injectedTabs.has(tabId)) {
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ["css/clean_view.css"],
      });

      injectedTabs.add(tabId);
    } catch (e) {
      console.error("CSS Inject failed", e);
    }
  }
  handleMapReady(tabId, data);
}

/**
 * キャプチャタブの初期ハンドシェイクを処理する。
 */
async function onMapTabReady(tabId) {
  const res = await chrome.storage.local.get("captureState");
  const state = res.captureState;

  if (state && state.tabId === tabId && state.currentIdx === 0) {
    // コンテンツスクリプトの安定性のための短い猶予期間
    setTimeout(() => {
      chrome.tabs
        .sendMessage(tabId, {
          action: "INIT_PANO",
          data: {
            lat: state.lat,
            lng: state.lng,
            heading: state.headings[0],
            pitch: 0,
            mode: "capture",
          },
        })
        .catch(() => {});
    }, 250);
  }
}

async function handleGeoGuessrAnalyze(payload) {
  const gmUrl = payload.directUrl || "";
  // 厳格な URL 強制
  // 1. 最初にユーザー設定を取得
  const storage = await chrome.storage.local.get("gg_map_base_url");
  const baseUrl = storage.gg_map_base_url;

  // 2. 厳格なチェック: 不明な場合はエラー停止
  if (!baseUrl || !baseUrl.includes("/maps/")) {
    sendToast(
      "GGAdviser: マップ設定が必要です",
      "拡張機能のオプション画面で、Map-making.app のベースURLを設定してください。",
      "error",
    );
    return;
  }

  // 3. 一致するタブのみを検索 (緩いフォールバックなし)
  const tabs = await chrome.tabs.query({ url: "*://map-making.app/maps/*" });
  const targetTab = tabs.find((t) => t.url.startsWith(baseUrl.split("#")[0]));

  if (targetTab) {
    chrome.tabs
      .sendMessage(targetTab.id, {
        action: "REMOTE_ANALYZE",
        url: gmUrl,
        promptTemplate: payload.promptTemplate,
      })
      .catch((e) => {
        // 再試行ロジックをここに追加可能だが、今のところはシンプルに保つ
      });
    chrome.tabs.update(targetTab.id, { active: true });

    // ウィンドウにもフォーカス
    if (targetTab.windowId) {
      chrome.windows
        .update(targetTab.windowId, { focused: true })
        .catch(() => {});
    }
  } else {
    // 設定された URL で新しいタブを作成
    const cleanUrl = baseUrl.split("#")[0];
    chrome.tabs.create({ url: cleanUrl, active: true }, (newTab) => {
      const listener = (tabId, changeInfo) => {
        if (tabId === newTab.id && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          // コンテンツスクリプトの初期化を少し待つ
          setTimeout(() => {
            chrome.tabs
              .sendMessage(tabId, {
                action: "REMOTE_ANALYZE",
                url: gmUrl,
                promptTemplate: payload.promptTemplate,
              })
              .catch(() => {});
          }, 1000);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }
}

async function startSequentialCapture(
  payload,
  reuseTabId = null,
  isInPlace = false,
) {
  let viewerUrlBase = "";
  let returnUrl = "";

  if (reuseTabId) {
    try {
      const currentTab = await chrome.tabs.get(reuseTabId);
      if (
        currentTab &&
        currentTab.url &&
        currentTab.url.includes("map-making.app")
      ) {
        const urlObj = new URL(currentTab.url);
        if (urlObj.pathname.includes("/maps/")) {
          // スマート自動保存と厳格な強制
          // 1. 現在の有効な URL を取得
          urlObj.hash = "";
          const detectedUrl = urlObj.toString();

          // 2. ストレージを確認
          const storage = await chrome.storage.local.get("gg_map_base_url");

          if (!storage.gg_map_base_url) {
            // Case A: 空 -> エラー停止 (ユーザーによる自動保存拒否)

            chrome.tabs
              .sendMessage(reuseTabId, {
                action: "RESTORE_UI_ERROR",
                data: {
                  title: "GGAdviser: マップ設定が必要です",
                  detail:
                    "拡張機能のオプション画面で、Map-making.app のベースURLを設定してください。",
                },
              })
              .catch(() => {});
            return; // 実行停止
          } else {
            // Case B: 設定済み -> 設定を検証として使用
            // ユーザーはマップタブ (In-Place) にいて、有効な設定も持っている (設定未完了のユーザーではない) ため、キャプチャを許可する。
            // 設定の上書きはしない。
            viewerUrlBase = storage.gg_map_base_url;
          }
        }
      }
    } catch (e) {}
  }

  // 3. 厳格な検証ロジック
  // 再利用に失敗した場合など、フォールスルーした場合は再度ストレージを確認
  if (!viewerUrlBase) {
    const storage = await chrome.storage.local.get("gg_map_base_url");
    viewerUrlBase = storage.gg_map_base_url;
  }

  if (!viewerUrlBase || !viewerUrlBase.includes("/maps/")) {
    // 再利用以外のケースやロジックがすり抜けた場合の2つ目のセーフガード
    const err = "Error: Cannot determine Map Editor URL.";

    if (reuseTabId) {
      chrome.tabs
        .sendMessage(reuseTabId, {
          action: "RESTORE_UI_ERROR",
          data: {
            title: "GGAdviser: マップ設定が必要です",
            detail:
              "拡張機能のオプション画面で、Map-making.app のベースURLを設定してください。",
          },
        })
        .catch(() => {});
    } else {
      sendToast(
        "GGAdviser: マップ設定が必要です",
        "拡張機能のオプション画面で、Map-making.app のベースURLを設定してください。",
        "error",
      );
    }
    return;
  }

  if (!returnUrl) returnUrl = viewerUrlBase;
  const headingList = [0, 90, 180, 270];

  const decodedUrl = decodeURIComponent(payload.directUrl || "");
  let coordsMatch = decodedUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!coordsMatch)
    coordsMatch = decodedUrl.match(/viewpoint=(-?\d+\.\d+),(-?\d+\.\d+)/);

  const lat = payload.lat || (coordsMatch ? coordsMatch[1] : null);
  const lng = payload.lng || (coordsMatch ? coordsMatch[2] : null);

  if (!lat || !lng) {
    return;
  }

  const cleanCaptureUrl = viewerUrlBase.split("#")[0];
  let tab;
  if (!isInPlace) {
    tab = await chrome.tabs.create({ url: cleanCaptureUrl, active: true });
  }

  const captureState = {
    tabId: isInPlace ? reuseTabId : tab.id,
    isInPlace: isInPlace,
    originalTabId: reuseTabId || payload.originalTabId,
    lat,
    lng,
    directUrl: payload.directUrl || "",
    headings: headingList,
    currentIdx: 0,
    images: [],
    displayImages: [], // [NEW] UI表示用に高解像度画像を保存
    address: payload.address,
    date: payload.date || "",
    promptTemplate: payload.promptTemplate || "",
    processing: false,
    returnUrl: returnUrl,
  };

  await chrome.storage.local.set({ captureState });

  if (isInPlace && reuseTabId) {
    chrome.tabs
      .sendMessage(reuseTabId, {
        action: "UPDATE_POV_FAST",
        data: { heading: headingList[0], pitch: 0, lat, lng },
      })
      .catch((e) => console.error("Initial Fast POV failed", e));
  }
}

async function handleMapReady(tabId, metaData) {
  let state = (await chrome.storage.local.get("captureState")).captureState;
  if (!state || state.tabId !== tabId) return;

  if (metaData && metaData.date && !state.date) {
    state.date = metaData.date;
    await chrome.storage.local.set({ captureState: state });
  }

  if (state.processing) return;
  state.processing = true;
  await chrome.storage.local.set({ captureState: state });

  // --- クォータ管理とレート制限 ---
  const now = Date.now();
  const lastCapture = state.lastCaptureStartTime || 0;
  const elapsedSinceLastStart = now - lastCapture;
  const MIN_INTERVAL = 510;

  if (elapsedSinceLastStart < MIN_INTERVAL) {
    const waitNeeded = MIN_INTERVAL - elapsedSinceLastStart;

    await new Promise((r) => setTimeout(r, waitNeeded));
  }

  state.lastCaptureStartTime = Date.now();

  try {
    const rawDataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: "jpeg",
      quality: 90,
    });

    // 画像が大きすぎる場合はリサイズする (High-DPI / 4K / 8K サポート)
    let dataUrl = await resizeImageIfNeeded(rawDataUrl, 2048, state.tabId);

    // Raw 画像 (高解像度) を UI 表示用に保存
    // メモ: クリーンに保つためにグリッドオーバーレイの前に保存する。または後でフロントエンドでオーバーレイする。
    // 計画: Raw データ。
    if (!state.displayImages) state.displayImages = [];
    state.displayImages.push(rawDataUrl);

    // グリッドオーバーレイの適用
    try {
      const gridService = new GridOverlayService();
      dataUrl = await gridService.processImage(dataUrl);
    } catch (e) {
      console.error("Grid Service Error", e);
    }

    state.images.push(dataUrl);

    state.currentIdx++;
    if (state.currentIdx < state.headings.length) {
      const nextHeading = state.headings[state.currentIdx];
      state.processing = false;
      await chrome.storage.local.set({ captureState: state });

      chrome.tabs
        .sendMessage(tabId, {
          action: state.isInPlace ? "UPDATE_POV_FAST" : "UPDATE_POV",
          data: {
            heading: nextHeading,
            pitch: 0,
            lat: state.lat,
            lng: state.lng,
          },
        })
        .catch((e) => console.error("Update POV failed", e));
    } else {
      finalizeCapture(state);
    }
  } catch (e) {
    console.error("Capture failed", e);
    const errorMsg = e.message || "Unknown error";

    if (errorMsg.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND")) {
      console.error("CRITICAL: APIクォータ超過。");
    }

    if (state.isInPlace) {
      chrome.tabs
        .sendMessage(state.tabId, {
          action: "RESTORE_UI_ERROR",
          data: { detail: errorMsg },
        })
        .catch(() => {});
    }
    state.processing = false;
    await chrome.storage.local.set({ captureState: null });
  }
}

async function finalizeCapture(state) {
  const payload = {
    mapData: {
      metadata: {
        address: state.address || "GeoGuessr Location",
        date: state.date || "",
      },
      images: state.images,
      displayImages: state.displayImages || [], // 高解像度画像を保存
    },
    directUrl: state.directUrl || state.lat + "," + state.lng,
    actualLocation: { lat: state.lat, lng: state.lng },
    promptTemplate: state.promptTemplate || "",
  };

  // [修正] 分割ストレージ戦略 (サイズ制限と永続性の回避)
  // 1. highResImages: 次のキャプチャまで永続 (UI用)
  // 2. finalData: ロジックデータ (AI用)、コンテンツスクリプトによって自動削除される

  // finalData を軽量に保つためにペイロードから displayImages を削除
  const displayImages = payload.mapData.displayImages;
  delete payload.mapData.displayImages;

  // [DEBUG] ペイロードサイズを確認
  const jsonStr = JSON.stringify(payload);
  const sizeMB = (jsonStr.length / 1024 / 1024).toFixed(2);

  // タブに通知する前にストレージの書き込みを厳密に待機
  const res = await chrome.storage.local.get("captureLogs");
  let logs = res.captureLogs || [];
  logs.push("[FINALIZE] Sequential Capture Complete (Split Mode).");

  // 同期オリエンテーションのためのメタデータ
  // 同期ビュー回転のために方位をメタデータオブジェクトにマッピング
  const highResMetadata = (state.headings || []).map((h) => ({ heading: h }));

  try {
    await chrome.storage.local.set({
      finalData: payload,
      highResImages: displayImages, // 個別のキー
      highResMetadata: highResMetadata, // 同期のために方位を保存
      captureState: null,
      // captureLogs: logs,
    });

    // [検証] 一貫性を確保するために読み戻す
    const verify = await chrome.storage.local.get("finalData");
    if (!verify.finalData) {
      throw new Error("Storage Write Verified Failed: finalData is missing.");
    }

    if (state.isInPlace) {
      chrome.tabs
        .sendMessage(state.tabId, { action: "SHOW_RESULT", data: payload })
        .catch(() => {});
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
    }
  } catch (e) {
    console.error("Storage Write Failed", e);

    // フォールバック通知を試行
    if (state.isInPlace) {
      chrome.tabs
        .sendMessage(state.tabId, {
          action: "RESTORE_UI_ERROR",
          data: {
            detail:
              "Failed to save capture data. Please try again or check storage quota.",
          },
        })
        .catch(() => {});
    }
  }
}

async function setCaptureTabs(tabs) {
  await chrome.storage.local.set({ captureTabs: tabs });
}

/**
 * base64 画像データ URL の寸法が maxDim を超える場合にリサイズする。
 * Service Worker 内の OffscreenCanvas を使用する。
 */
async function resizeImageIfNeeded(dataUrl, maxDim = 2048, tabId = null) {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    let { width, height } = bitmap;
    if (width <= maxDim && height <= maxDim) {
      return dataUrl;
    }

    // 新しい寸法を計算
    if (width > height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const resizedBlob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.85,
    });
    const finalDataUrl = await blobToDataUrl(resizedBlob);

    // サイズ縮小をコンソールにログ出力 (オプション)

    return finalDataUrl;
  } catch (e) {
    console.error("Resize failed", e);
    return dataUrl;
  }
}

/**
 * Blob を base64 データ URL に変換する。
 * (Service Worker では FileReader が使用できないため、ArrayBuffer + btoa を使用する)
 */
async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
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
            action: "GG_UNLOCK_SIDEBAR",
          })
          .catch(() => {});
      }

      // 3. 追跡 ID をクリア
      await chrome.storage.local.remove("gg_gemini_tab_id");
    }
  } catch (e) {
    console.error("[GGAdviser:BG] Error in onRemoved handler:", e);
  }
});
