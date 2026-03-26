// options.js - GGAdviser 詳細設定
(function () {
  let elements = {};
  let currentMapsList = [];
  let currentActiveMapId = null;
  let currentActivePromptId = null;
  let editingPromptId = null;
  
  const keys = {
    PROMPTS_LIST: GG_CONSTANTS.STORAGE_KEYS.PROMPTS_LIST,
    PROMPTS_CUSTOM: GG_CONSTANTS.STORAGE_KEYS.PROMPTS_CUSTOM,
    ACTIVE_PROMPT_ID: GG_CONSTANTS.STORAGE_KEYS.ACTIVE_PROMPT_ID,
    MAPS_LIST: GG_CONSTANTS.STORAGE_KEYS.MAPS_LIST,
    ACTIVE_MAP_ID: GG_CONSTANTS.STORAGE_KEYS.ACTIVE_MAP_ID,
  };

  let customPrompts = {}; // ID -> content 形式のカスタムプロンプト

  /**
   * デバッガーオブジェクト: ロギングを一元管理する。
   */
  const Debugger = {
    ENABLED: false, // リリース時は false に設定
    log(msg, data = "") { if (this.ENABLED) console.log(`[GG-DEBUG] ${msg}`, data); },
    warn(msg, data = "") { if (this.ENABLED) console.warn(`[GG-DEBUG] ${msg}`, data); }
  };

  /**
   * ストレージ管理オブジェクト: chrome.storage.local とのやり取りを隠蔽する。
   */
  const GGStorage = {
    async load() {
      Debugger.log("GGStorage: Loading...");
      return new Promise((resolve) => {
        chrome.storage.local.get([
          keys.PROMPTS_CUSTOM,
          keys.ACTIVE_PROMPT_ID,
          keys.MAPS_LIST,
          keys.ACTIVE_MAP_ID
        ], (res) => {
          Debugger.log("GGStorage: Data loaded", res);
          customPrompts = res[keys.PROMPTS_CUSTOM] || {};
          currentActivePromptId = res[keys.ACTIVE_PROMPT_ID] || (typeof GG_PROMPTS !== 'undefined' && GG_PROMPTS.PRESETS.length > 0 ? GG_PROMPTS.PRESETS[0].id : null);
          currentMapsList = res[keys.MAPS_LIST] || [];
          currentActiveMapId = res[keys.ACTIVE_MAP_ID] || null;
          resolve(res);
        });
      });
    },

    async save(silent = false) {
      Debugger.log("GGStorage: Saving...", { silent });
      return new Promise((resolve, reject) => {
        chrome.storage.local.set({
          [keys.PROMPTS_CUSTOM]: customPrompts,
          [keys.ACTIVE_PROMPT_ID]: currentActivePromptId,
          [keys.MAPS_LIST]: currentMapsList,
          [keys.ACTIVE_MAP_ID]: currentActiveMapId
        }, () => {
          if (chrome.runtime.lastError) {
            Debugger.warn("GGStorage: Save failed", chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            Debugger.log("GGStorage: Save success");
            resolve();
          }
        });
      });
    }
  };

  /**
   * UI描画オブジェクト: HTML要素の書き換えを担当する。
   */
  const UIHandler = {
    renderPrompts() {
      const container = elements.promptsListContainer;
      if (!container) return;
      container.innerHTML = "";

      const presets = (typeof GG_PROMPTS !== "undefined" && GG_PROMPTS.PRESETS) ? GG_PROMPTS.PRESETS : [];
      const displayList = presets.map(p => {
        const custom = customPrompts[p.id];
        const isModified = custom && typeof custom === 'object' && (
          (custom.content !== undefined && custom.content !== p.content) ||
          (custom.name !== undefined && custom.name !== p.name) ||
          (custom.description !== undefined && custom.description !== p.description)
        );
        return { ...p, isModified, isActive: p.id === currentActivePromptId };
      });

      if (displayList.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">プロンプトが見つかりません。</div>';
        return;
      }

      displayList.forEach(p => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "map-item";
        if (p.isActive) { itemDiv.style.borderColor = "var(--primary-color)"; itemDiv.style.background = "#f5f3ff"; }

        const infoDiv = document.createElement("div");
        infoDiv.className = "map-info";
        infoDiv.innerHTML = `<div class="map-name">${p.name}${p.isModified ? " (編集済み)" : ""}${p.isActive ? ' <span class="map-active-badge">使用中</span>' : ""}</div><div class="map-url">${p.description}</div>`;
        
        const actionsDiv = document.createElement("div");
        actionsDiv.className = "actions";

        if (!p.isActive) {
          const btn = document.createElement("button");
          btn.className = "btn-secondary btn-sm"; btn.textContent = "選択";
          btn.onclick = () => { currentActivePromptId = p.id; UIHandler.renderPrompts(); saveAllSettings(true); };
          actionsDiv.appendChild(btn);
        }

        const editBtn = document.createElement("button");
        editBtn.className = "btn-secondary btn-sm"; editBtn.textContent = "編集";
        editBtn.onclick = () => UIHandler.openEditForm(p.id);
        actionsDiv.appendChild(editBtn);

        if (p.isModified) {
          const resetBtn = document.createElement("button");
          resetBtn.className = "btn-danger btn-sm"; resetBtn.textContent = "初期化";
          resetBtn.onclick = () => resetPrompt(p.id);
          actionsDiv.appendChild(resetBtn);
        }

        itemDiv.appendChild(infoDiv);
        itemDiv.appendChild(actionsDiv);
        container.appendChild(itemDiv);
      });
    },

    renderMaps() {
      const container = elements.mapsListContainer;
      if (!container) return;
      container.innerHTML = "";
      if (!currentMapsList || currentMapsList.length === 0) {
        container.innerHTML = '<div style="text-align:center; color: var(--text-muted); font-size: 0.9rem; padding: 20px;">登録されている地図はありません。</div>';
        return;
      }
      currentMapsList.forEach(mapData => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "map-item";
        const isActive = mapData.id === currentActiveMapId;
        itemDiv.innerHTML = `<div class="map-info"><div class="map-name">${escapeHTML(mapData.name)} ${isActive ? '<span class="map-active-badge">アクティブ</span>' : ''}</div><div class="map-url">${escapeHTML(mapData.url)}</div></div>`;
        const actionsDiv = document.createElement("div");
        actionsDiv.style.display = "flex"; actionsDiv.style.gap = "8px";
        if (!isActive) {
          const selBtn = document.createElement("button");
          selBtn.className = "btn-secondary btn-sm"; selBtn.textContent = "選択";
          selBtn.onclick = () => { currentActiveMapId = mapData.id; UIHandler.renderMaps(); saveAllSettings(true); };
          actionsDiv.appendChild(selBtn);
        }
        const delBtn = document.createElement("button");
        delBtn.className = "btn-danger btn-sm"; delBtn.textContent = "削除";
        delBtn.onclick = () => deleteMap(mapData.id);
        actionsDiv.appendChild(delBtn);
        itemDiv.appendChild(actionsDiv);
        container.appendChild(itemDiv);
      });
    },

    openEditForm(id) {
      if (!id) return;
      editingPromptId = id;
      const preset = (typeof GG_PROMPTS !== "undefined" ? GG_PROMPTS.PRESETS : []).find(p => p.id === id);
      if (!preset) return;
      const custom = customPrompts[id] || {};
      elements.formTitle.innerText = `${preset.name} を編集`;
      elements.editPromptName.value = custom.name || preset.name;
      elements.editPromptDesc.value = custom.description || preset.description;
      elements.editPromptContent.value = custom.content || preset.content;
      elements.promptEditForm.style.display = "block";
      elements.promptEditForm.scrollIntoView({ behavior: "smooth" });
    },

    closeEditForm() {
      elements.promptEditForm.style.display = "none";
      editingPromptId = null;
    }
  };

  /**
   * イベント管理オブジェクト: すべてのイベントリスナーを一括管理する。
   */
  const EventManager = {
    bindAll() {
      Debugger.log("EventManager: Binding all events");
      if (elements.saveBtn) elements.saveBtn.onclick = () => saveAllSettings();
      if (elements.fetchTitleBtn) elements.fetchTitleBtn.onclick = handleFetchTitle;
      if (elements.addMapBtn) elements.addMapBtn.onclick = handleAddMap;
      if (elements.showAddPromptBtn) elements.showAddPromptBtn.onclick = () => UIHandler.openEditForm(null);
      if (elements.cancelEditBtn) elements.cancelEditBtn.onclick = UIHandler.closeEditForm;
      if (elements.savePromptItemBtn) elements.savePromptItemBtn.onclick = savePromptItem;
      if (elements.resetPromptsBtn) elements.resetPromptsBtn.onclick = resetAllPrompts;
      
      const grantBtn = document.getElementById("grant-permission-btn");
      if (grantBtn) grantBtn.onclick = requestPermission;
    }
  };

  /**
   * モーダル管理オブジェクト: カスタムUIによる確認ダイアログを提供する。
   */
  const ModalHandler = {
    confirm(title, message, onConfirm) {
      const modal = document.getElementById("confirm-modal");
      const titleEl = document.getElementById("modal-title");
      const bodyEl = document.getElementById("modal-body");
      const confirmBtn = document.getElementById("modal-confirm-btn");
      const cancelBtn = document.getElementById("modal-cancel-btn");

      if (!modal || !titleEl || !bodyEl || !confirmBtn || !cancelBtn) {
        Debugger.warn("Modal elements not found, falling back to window.confirm");
        if (window.confirm(message)) onConfirm();
        return;
      }

      titleEl.innerText = title;
      bodyEl.innerText = message;
      modal.style.display = "flex";

      const cleanup = () => {
        modal.style.display = "none";
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
      };

      confirmBtn.onclick = () => { cleanup(); onConfirm(); };
      cancelBtn.onclick = () => { cleanup(); };
      modal.onclick = (e) => { if (e.target === modal) cleanup(); };
    }
  };

  /**
   * スクリプトの実行をブロックせずにユーザーにメッセージを表示するヘルパー
   */
  function showMessage(text, type = "success") {
    const el = document.getElementById("status");
    if (!el) return;

    el.innerText = text;
    el.className = `status-msg status-${type}`;
    el.style.display = "block";

    setTimeout(() => {
      if (el.innerText === text) {
        el.style.display = "none";
      }
    }, 4000);
  }

  /**
   * DOM の準備ができたときに呼び出されるメイン初期化
   */
  function init() {
    elements = {
      // Maps
      newMapUrl: document.getElementById("new-map-url"),
      newMapName: document.getElementById("new-map-name"),
      fetchTitleBtn: document.getElementById("fetch-title-btn"),
      addMapBtn: document.getElementById("add-map-btn"),
      mapsListContainer: document.getElementById("maps-list-container"),
      
      // Prompts
      promptsListContainer: document.getElementById("prompts-list-container"),
      promptEditForm: document.getElementById("prompt-edit-form"),
      formTitle: document.getElementById("form-title"),
      editPromptName: document.getElementById("edit-prompt-name"),
      editPromptDesc: document.getElementById("edit-prompt-desc"),
      editPromptContent: document.getElementById("edit-prompt-content"),
      cancelEditBtn: document.getElementById("cancel-edit-btn"),
      savePromptItemBtn: document.getElementById("save-prompt-item-btn"),
      showAddPromptBtn: document.getElementById("show-add-prompt-btn"),
      resetPromptsBtn: document.getElementById("reset-prompts-btn"),
      addPromptTrigger: document.getElementById("add-prompt-trigger"),

      // Global
      saveBtn: document.getElementById("save-btn"),
    };

    const versionEl = document.getElementById("options-version");
    if (versionEl) {
      const manifest = chrome.runtime.getManifest();
      versionEl.innerText = `v${manifest.version}`;
    }

    // Verify element integrity
    Object.keys(elements).forEach(key => {
      if (!elements[key]) Debugger.warn(`Element NOT found: ${key}`);
      else Debugger.log(`Element found: ${key}`);
    });

    // Load and Render
    GGStorage.load().then(() => {
      UIHandler.renderPrompts();
      UIHandler.renderMaps();
      EventManager.bindAll();
      checkPermissionStatus();
    });
  }

  // --- プロンプトリスト管理ロジック ---

  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // --- 地図リスト管理ロジック (既存) ---

  /**
   * 権限ステータスの確認とUI反映
   */
  function checkPermissionStatus() {
    if (!chrome.permissions) return;
    chrome.permissions.contains({ origins: ["<all_urls>"] }, (result) => {
      updatePermissionUI(result);
    });
  }

  function updatePermissionUI(hasPermission) {
    const statusText = document.getElementById("permission-status-text");
    const statusIcon = document.getElementById("permission-icon");
    const grantBtn = document.getElementById("grant-permission-btn");
    const statusContainer = document.getElementById("permission-status-container");

    if (!statusText) return;

    if (hasPermission) {
      statusText.innerText = "許可済み (キャプチャ機能を利用可能)";
      statusText.style.color = "#047857";
      statusIcon.innerText = "✅";
      statusContainer.style.background = "#ecfdf5";
      grantBtn.style.display = "none";
    } else {
      statusText.innerText = "未許可 (キャプチャ機能は利用できません)";
      statusText.style.color = "#b91c1c";
      statusIcon.innerText = "❌";
      statusContainer.style.background = "#fef2f2";
      grantBtn.style.display = "block";
    }
  }

  function requestPermission() {
    return new Promise((resolve) => {
      chrome.permissions.request({ origins: ["<all_urls>"] }, (granted) => {
        updatePermissionUI(granted);
        if (granted) {
          showMessage("権限が付与されました！", "success");
        } else {
          showMessage("権限が付与されませんでした。", "error");
        }
        resolve(granted);
      });
    });
  }

  // --- 地図操作ヘルパー (EventManagerから使用) ---

  function handleFetchTitle() {
    const url = elements.newMapUrl.value.trim();
    if (!url) {
      showMessage("URLを入力してください。", "error");
      return;
    }

    // URL から Map ID を抽出 (例: https://map-making.app/maps/357757)
    const mapIdMatch = url.match(/map-making\.app\/maps\/([a-zA-Z0-9_-]+)/);
    if (!mapIdMatch) {
      showMessage("Map-making.app の有効なマップ URL を入力してください。", "error");
      return;
    }
    const mapId = mapIdMatch[1];

    elements.fetchTitleBtn.disabled = true;
    elements.fetchTitleBtn.textContent = "取得中...";

    // URL ではなく ID のみを背景に送信する (セキュリティ上の根本的改善)
    chrome.runtime.sendMessage({ action: "OBTAIN_MAP_TITLE", data: { mapId } }, (res) => {
      elements.fetchTitleBtn.disabled = false;
      elements.fetchTitleBtn.textContent = "タイトル自動取得";

      if (res && res.status === "success" && res.title) {
        elements.newMapName.value = res.title;
        showMessage("タイトルを取得しました。");
      } else {
        showMessage("タイトルの取得に失敗しました。正しいマップIDか確認してください。", "error");
      }
    });
  }

  function handleAddMap() {
    const url = elements.newMapUrl.value.trim();
    const name = elements.newMapName.value.trim();

    if (!url || !name) {
      showMessage("URLと表示名の両方を入力して「保存して追加」を押してください。", "error");
      return;
    }

    const newMap = {
      id: "map-" + Date.now(),
      name: name,
      url: url
    };

    currentMapsList.push(newMap);
    if (!currentActiveMapId) {
      currentActiveMapId = newMap.id;
    }
    
    elements.newMapUrl.value = "";
    elements.newMapName.value = "";
    
    UIHandler.renderMaps();
    saveAllSettings();
  }

  function deleteMap(id) {
    ModalHandler.confirm(
      "地図の削除",
      "この地図をリストから削除しますか？",
      () => {
        currentMapsList = currentMapsList.filter(map => map.id !== id);
        if (currentActiveMapId === id) {
          currentActiveMapId = currentMapsList.length > 0 ? currentMapsList[0].id : null;
        }
        UIHandler.renderMaps();
        saveAllSettings();
      }
    );
  }

  // --- プロンプト詳細操作ヘルパー ---

  function savePromptItem() {
    if (!editingPromptId) return;

    const name = elements.editPromptName.value.trim();
    const description = elements.editPromptDesc.value.trim();
    const content = elements.editPromptContent.value.trim();

    if (!name || !content) {
      showMessage("プロンプト名と内容は必須項目です。", "error");
      return;
    }

    customPrompts[editingPromptId] = {
      name: name,
      description: description,
      content: content
    };

    UIHandler.renderPrompts();
    UIHandler.closeEditForm();
    saveAllSettings();
  }

  function resetPrompt(id) {
    if (customPrompts[id]) {
      delete customPrompts[id];
      UIHandler.renderPrompts();
      saveAllSettings(); 
    }
  }

  /**
   * すべての設定を保存する。
   * @param {boolean} silent 保存完了メッセージを抑制するかどうか。
   */
  async function saveAllSettings(silent = false) {
    Debugger.log("saveAllSettings: Triggered", { silent });
    try {
      if (!silent) {
        const hasPermission = await new Promise(r => chrome.permissions.contains({ origins: ["<all_urls>"] }, r));
        if (!hasPermission) {
          const granted = await requestPermission();
          if (!granted) {
            showMessage("重要: 権限がないため保存を中断しました。", "error");
            return;
          }
        }
      }

      await GGStorage.save(silent);
      
      if (!silent) {
        showMessage("設定を保存しました！");
      } else {
        const el = document.getElementById("status");
        if (el) {
          el.innerText = "自動保存中...";
          el.className = "status-msg status-success";
          el.style.display = "block";
          setTimeout(() => { if(el.innerText === "自動保存中...") el.style.display = "none"; }, 1000);
        }
      }
    } catch (err) {
      Debugger.warn("saveAllSettings: Error", err);
      showMessage("保存に失敗しました。", "error");
    }
  }

  /**
   * すべてのプロンプトを初期プリセットにリセットする。
   */
  function resetAllPrompts() {
    Debugger.log("resetAllPrompts: Triggered");
    ModalHandler.confirm(
      "全プロンプトの初期化",
      "【警告】すべてのプロンプト編集を破棄して、初期プリセットに戻します。この操作は「変更を保存」ボタンに関わらず即座に実行されます。よろしいですか？",
      () => {
        Debugger.log("resetAllPrompts: User confirmed via Modal");
        
        // オブジェクトの中身を全削除（参照を壊さない）
        for (let key in customPrompts) {
          delete customPrompts[key];
        }
        
        Debugger.log("resetAllPrompts: customPrompts cleared", customPrompts);
        
        // 保存してからリロードして確実に反映させる
        saveAllSettings(true).then(() => {
          Debugger.log("resetAllPrompts: Save complete, reloading...");
          // UIを更新するだけでも良いが、リセットは極めて重要な操作なので
          // optionsページ自体がリロードされるのでリロードを優先
          location.reload();
        });
      }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
