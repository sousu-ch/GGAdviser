// options.js - GGAdviser 詳細設定
(function () {
  let elements = {};
  const keys = {
    PROMPT: GG_CONSTANTS.STORAGE_KEYS.PROMPT_TEMPLATE,
    MAP_URL: GG_CONSTANTS.STORAGE_KEYS.MAP_BASE_URL,
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

    // Scroll to the status message area
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });

    setTimeout(() => {
      if (el.innerText === text) {
        el.style.display = "none";
      }
    }, 4000);
  }

  /**
   * マップ URL のみを空の状態にリセットする
   */
  function resetMapOnly() {
    elements.mapUrl.value = "";
    showMessage(
      "地図URLを初期化しました。新しいURLを入力して保存してください。",
      "success",
    );
  }

  /**
   * プロンプトテンプレートのみをデフォルトにリセットする
   */
  function resetPromptOnly() {
    elements.prompt.value =
      typeof GG_PROMPTS !== "undefined" ? GG_PROMPTS.DEFAULT : "";
    showMessage(
      "プロンプトを初期値に戻しました。保存ボタンを押すと確定します。",
      "success",
    );
  }

  /**
   * DOM の準備ができたときに呼び出されるメイン初期化
   */
  function init() {
    elements = {
      prompt: document.getElementById("prompt-template"),
      mapUrl: document.getElementById("map-url"),
      saveBtn: document.getElementById("save-btn"),
      resetMapBtn: document.getElementById("reset-map-btn"),
      resetPromptBtn: document.getElementById("reset-prompt-btn"),
    };

    if (!elements.prompt || !elements.saveBtn) return;

    // Global Save
    elements.saveBtn.onclick = saveAllSettings;

    // 個別のリセット (UI のみ、永続化には保存が必要)
    if (elements.resetMapBtn) elements.resetMapBtn.onclick = resetMapOnly;
    if (elements.resetPromptBtn)
      elements.resetPromptBtn.onclick = resetPromptOnly;

    // 既存の設定をロード
    chrome.storage.local.get([keys.PROMPT, keys.MAP_URL], (res) => {
      elements.prompt.value =
        res[keys.PROMPT] ||
        (typeof GG_PROMPTS !== "undefined" ? GG_PROMPTS.DEFAULT : "");
      elements.mapUrl.value = res[keys.MAP_URL] || "";
    });

    // 権限ステータスの初期確認
    checkPermissionStatus();

    // 権限付与ボタンのイベントリスナー
    const grantBtn = document.getElementById("grant-permission-btn");
    if (grantBtn) {
      grantBtn.onclick = requestPermission;
    }

    // Version Display
    const manifest = chrome.runtime.getManifest();
    const versionEl = document.getElementById("options-version");
    if (versionEl) {
      versionEl.innerText = `v${manifest.version}`;
    }
  }

  // --- 権限管理ロジック ---

  /**
   * 現在のキャプチャ権限(<all_urls>)の状態を確認し UI を更新する
   */
  function checkPermissionStatus() {
    if (!chrome.permissions) return;

    chrome.permissions.contains({ origins: ["<all_urls>"] }, (result) => {
      updatePermissionUI(result);
    });
  }

  /**
   * 権限の状態に基づいて UI (アイコン、テキスト、ボタン) を更新する
   */
  function updatePermissionUI(hasPermission) {
    const statusText = document.getElementById("permission-status-text");
    const statusIcon = document.getElementById("permission-icon");
    const grantBtn = document.getElementById("grant-permission-btn");
    const statusContainer = document.getElementById(
      "permission-status-container",
    );

    if (hasPermission) {
      // 許可済み
      statusText.innerText = "許可済み (キャプチャ機能を利用可能)";
      statusText.style.color = "#047857"; // Green
      statusIcon.innerText = "✅";
      statusContainer.style.background = "#ecfdf5";
      grantBtn.style.display = "none";
    } else {
      // 未許可
      statusText.innerText = "未許可 (キャプチャ機能は利用できません)";
      statusText.style.color = "#b91c1c"; // Red
      statusIcon.innerText = "❌";
      statusContainer.style.background = "#fef2f2";
      grantBtn.style.display = "block";
    }
  }

  /**
   * ユーザーに権限をリクエストする
   * @returns {Promise<boolean>} 許可されたかどうか
   */
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

  /**
   * 現在のすべての値を Chrome ストレージに保存する (グローバル保存)
   * ※ 保存時に権限がなければリクエストを試みる
   */
  async function saveAllSettings() {
    const promptVal = elements.prompt.value.trim();
    const mapUrlVal = elements.mapUrl.value.trim();

    if (!promptVal || !mapUrlVal) {
      showMessage(
        "プロンプトとURLは必須項目です。両方を入力して保存してください。",
        "error",
      );
      return;
    }

    // 保存アクション時に権限確認
    let hasPermission = false;
    try {
      hasPermission = await new Promise((r) =>
        chrome.permissions.contains({ origins: ["<all_urls>"] }, r),
      );
    } catch (e) {
      console.error(e);
    }

    // 権限がない場合、自動的にリクエストを試みる
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) {
        showMessage(
          "重要: キャプチャ権限がないため、機能は制限されます。(設定は保存しませんでした)",
          "error",
        );
        return; // 保存を中断する
      }
    }

    chrome.storage.local.set(
      {
        [keys.PROMPT]: promptVal,
        [keys.MAP_URL]: mapUrlVal,
      },
      () => {
        if (chrome.runtime.lastError) {
          showMessage("保存に失敗しました。", "error");
        } else {
          showMessage("すべての設定を保存しました。");
        }
      },
    );
  }

  // readyState に基づいて初期化を開始
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
