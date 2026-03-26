/**
 * popup.js
 * GGAdviser のポップアップ UI 制御スクリプト。
 * 権限状態の表示、アクティブな地図の切り替え、および分析プロンプトの即時切り替えを担当する。
 */

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

  /**
   * 拡張機能の権限（all_urls）の状態を確認し、UI の警告表示を更新する。
   */
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

  /**
   * オプション画面を開く共通関数。
   */
  const openOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options.html"));
    }
  };

  btnRequestPerm.addEventListener("click", openOptions);
  openOptionsBtn.addEventListener("click", openOptions);

  // --- アクティブマップの表示と切り替え機能 ---
  const mapSelect = document.getElementById("map-select");
  const saveStatus = document.getElementById("map-select-status");

  // Load Maps
  chrome.storage.local.get(["gg_maps_list", "gg_active_map_id"], (res) => {
    const mapsList = res.gg_maps_list || [];
    const activeMapId = res.gg_active_map_id || null;

    mapSelect.innerHTML = ""; // Clear existing options

    if (mapsList.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.disabled = true;
      option.selected = true;
      option.textContent = "詳細設定から地図を追加してください";
      mapSelect.appendChild(option);
      mapSelect.disabled = true;
      return;
    }

    mapsList.forEach(mapData => {
      const option = document.createElement("option");
      option.value = mapData.id;
      option.textContent = mapData.name;
      if (mapData.id === activeMapId) {
        option.selected = true;
      }
      mapSelect.appendChild(option);
    });
  });

  // --- プロンプトの表示と切り替え機能 ---
  const promptSelect = document.getElementById("prompt-select");
  const promptSaveStatus = document.getElementById("prompt-select-status");
  const keys = GG_CONSTANTS.STORAGE_KEYS;

  // Load Prompts (Phase 5 Hybrid)
  chrome.storage.local.get([keys.ACTIVE_PROMPT_ID, keys.PROMPTS_CUSTOM], (res) => {
    if (!promptSelect) return;
    
    const activePromptId = res[keys.ACTIVE_PROMPT_ID] || (GG_PROMPTS.PRESETS.length > 0 ? GG_PROMPTS.PRESETS[0].id : null);
    const customPrompts = res[keys.PROMPTS_CUSTOM] || {};
    const presets = GG_PROMPTS.PRESETS || [];

    promptSelect.innerHTML = "";

    if (presets.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.disabled = true;
      option.selected = true;
      option.textContent = "プロンプトプリセットが見つかりません";
      promptSelect.appendChild(option);
      promptSelect.disabled = true;
      return;
    }

    presets.forEach(p => {
      const option = document.createElement("option");
      option.value = p.id;
      
      // カスタム名があれば優先、なければプリセット名
      const custom = customPrompts[p.id];
      option.textContent = (custom && custom.name) ? custom.name : p.name;
      
      if (p.id === activePromptId) {
        option.selected = true;
      }
      promptSelect.appendChild(option);
    });
  });

  // Map Change Event
  if (mapSelect) {
    mapSelect.addEventListener("change", (e) => {
      const selectedId = e.target.value;
      if (!selectedId) return;

      chrome.storage.local.set({ [GG_CONSTANTS.STORAGE_KEYS.ACTIVE_MAP_ID]: selectedId }, () => {
        saveStatus.innerText = "変更しました!";
        setTimeout(() => {
          saveStatus.innerText = "";
        }, 2000);
      });
    });
  }

  // Prompt Change Event
  if (promptSelect) {
    promptSelect.addEventListener("change", (e) => {
      const selectedId = e.target.value;
      if (!selectedId) return;

      chrome.storage.local.set({ [GG_CONSTANTS.STORAGE_KEYS.ACTIVE_PROMPT_ID]: selectedId }, () => {
        promptSaveStatus.innerText = "切り替えました!";
        setTimeout(() => {
          promptSaveStatus.innerText = "";
        }, 2000);
      });
    });
  }
});
