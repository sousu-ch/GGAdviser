/**
 * GridRenderer.js
 * グリッドとハイライトの実際の DOM 作成を処理する。
 */
class GridRenderer {
  static DEBUG = false;
  /**
   * 画像コンテナの上に 5x5 の HTML グリッドを描画する。
   */
  static renderGridLayer(
    container,
    img,
    storageRes = {},
    resolvedImgIndex = -1,
    initialGridState = true,
    callbacks = {},
  ) {
    const existing = document.getElementById("gg-grid-layer");
    if (existing) existing.remove();

    // 必須パラメータのチェック
    if (!container || !img) {
      if (GridRenderer.DEBUG) {
        console.warn(
          "[GridRenderer] Missing container or img for grid rendering.",
        );
      }
      return;
    }

    const width = img.clientWidth;
    const height = img.clientHeight;
    const offsetLeft = img.offsetLeft; // ラッパーに対する相対配置には offsetLeft を使用
    const offsetTop = img.offsetTop;

    const gridOverlay = document.createElement("div");
    gridOverlay.id = "gg-grid-layer";
    gridOverlay.style.position = "absolute";
    gridOverlay.style.top = `${offsetTop}px`;
    gridOverlay.style.left = `${offsetLeft}px`;
    gridOverlay.style.width = `${width}px`;
    gridOverlay.style.height = `${height}px`;
    gridOverlay.style.pointerEvents = "none"; // クリックを透過させる
    
    const isGridOn = initialGridState !== undefined ? initialGridState : true;
    gridOverlay.style.display = isGridOn ? "grid" : "none";

    gridOverlay.style.gridTemplateColumns = "repeat(5, 1fr)";
    gridOverlay.style.gridTemplateRows = "repeat(5, 1fr)";
    gridOverlay.style.boxSizing = "border-box";

    // 25個のセルを作成
    for (let i = 0; i < 25; i++) {
      const cell = document.createElement("div");

      // 1. 座標計算
      const row = Math.floor(i / 5);
      const col = i % 5;
      const rowChar = String.fromCharCode("A".charCodeAt(0) + row);
      const colNum = col + 1;
      const coordStr = `${rowChar}-${colNum}`;

      // 2. 基本スタイル
      cell.style.border = "1px solid rgba(255, 255, 255, 0.3)";
      cell.style.position = "relative";
      cell.style.pointerEvents = "auto"; // コンテキストメニューのためにポインターイベントを有効化

      // 3. ラベルスタイル
      cell.innerText = coordStr;
      cell.style.display = "flex";
      cell.style.alignItems = "center";
      cell.style.justifyContent = "center";

      const fontSizePx = Math.max(12, Math.floor(width / 15));
      cell.style.fontSize = `${fontSizePx}px`;

      // ゴーストモードの美学
      cell.style.fontFamily = '"Inter", "Segoe UI", system-ui, sans-serif';
      cell.style.fontWeight = "500";
      cell.style.color = "#FFFFFF";
      cell.style.textShadow = "0px 0px 3px #000000";
      cell.style.opacity = "0.2";

      cell.style.userSelect = "none";
      cell.style.cursor = "crosshair";

      // グリッド同期イベント
      const currentImgNum = resolvedImgIndex + 1;

      cell.addEventListener("mouseenter", (e) => {
        if (callbacks.onMouseEnter)
          callbacks.onMouseEnter(e, cell, coordStr, i);
      });

      cell.addEventListener("mouseleave", (e) => {
        if (callbacks.onMouseLeave)
          callbacks.onMouseLeave(e, cell, coordStr, i);
      });

      // 左クリック -> ヒントのアンロック
      cell.addEventListener("click", (e) => {
        if (callbacks.onClick) callbacks.onClick(e, cell, coordStr, i);
      });

      // ダブルクリック -> 同期 & 閉じる
      cell.addEventListener("dblclick", (e) => {
        if (callbacks.onDblClick) callbacks.onDblClick(e, cell, coordStr, i);
      });

      // 右クリック -> クエリ送信
      cell.oncontextmenu = (e) => {
        if (callbacks.onContextMenu)
          callbacks.onContextMenu(e, cell, coordStr, i);
      };

      gridOverlay.appendChild(cell);
    }

    container.appendChild(gridOverlay);
  }

