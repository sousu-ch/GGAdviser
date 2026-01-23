/**
 * PanoBridge.js
 * ページ内スクリプト (インジェクトされたスクリプト) とコンテンツスクリプト間の通信ブリッジ。
 * パノラマデータの取得や POV (視点) の更新イベントを仲介する。
 */
class PanoBridge {
  constructor() {
    this.mainScriptInjected = false;

  }

  init() {

    if (!window.GG_CONSTANTS) {
      console.error("GGAdviser: FATAL - GG_CONSTANTS not found!");
      return;
    }
    chrome.runtime.sendMessage({
      action: "MAP_TAB_READY",
      url: window.location.href,
    });
    window.addEventListener(GG_CONSTANTS.EVENTS.PANO_READY, (e) => {

      chrome.runtime.sendMessage({
        action: "MAP_READY_FOR_Clean",
        data: e.detail,
      });
    });
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "INIT_PANO" && request.data) {

        this.injectPanoScript(request.data);
      } else if (request.action === "UPDATE_POV" && request.data) {

        window.dispatchEvent(
          new CustomEvent("GG_UPDATE_POV", { detail: request.data }),
        );
      } else if (request.action === "UPDATE_POV_FAST" && request.data) {

        window.dispatchEvent(
          new CustomEvent("GG_SET_POV_FAST", { detail: request.data }),
        );
      } else if (request.action === "GG_LOG") {

      }
    });
  }

  injectPanoScript(data) {

    window.dispatchEvent(new CustomEvent("GG_MANUAL_INJECT", { detail: data }));
    this.mainScriptInjected = true;
  }

  requestCurrentCoordinates() {
    return new Promise((resolve, reject) => {
      const handler = (e) => {
        window.removeEventListener("GG_MAP_DATA_RESPONSE", handler);
        const result = e.detail;
        if (result.success && result.data) {
          resolve(result.data);
        } else {
          reject(
            new Error(result.error || "Unknown error extracting map data"),
          );
        }
      };
      setTimeout(() => {
        window.removeEventListener("GG_MAP_DATA_RESPONSE", handler);
        reject(new Error("Timeout waiting for map data. Is the map loaded?"));
      }, 2000);
      window.addEventListener("GG_MAP_DATA_RESPONSE", handler);
      window.dispatchEvent(new CustomEvent("GG_REQUEST_MAP_DATA"));
    });
  }
}
window.PanoBridge = PanoBridge;
