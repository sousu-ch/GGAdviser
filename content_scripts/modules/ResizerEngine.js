/**
 * ResizerEngine.js
 * 要素のリサイジングにおけるマウスイベントと座標計算を処理する。
 * 水平 (col-resize) と垂直 (ns-resize) の両方のモードをサポートする。
 */
class ResizerEngine {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.handle - ドラッグに使用する要素。
   * @param {string} options.direction - 'horizontal' または 'vertical'。
   * @param {Function} options.onResize - (newSize, percent) を受け取るコールバック。
   * @param {Array<HTMLElement>} [options.iframes=[]] - ドラッグ中にポインターイベントを無効にする iframe。
   * @param {number} [options.minSize=150] - ピクセル単位の最小サイズ。
   * @param {number} [options.maxOffset=250] - ビューポートの端からの最大オフセット（ピクセル単位）。
   */
  constructor(options) {
    this.handle = options.handle;
    this.direction = options.direction || "horizontal";
    this.onResize = options.onResize;
    this.iframes = options.iframes || [];
    this.minSize = options.minSize || 150;
    this.maxOffset = options.maxOffset || 250;

    this.isDragging = false;
    this._init();
  }

  _init() {
    if (!this.handle) return;

    this.handle.addEventListener("mousedown", (e) => this._startDrag(e));

    // 削除用にハンドラをバインド
    this._onMouseMove = (e) => this._handleDrag(e);
    this._onMouseUp = () => this._stopDrag();
  }

  _startDrag(e) {
    this.isDragging = true;
    this.handle.classList.add("resizing");
    document.body.style.cursor =
      this.direction === "horizontal" ? "col-resize" : "ns-resize";

    this._togglePointerEvents(false);
    e.preventDefault();

    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("mouseup", this._onMouseUp);
  }

  _handleDrag(e) {
    if (!this.isDragging) return;

    let newSize;
    let percent = null;

    if (this.direction === "horizontal") {
      percent = (e.clientX / window.innerWidth) * 100;
      // 水平方向の制約 (Splitter)
      if (percent < 20) percent = 20;
      if (percent > 80) percent = 80;
      newSize = percent;
    } else {
      // 垂直方向 (ワイドモードのリサイザー)
      // リサイズ対象はハンドルの前の要素、または特定のマークアップを想定
      const target = this.handle.previousElementSibling;
      if (!target) return;

      const rect = target.getBoundingClientRect();
      newSize = e.clientY - rect.top;

      // 制約
      const vh = window.innerHeight;
      if (newSize < this.minSize) newSize = this.minSize;
      if (newSize > vh - this.maxOffset) newSize = vh - this.maxOffset;
    }

    if (this.onResize) {
      this.onResize(newSize, percent);
    }
  }

  _stopDrag() {
    if (this.isDragging) {
      this.isDragging = false;
      this.handle.classList.remove("resizing");
      document.body.style.cursor = "";
      this._togglePointerEvents(true);

      document.removeEventListener("mousemove", this._onMouseMove);
      document.removeEventListener("mouseup", this._onMouseUp);
    }
  }

  _togglePointerEvents(enabled) {
    const value = enabled ? "" : "none";
    this.iframes.forEach((el) => {
      if (el) el.style.pointerEvents = value;
    });
  }

  /**
   * リスナーのクリーンアップ
   */
  destroy() {
    // 動的な削除が必要な場合の実装
  }
}
