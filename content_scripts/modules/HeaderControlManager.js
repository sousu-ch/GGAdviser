/**
 * HeaderControlManager.js
 * アプリヘッダー内の AI/WIDE 切り替えボタンの注入と状態管理を担当するクラス。
 * DOMの変更を監視し、ボタンが常に存在するようにする。
 */
class HeaderControlManager {
  constructor({ onToggleUI, onToggleWide, onReinject, initialState }) {
    this.onToggleUI = onToggleUI;
    this.onToggleWide = onToggleWide;
    this.onReinject = onReinject;
    this.debugMode = true;
    this.observer = null;
    this.state = initialState || { uiEnabled: true, wideEnabled: false };

  }

  init() {
    this.injectAppHeaderToggle();
    this.startObserver();
    setTimeout(() => {
      if (!document.getElementById("gg-app-toggle-btn")) {
        // this._warn("Header not found after 5s. Using fixed body fallback.");
        this._appendButtonsTo(document.body, true);
      }
    }, 5000);
  }
  updateState(uiEnabled, wideEnabled) {
    this.state.uiEnabled = uiEnabled;
    this.state.wideEnabled = wideEnabled;
    this.updateToggleButtonState();
  }
  injectAppHeaderToggle() {
    if (document.getElementById("gg-app-toggle-btn")) return false;
    const tryInject = () => {
      if (document.getElementById("gg-app-toggle-btn")) return false;
      const isMapPage = !!document.querySelector(
        GG_CONSTANTS.SELECTORS.MAP_APP_WRAPPER,
      );
      if (!isMapPage) return false;
      const iconBtn =
        document.querySelector("header .icon-button") ||
        document.querySelector(".icon-button");
      if (iconBtn && iconBtn.parentElement) {
        this._appendButtonsTo(iconBtn.parentElement, false, iconBtn);
        this.updateToggleButtonState(); // 注入後に強制更新
        return true;
      }
      const header = document.querySelector(
        'header:not([class*="tool-block"])',
      );
      if (header) {
        this._appendButtonsTo(header);
        this.updateToggleButtonState(); // 注入後に強制更新
        return true;
      }
      return false;
    };
    return tryInject();
  }
  startObserver() {
    if (this.observer) return;
    this.observer = new MutationObserver(() => {
      if (window.location.pathname.startsWith("/maps/")) {
        const injected = this.injectAppHeaderToggle();
        if (injected && this.onReinject) this.onReinject();
        if (injected) this.updateToggleButtonState();
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }
  _appendButtonsTo(container, isFixed = false, sibling = null) {
    if (document.getElementById("gg-app-toggle-btn")) return;
    const wrapper = document.createElement("div");
    wrapper.id = GG_CONSTANTS.CLASSES.HEADER_BUTTONS_WRAPPER;
    wrapper.className = GG_CONSTANTS.CLASSES.HEADER_BUTTONS_WRAPPER;
    if (isFixed) {
      Object.assign(wrapper.style, {
        position: "fixed",
        top: "10px",
        left: "200px",
        zIndex: "2147483647",
        pointerEvents: "auto",
      });
    } else {
      wrapper.style.position = "relative";
      wrapper.style.zIndex = "1000";
      wrapper.style.pointerEvents = "auto";
      wrapper.style.display = "flex";
      wrapper.style.gap = "8px";
    }
    const wideBtn = this._createHeaderButton("gg-wide-toggle-btn", "WIDE", () =>
      this.onToggleWide(),
    );
    wideBtn.classList.add(GG_CONSTANTS.CLASSES.WIDE_BUTTON);

    const aiBtn = this._createHeaderButton("gg-app-toggle-btn", "AI", () =>
      this.onToggleUI(),
    );
    aiBtn.classList.add(GG_CONSTANTS.CLASSES.AI_BUTTON);

    wrapper.appendChild(wideBtn);
    wrapper.appendChild(aiBtn);
    if (sibling) sibling.after(wrapper);
    else container.appendChild(wrapper);
    this.updateToggleButtonState();
  }
  _createHeaderButton(id, label, onclick) {
    const btn = document.createElement("button");
    btn.id = id;
    btn.className = GG_CONSTANTS.CLASSES.HEADER_BUTTON;
    btn.innerText = label;
    btn.addEventListener("click", (e) => {

      e.stopPropagation();
      e.preventDefault();
      if (onclick) onclick();
    });
    return btn;
  }
  updateToggleButtonState() {
    const aiBtn = document.getElementById("gg-app-toggle-btn");
    if (aiBtn) {
      aiBtn.innerText = this.state.uiEnabled ? "AI ON" : "AI OFF";
      aiBtn.classList.toggle(
        GG_CONSTANTS.CLASSES.ENABLED,
        this.state.uiEnabled,
      );
      aiBtn.classList.toggle(
        GG_CONSTANTS.CLASSES.DISABLED,
        !this.state.uiEnabled,
      );
    }
    const wideBtn = document.getElementById("gg-wide-toggle-btn");
    if (wideBtn) {
      wideBtn.innerText = this.state.wideEnabled ? "WIDE ON" : "WIDE OFF";
      wideBtn.classList.toggle(
        GG_CONSTANTS.CLASSES.ENABLED,
        this.state.wideEnabled,
      );
      wideBtn.classList.toggle(
        GG_CONSTANTS.CLASSES.DISABLED,
        !this.state.wideEnabled,
      );
    }
  }
}
window.HeaderControlManager = HeaderControlManager;