  /**
   * 持続的な選択ハイライトを描画する（フォーカス用の青色）
   */
  static renderSelection(container, img, coordStr) {
    const existing = document.getElementById("gg-selection-layer");
    if (existing) existing.remove();

    if (!coordStr) return;
    if (!container || !img) return;

    const match = coordStr.match(/([A-E])[-: ]?([1-5])/i);
    if (!match) return;

    const row = match[1].toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
    const col = parseInt(match[2], 10) - 1;

    const cellWidth = img.clientWidth / 5;
    const cellHeight = img.clientHeight / 5;
    const offsetLeft = img.offsetLeft;
    const offsetTop = img.offsetTop;

    const selection = document.createElement("div");
    selection.id = "gg-selection-layer";
    selection.className = "gg-grid-highlight-selected"; // CSSクラスを使用
    selection.style.position = "absolute";
    selection.style.top = `${offsetTop + row * cellHeight}px`;
    selection.style.left = `${offsetLeft + col * cellWidth}px`;
    selection.style.width = `${cellWidth}px`;
    selection.style.height = `${cellHeight}px`;
    selection.style.backgroundColor = "transparent"; // Focus Blue (透明)
    selection.style.border = "3px solid #1a73e8";
    selection.style.pointerEvents = "none";
    selection.style.zIndex = "1000";
    selection.style.boxSizing = "border-box";

    container.appendChild(selection);
  }

  /**
   * 一時的なハイライトを描画する（Amber）
   */
  static renderHighlight(container, img, coordStr, isHighRes) {
    const existing = document.getElementById("gg-highlight-layer");
    if (existing) existing.remove();

    if (!coordStr || typeof coordStr !== "string") return;
    if (!container || !img) return;

    // ... (ロジックは変更なし、純粋な座標計算) ...
    const match = coordStr.match(/([A-E])[-: ]?([1-5])/i);
    if (!match) return;

    const rowChar = match[1].toUpperCase();
    const colNum = parseInt(match[2], 10);
    const rowIndex = rowChar.charCodeAt(0) - "A".charCodeAt(0);
    const colIndex = colNum - 1;

    const RULER_SIZE = isHighRes ? 0 : 40;
    const GRID_ROWS = 5;
    const GRID_COLS = 5;

    // img の寸法を確認
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;

    // ユニットテストや早期描画のための安全チェック
    if (!natW || !natH) return;

    const mapW = natW - RULER_SIZE;
    const mapH = natH - RULER_SIZE;

    if (mapW <= 0) return;

    const cellNatW = mapW / GRID_COLS;
    const cellNatH = mapH / GRID_ROWS;

    const targetNatX = RULER_SIZE + colIndex * cellNatW;
    const targetNatY = RULER_SIZE + rowIndex * cellNatH;

    const renderW = img.clientWidth;
    const renderH = img.clientHeight;
    const offsetX = img.clientLeft || 0;
    const offsetY = img.clientTop || 0;

    const realScaleX = renderW / natW;
    const realScaleY = renderH / natH;

    const dispX = targetNatX * realScaleX + offsetX;
    const dispY = targetNatY * realScaleY + offsetY;
    const dispW = cellNatW * realScaleX;
    const dispH = cellNatH * realScaleY;

    const BORDER_WIDTH = 2; // px

    const highlight = document.createElement("div");
    highlight.id = "gg-highlight-layer";
    highlight.style.position = "absolute";

    highlight.style.left = `${dispX - BORDER_WIDTH}px`;
    highlight.style.top = `${dispY - BORDER_WIDTH}px`;
    highlight.style.width = `${dispW}px`;
    highlight.style.height = `${dispH}px`;

    highlight.style.border = `${BORDER_WIDTH}px solid #FF6D00`;
    highlight.style.boxSizing = "content-box";
    highlight.style.backgroundColor = "transparent";
    highlight.style.boxShadow =
      "0 0 8px rgba(255, 109, 0, 0.8), 0 0 15px rgba(0, 0, 0, 0.5)";
    highlight.style.zIndex = "100";
    highlight.style.pointerEvents = "none";

    // アニメーション
    highlight.animate(
      [
        { opacity: 0.6, boxShadow: "0 0 8px rgba(255, 109, 0, 0.6)" },
        { opacity: 1.0, boxShadow: "0 0 15px rgba(255, 109, 0, 1.0)" },
        { opacity: 0.6, boxShadow: "0 0 8px rgba(255, 109, 0, 0.6)" },
      ],
      {
        duration: 2000,
        easing: "ease-in-out",
        iterations: Infinity,
      },
    );

    container.appendChild(highlight);
  }

