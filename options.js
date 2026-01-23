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
   * 現在のすべての値を Chrome ストレージに保存する (グローバル保存)
   */
  function saveAllSettings() {
    const promptVal = elements.prompt.value.trim();
    const mapUrlVal = elements.mapUrl.value.trim();

    if (!promptVal || !mapUrlVal) {
      showMessage(
        "プロンプトとURLは必須項目です。両方を入力して保存してください。",
        "error",
      );
      return;
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
  }

  // readyState に基づいて初期化を開始
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
