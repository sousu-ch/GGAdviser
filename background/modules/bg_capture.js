import { sendToast, blobToDataUrl, DEBUG } from "./bg_utils.js";
import { getActiveMapUrl } from "./bg_storage.js";
import { ImageMergeService } from "../services/ImageMergeService.js";

/**
 * キャプチャ用タブのロード完了時（ハンドシェイク）の初期メッセージ送信。
 * パノラマビューの初期位置（第1方位）を設定する。
 * @param {number} tabId 対象のタブ ID。
 * @returns {Promise<void>}
 */
export async function onMapTabReady(tabId) {
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

/**
 * GeoGuessr の分析リクエストを処理し、地図編集画面のタブを制御する。
 * 適切なタブがない場合は新規作成し、分析開始メッセージ（REMOTE_ANALYZE）を送信する。
 * @param {Object} payload 分析に必要なデータ（URL、プロンプトテンプレート等）。
 * @returns {Promise<void>}
 */
export async function handleGeoGuessrAnalyze(payload) {
  const gmUrl = payload.directUrl || "";
  // 厳格な URL 強制
  // 1. 最初にユーザー設定を取得
  const baseUrl = await getActiveMapUrl();

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
        action: GG_CONSTANTS.ACTIONS.REMOTE_ANALYZE,
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
                action: GG_CONSTANTS.ACTIONS.REMOTE_ANALYZE,
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

/**
 * 4方位のシーケンシャルキャプチャプロセスを開始する。
 * 座標の解析、ストレージ状態の初期化、および必要に応じた新規タブの作成を行う。
 * @param {Object} payload 座標、住所、プロンプト設定等を含むデータ。
 * @param {number|null} [reuseTabId=null] 再利用する既存タブの ID。
 * @param {boolean} [isInPlace=false] 既存タブ内で実行するかどうか。
 * @returns {Promise<void>}
 */
export async function startSequentialCapture(
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
          const baseUrl = await getActiveMapUrl();

          if (!baseUrl) {
            // Case A: 空 -> エラー停止

            chrome.tabs
              .sendMessage(reuseTabId, {
                action: GG_CONSTANTS.ACTIONS.RESTORE_UI_ERROR,
                data: {
                  title: "GGAdviser: マップ設定が必要です",
                  detail:
                    "拡張機能のオプション画面から、マップを追加してアクティブにしてください。",
                },
              })
              .catch(() => {});
            return; // 実行停止
          } else {
            // Case B: 設定済み -> 設定を検証として使用
            viewerUrlBase = baseUrl;
          }
        }
      }
    } catch (e) {}
  }

  // 3. 厳格な検証ロジック
  // 再利用に失敗した場合など、フォールスルーした場合は再度ストレージを確認
  if (!viewerUrlBase) {
    viewerUrlBase = await getActiveMapUrl();
  }

  if (!viewerUrlBase || !viewerUrlBase.includes("/maps/")) {
    // 再利用以外のケースやロジックがすり抜けた場合の2つ目のセーフガード
    const err = "Error: Cannot determine Map Editor URL.";

    if (reuseTabId) {
      chrome.tabs
        .sendMessage(reuseTabId, {
          action: GG_CONSTANTS.ACTIONS.RESTORE_UI_ERROR,
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

  const captureState = {
    tabId: reuseTabId,
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
    guessLocation: payload.guessLocation || null, // [NEW] プレイヤーの予想座標
    actualLocationFromHistory: payload.actualLocationFromHistory || null, // [NEW] 距離チェック用の前回の正解座標
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
      .catch((e) => {
        if (DEBUG) console.error("Initial Fast POV failed", e);
      });
  }
}

/**
 * 個別の静止画キャプチャ実行と次の方位への遷移を制御するメインループ。
 * 1つの方位をキャプチャし、グリッド重畳処理を行い、完了した場合は finalizeCapture へ移行する。
 * @param {number} tabId キャプチャ対象のタブ ID。
 * @param {Object} [metaData] タブから送られてきた更新メタデータ。
 * @returns {Promise<void>}
 */
export async function handleMapReady(tabId, metaData) {
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

  // [v1.0.3] 権限チェックを追加
  let hasPermission = false;
  try {
    hasPermission = await new Promise((r) =>
      chrome.permissions.contains({ origins: ["<all_urls>"] }, r),
    );
  } catch (e) {
    if (DEBUG) console.error("Permission check failed", e);
  }

  if (!hasPermission) {
    chrome.tabs
      .sendMessage(tabId, {
        action: GG_CONSTANTS.ACTIONS.RESTORE_UI_ERROR,
        data: {
          title: "キャプチャ権限が必要です",
          detail:
            "この機能を利用するには、拡張機能の設定画面でキャプチャ権限を許可してください。\n(設定画面 -> 🔐 権限とプライバシー)",
        },
      })
      .catch(() => {});
    
    // 処理状態をリセットして終了
    state.processing = false;
    await chrome.storage.local.set({ captureState: null });
    return;
  }

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
      const gridService = new self.GridOverlayService();
      dataUrl = await gridService.processImage(dataUrl);
    } catch (e) {
      if (DEBUG) console.error("Grid Service Error", e);
    }

    state.images.push(dataUrl);

    state.currentIdx++;
    if (state.currentIdx < state.headings.length) {
      const nextHeading = state.headings[state.currentIdx];
      state.processing = false;
      await chrome.storage.local.set({ captureState: state });

      chrome.tabs
        .sendMessage(tabId, {
          action: "UPDATE_POV_FAST",
          data: {
            heading: nextHeading,
            pitch: 0,
            lat: state.lat,
            lng: state.lng,
          },
        })
        .catch((e) => {
          if (DEBUG) console.error("Update POV failed", e);
        });
    } else {
      finalizeCapture(state);
    }
  } catch (e) {
    if (DEBUG) console.error("Capture failed", e);
    const errorMsg = e.message || "Unknown error";

    if (errorMsg.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND")) {
      if (DEBUG) console.error("CRITICAL: APIクォータ超過。");
    }

    if (state.isInPlace) {
      chrome.tabs
        .sendMessage(state.tabId, {
          action: GG_CONSTANTS.ACTIONS.RESTORE_UI_ERROR,
          data: { detail: errorMsg },
        })
        .catch(() => {});
    }
    state.processing = false;
    await chrome.storage.local.set({ captureState: null });
  }
}

/**
 * すべての方位のキャプチャ完了後の最終処理。
 * 画像の結合（Phase 3）、高解像度画像の保存、および結果表示画面（map-making.app 上の UI）への遷移を行う。
 * @param {Object} state 完了したキャプチャセッションの状態オブジェクト。
 * @returns {Promise<void>}
 */
export async function finalizeCapture(state) {
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
    guessLocation: state.guessLocation, // [NEW]
    actualLocationFromHistory: state.actualLocationFromHistory, // [NEW]
    promptTemplate: state.promptTemplate || "",
    savedAt: Date.now(), // Gemini 側で古い finalData を捨てる判定に使う
  };

  // [修正] 分割ストレージ戦略 (サイズ制限と永続性の回避)
  // 1. highResImages: 次のキャプチャまで永続 (UI用)
  // 2. finalData: ロジックデータ (AI用)、コンテンツスクリプトによって自動削除される

  // finalData を軽量に保つためにペイロードから displayImages を削除
  const displayImages = payload.mapData.displayImages;
  delete payload.mapData.displayImages;

  // --- [Phase 3] 画像結合処理の実行 ---
  let combinedDataUrl = null;
  try {
    const merger = new ImageMergeService();
    combinedDataUrl = await merger.createCombinedPanorama(state.images);
  } catch (e) {
    if (DEBUG) console.error("Image Merge Failed, falling back to original logic", e);
  }

  // Gemini送信用にペイロードを上書き (結合に成功した場合)
  if (combinedDataUrl) {
    payload.mapData.images = [combinedDataUrl]; // 4枚から1枚へ
  }

  // 同期オリエンテーションのためのメタデータ
  // 同期ビュー回転のために方位をメタデータオブジェクトにマッピング
  const highResMetadata = (state.headings || []).map((h) => ({ heading: h }));

  try {
    await chrome.storage.local.set({
      finalData: payload,
      highResImages: displayImages, // 個別のキー
      highResMetadata: highResMetadata, // 同期のために方位を保存
      captureState: null,
    });

    // [検証] 一貫性を確保するために読み戻す
    const verify = await chrome.storage.local.get("finalData");
    if (!verify.finalData) {
      throw new Error("Storage Write Verified Failed: finalData is missing.");
    }

    if (state.isInPlace) {
      chrome.tabs
        .sendMessage(state.tabId, { action: GG_CONSTANTS.ACTIONS.SHOW_RESULT, data: payload })
        .catch(() => {});
    }
  } catch (e) {
    if (DEBUG) console.error("Storage Write Failed", e);

    // フォールバック通知を試行
    if (state.isInPlace) {
      chrome.tabs
        .sendMessage(state.tabId, {
          action: GG_CONSTANTS.ACTIONS.RESTORE_UI_ERROR,
          data: {
            detail:
              "Failed to save capture data. Please try again or check storage quota.",
          },
        })
        .catch(() => {});
    }
  }
}

/**
 * 画像サイズが指定された最大寸法を超える場合に、OffscreenCanvas を利用してリサイズを行う。
 * ブラウザの VRAM 負荷軽減および Gemini API の入力制限回避のために使用される。
 * @param {string} dataUrl リサイズ対象の Base64 画像データ。
 * @param {number} [maxDim=2048] 最大辺の長さ。
 * @param {number|null} [tabId=null] 文脈把握用のタブ ID（デバッグ用）。
 * @returns {Promise<string>} リサイズ済み（またはそのまま）の Base64 画像データ。
 */
export async function resizeImageIfNeeded(dataUrl, maxDim = 2048, tabId = null) {
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
    if (DEBUG) console.error("Resize failed", e);
    return dataUrl;
  }
}