  /**
   * 静的なハイライトを特定のレイヤーに描画するヘルパー（マルチハイライト用）。
   */
  static renderSingleHighlightTo(layer, img, coordStr, isHighRes) {
    if (!layer || !img) return;

    const match = coordStr.match(/([A-E])[-: ]?([1-5])/i);
    if (!match) return;

    const rowChar = match[1].toUpperCase();
    const colNum = parseInt(match[2], 10);
    const rowIndex = rowChar.charCodeAt(0) - "A".charCodeAt(0);
    const colIndex = colNum - 1;

    const RULER_SIZE = isHighRes ? 0 : 40;
    const GRID_ROWS = 5;
    const GRID_COLS = 5;

    const natW = img.naturalWidth;
    const natH = img.naturalHeight;

    // 安全性チェック
    if (!natW || !natH) return;

    const mapW = natW - RULER_SIZE;
    const mapH = natH - RULER_SIZE;
    if (mapW <= 0) return;

    const cellNatW = mapW / GRID_COLS;
    const cellNatH = mapH / GRID_ROWS;

    const targetNatX = RULER_SIZE + colIndex * cellNatW;
    const targetNatY = RULER_SIZE + rowIndex * cellNatH;

    const renderW = img.clientWidth;
    const renderH = img.clientHeight;
    const offsetX = img.clientLeft || 0;
    const offsetY = img.clientTop || 0;

    const realScaleX = renderW / natW;
    const realScaleY = renderH / natH;

    const dispX = targetNatX * realScaleX + offsetX;
    const dispY = targetNatY * realScaleY + offsetY;
    const dispW = cellNatW * realScaleX;
    const dispH = cellNatH * realScaleY;

    const BORDER_WIDTH = 2;

    const highlight = document.createElement("div");
    highlight.className = "gg-static-highlight";
    highlight.style.position = "absolute";
    highlight.style.left = `${dispX - BORDER_WIDTH}px`;
    highlight.style.top = `${dispY - BORDER_WIDTH}px`;
    highlight.style.width = `${dispW}px`;
    highlight.style.height = `${dispH}px`;

    highlight.style.border = `${BORDER_WIDTH}px solid #FF6D00`;
    highlight.style.boxSizing = "content-box";
    highlight.style.backgroundColor = "transparent";
    highlight.style.boxShadow =
      "0 0 8px rgba(255, 109, 0, 0.8), 0 0 15px rgba(0, 0, 0, 0.5)";
    highlight.style.zIndex = "95";
    highlight.style.pointerEvents = "none";

    // アニメーション
    highlight.animate(
      [
        { opacity: 0.6, boxShadow: "0 0 8px rgba(255, 109, 0, 0.6)" },
        { opacity: 1.0, boxShadow: "0 0 15px rgba(255, 109, 0, 1.0)" },
        { opacity: 0.6, boxShadow: "0 0 8px rgba(255, 109, 0, 0.6)" },
      ],
      {
        duration: 2000,
        easing: "ease-in-out",
        iterations: Infinity,
      },
    );

    layer.appendChild(highlight);
  }
}
