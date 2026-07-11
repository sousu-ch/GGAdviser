export const DEBUG = false;

/**
 * アクティブなタブまたは指定された特定のタブに対し、トースト通知（SHOW_TOAST）を表示させる命令を送信する。
 * @param {string} title トーストのタイトル。
 * @param {string} message トーストの本文（メッセージ）。
 * @param {string} [type="info"] トーストのタイプ ("info", "success", "error", "warn")。
 * @param {number|null} [tabId=null] 送信先タブの ID。null の場合は現在のアクティブウィンドウのタブ。
 * @returns {Promise<void>}
 */
export async function sendToast(title, message, type = "info", tabId = null) {
  const payload = { action: GG_CONSTANTS.ACTIONS.SHOW_TOAST, title, message, type };
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

/**
 * Blob オブジェクトを Base64 文字列の Data URL に変換する。
 * Service Worker 環境では FileReader が使用できないため、ArrayBuffer を経由して変換を行う。
 * @param {Blob} blob 変換対象の Blob オブジェクト。
 * @returns {Promise<string>} Base64 形式の Data URL。
 */
export async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const len = bytes.byteLength;
  const CHUNK_SIZE = 0x8000; // 32KB。大きな画像でのスタックオーバーフローと過度の連結を回避
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}
