/**
 * GridInteractionHandler.js
 * グリッドレイヤー上でのユーザーインタラクション（クリック、ホバーなど）を処理する。
 */
class GridInteractionHandler {
  /**
   * GridRenderer が必要とするコールバックオブジェクトを作成する。
   * @param {GridOverlayManager} manager - GridOverlayManager インスタンス（状態とメソッド用）。
   * @param {Object} storageRes - メタデータを含むストレージレスポンス。
   * @param {number} resolvedImgIndex - 現在の画像の解決済みインデックス（0始まり）。
   * @param {HTMLElement} imgWrapper - コンテナラッパー。
   * @param {HTMLImageElement} img - メイン画像要素。
   * @returns {Object} イベントハンドラ（onMouseEnter, onClick など）を含むオブジェクト。
   */
  static createCallbacks(
    manager,
    storageRes,
    resolvedImgIndex,
    imgWrapper,
    img,
  ) {
    return {
      onMouseEnter: (e, cell, coordStr, i) => {
        // 別のセルに移動した場合、選択をクリアする (ホバーロジック)
        if (manager.selectedCoord !== coordStr) {
          manager.selectedCoord = null;
          manager.selectedImgIndex = -1;
          const selectionLayer = document.getElementById("gg-selection-layer");
          if (selectionLayer) selectionLayer.remove();
        }

        const currentImgNum = resolvedImgIndex + 1;
        // 双方向同期のために GRID_HOVER をディスパッチ
        window.dispatchEvent(
          new CustomEvent(GG_CONSTANTS.EVENTS.GRID_HOVER, {
            detail: {
              coord: null,
              imgIndex: currentImgNum,
              isWholeImage: true,
            },
          }),
        );
      },

      onMouseLeave: (e, cell, coordStr, i) => {
        // ホバーをクリア
        window.dispatchEvent(
          new CustomEvent(GG_CONSTANTS.EVENTS.GRID_HOVER, {
            detail: { coord: null, imgIndex: -1, isWholeImage: false },
          }),
        );
      },

      onClick: (e, cell, coordStr, i) => {
        e.stopPropagation(); // オーバーレイが閉じるのを防ぐ

        // 内部クリックイベントをディスパッチ
        window.dispatchEvent(
          new CustomEvent("GG_GRID_CELL_CLICKED", {
            detail: { coord: coordStr },
          }),
        );

        // 一時的なハイライトを削除
        const highlightLayer = document.getElementById("gg-highlight-layer");
        if (highlightLayer) highlightLayer.remove();

        // マネージャーの状態を更新
        manager.selectedCoord = coordStr;
        manager.selectedImgIndex = resolvedImgIndex;

        // 外部クリックイベントをディスパッチ (Gemini同期用)
        const currentImgNum = resolvedImgIndex + 1;
        window.dispatchEvent(
          new CustomEvent(GG_CONSTANTS.EVENTS.GRID_CLICK, {
            detail: { coord: coordStr, imgIndex: currentImgNum },
          }),
        );

        // 視覚的フィードバック (選択ブルー)
        // メモ: GridRenderer はグローバルに利用可能
        GridRenderer.renderSelection(imgWrapper, img, manager.selectedCoord);

        // クリックフィードバックアニメーション
        cell.classList.add("gg-grid-cell-flash-white");
        setTimeout(
          () => cell.classList.remove("gg-grid-cell-flash-white"),
          200,
        );
      },

      onDblClick: (e, cell, coordStr, i) => {
        e.stopPropagation();
        
        // ダブルクリック -> POV同期 & 閉じる
        if (
          storageRes.highResMetadata &&
          resolvedImgIndex >= 0 &&
          storageRes.highResMetadata[resolvedImgIndex]
        ) {
          const meta = storageRes.highResMetadata[resolvedImgIndex];
          if (meta && typeof meta.heading === "number") {
            window.dispatchEvent(
              new CustomEvent("GG_SYNC_POV", {
                detail: { heading: meta.heading, pitch: 0 },
              }),
            );
          }
        }
        // マネージャー経由でオーバーレイを閉じる
        manager.closeOverlay();
      },

      onContextMenu: (e, cell, coordStr, i) => {
        e.preventDefault();
        e.stopPropagation();

        const currentImgNum = resolvedImgIndex + 1;
        const queryText = `[画像${currentImgNum}: ${coordStr}] `;

        // クエリイベントを送信 (Content Script -> Background -> SidePanel でインターセプト)
        window.dispatchEvent(
          new CustomEvent("GG_GRID_QUERY", { detail: { text: queryText } }),
        );

        // 右クリックフィードバック
        cell.classList.add("gg-grid-cell-flash-orange");
        setTimeout(
          () => cell.classList.remove("gg-grid-cell-flash-orange"),
          300,
        );
      },
    };
  }
}
