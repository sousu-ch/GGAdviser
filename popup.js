// popup.js - GGAdviser ランチャー

document.addEventListener("DOMContentLoaded", async () => {
  const openOptionsBtn = document.getElementById("open-options");
  const mapStatus = document.getElementById("map-url-status");

  // 現在のマップ URL を表示 (短縮版)
  chrome.storage.local.get("gg_map_base_url", (res) => {
    const url = res.gg_map_base_url;
    if (!url) {
      mapStatus.innerText = "未設定 (設定してください)";
      mapStatus.style.color = "#ef4444"; // 警告用の赤色
      return;
    }
    if (url.length > 30) {
      mapStatus.innerText = url.substring(0, 27) + "...";
    } else {
      mapStatus.innerText = url;
    }
  });

  // オプションページを開く
  openOptionsBtn.addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options.html"));
    }
  });
});
