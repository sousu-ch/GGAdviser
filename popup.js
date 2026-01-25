// popup.js - GGAdviser ランチャー

document.addEventListener("DOMContentLoaded", async () => {
  // --- Version Display ---
  const manifest = chrome.runtime.getManifest();
  const versionEl = document.getElementById("app-version");
  if (versionEl) {
    versionEl.innerText = `v${manifest.version}`;
  }
  const openOptionsBtn = document.getElementById("open-options");
  const permStatusText = document.getElementById("perm-status-text");
  const btnRequestPerm = document.getElementById("btn-request-perm");
  const permCard = document.getElementById("permission-card");

  // --- Step 2-1: 権限チェック ---
  const checkPermissions = () => {
    chrome.permissions.contains({ origins: ["<all_urls>"] }, (hasPerm) => {
      if (hasPerm) {
        permStatusText.innerText = "✅ Ready (許可済み)";
        permStatusText.style.color = "#059669"; // Green
        permCard.style.borderLeftColor = "#059669";
        btnRequestPerm.style.display = "none";
      } else {
        permStatusText.innerText = "⚠️ Setup Required (未許可)";
        permStatusText.style.color = "#ef4444"; // Red
        permCard.style.borderLeftColor = "#ef4444";
        btnRequestPerm.style.display = "block";
      }
    });
  };

  checkPermissions();

  // オプションを開く共通関数
  const openOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options.html"));
    }
  };

  btnRequestPerm.addEventListener("click", openOptions);
  openOptionsBtn.addEventListener("click", openOptions);

  // --- Step 2-2: URL設定 ---
  const mapUrlInput = document.getElementById("map-url-input");
  const saveUrlBtn = document.getElementById("save-url-btn");
  const saveStatus = document.getElementById("save-status");

  // Load
  chrome.storage.local.get("gg_map_base_url", (res) => {
    const url = res.gg_map_base_url || "";
    mapUrlInput.value = url;
  });

  // Input Event (Show save button on change)
  mapUrlInput.addEventListener("input", () => {
    saveUrlBtn.style.display = "block";
    saveStatus.innerText = "";
  });

  // Save
  saveUrlBtn.addEventListener("click", () => {
    const newUrl = mapUrlInput.value.trim();
    if (!newUrl) {
      saveStatus.innerText = "Error: URL cannot be empty";
      saveStatus.style.color = "#ef4444";
      return;
    }
    if (!newUrl.startsWith("http")) { // Basic check
      saveStatus.innerText = "Error: Invalid URL";
      saveStatus.style.color = "#ef4444";
      return;
    }

    chrome.storage.local.set({ gg_map_base_url: newUrl }, () => {
      saveStatus.innerText = "Saved!";
      saveStatus.style.color = "#059669";
      saveUrlBtn.style.display = "none"; // Hide button after save
      
      // Clear status after 2 seconds
      setTimeout(() => {
        saveStatus.innerText = "";
      }, 2000);
    });
  });
});
