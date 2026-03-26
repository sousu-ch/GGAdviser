/**
 * GridOverlayManager.js
 * 画像オーバーレイ、グリッド表示、およびハイライト相互作用を管理するクラス。
 * SplitViewManager から「Meta Hunter モード」用に抽出された。
 * 外部CSS（sidebar_theme.css）を利用して UI の装飾を行う。
 */
class GridOverlayManager {
  static DEBUG = false;
  /**
   * グリッドオーバーレイの管理クラス。
   * 表示状態、グリッドの可視性、ハイライトされた COORDINATE などを管理する。
   */
  constructor() {
    // 状態
    this.initialGridState = true; // デフォルトでON

    // 選択状態
    this.selectedCoord = null;
    this.selectedImgIndex = -1;

    // デバッグ

    // マルチハイライトのリスナー
    window.addEventListener("GG_HIGHLIGHT_ALL_REQ", (e) => {
      this.highlightAllClues(e.detail.clues);
    });

    window.addEventListener("GG_HIGHLIGHT_CLEAR_REQ", () => {
      this.clearAllHighlights();
    });

    // 双方向同期リスナー
    window.addEventListener(GG_CONSTANTS.EVENTS.HINT_HOVER, (e) => {
      // 同期: HINT_HOVER 受信
      
      // 別のセルに移動した場合、ローカルでの選択をクリア
      if (this.selectedCoord !== e.detail.coord) {
        this.selectedCoord = null;
        this.selectedImgIndex = -1;
        const selectionLayer = document.getElementById("gg-selection-layer");
        if (selectionLayer) selectionLayer.remove();
      }

      if (e.detail.coord) {
        this.highlightCell(e.detail.coord, e.detail.imgIndex);
      } else {
        this.clearAllHighlights();
      }
    });

    window.addEventListener(GG_CONSTANTS.EVENTS.HINT_CLICK, (e) => {
      // 同期: HINT_CLICK 受信
      
      // 選択 (Blue) を表示するためにホバーレイヤー (Amber) をクリア
      const highlightLayer = document.getElementById("gg-highlight-layer");
      if (highlightLayer) highlightLayer.remove();

      if (
        this.currentOverlayState &&
        this.currentOverlayState.imgIndex === e.detail.imgIndex
      ) {
        this.selectedCoord = e.detail.coord;
        this.selectedImgIndex = e.detail.imgIndex;
        GridRenderer.renderSelection(
          this.currentOverlayState.imgWrapper,
          this.currentOverlayState.img,
          this.selectedCoord,
        );
      }
      // 他のヒントのAmberハイライトを再描画するか？
      // 実際には、選択は単に上に乗るだけであるべき。
    });
  }

  _warn(msg) {
    if (GridOverlayManager.DEBUG) console.warn(`[GridOverlayManager:WARN] ${msg}`);
  }

  // レンダリングを委譲するヘルパー
  _triggerRender(
    imgWrapper,
    img,
    storageRes,
    resolvedImgIndex,
    initialHighlightCoord,
  ) {
    // リスナーを内部で定義（GridInteractionHandler 抽出を模倣）
    // GridInteractionHandler を使用してコールバックを生成
    const callbacks = GridInteractionHandler.createCallbacks(
      this,
      storageRes,
      resolvedImgIndex,
      imgWrapper,
      img,
    );

    // 静的レンダリングを呼び出し
    const isGridOn =
      this.initialGridState !== undefined ? this.initialGridState : true;
    GridRenderer.renderGridLayer(
      imgWrapper,
      img,
      storageRes,
      resolvedImgIndex,
      isGridOn,
      callbacks,
    );
  }

  /**
   * メインのマップラッパー（左側）の上に画像オーバーレイを表示する。
   * @param {string} imgData - Base64 形式の画像データ
   * @param {string|null} coord - ハイライトする座標（例: "A-1"）、指定なしの場合は null
   * @param {string} title - オーバーレイのタイトル（例: "Image 1"）
   * @param {number} imageIndex - 0から始まる画像インデックス
   * @param {string|null} linkId - このオーバーレイをトリガーしたリンクの一意なID
   */
  showOverlay(
    imgData,
    coord = null,
    title = "",
    imageIndex = -1,
    linkId = null,
  ) {
    // 1. 画像インデックスの解決 (パラメータ または タイトル)
    let resolvedImgIndex = imageIndex;
    if (resolvedImgIndex < 0 && title && typeof title === "string") {
      const match = title.match(/Image\s+(\d+)/);
      if (match) {
        resolvedImgIndex = parseInt(match[1], 10) - 1; // 1始まりを0始まりに変換
      }
    }

    // 2. トグルロジック (現状との比較)
    const existing = document.getElementById("gg-left-overlay");

    // 正確なトグル: 同じリンクシーケンスが再度クリックされた場合のみ閉じる
    // 防御的: 異なるソースからのundefined/nullとの一致を避けるため、linkIdが存在する場合のみトグルする
    if (
      existing &&
      this.currentOverlayState &&
      this.currentOverlayState.imgIndex === resolvedImgIndex &&
      linkId &&
      this.currentOverlayState.linkId === linkId
    ) {
      this.closeOverlay();
      return;
    }

    if (
      existing &&
      this.currentOverlayState &&
      this.currentOverlayState.imgIndex === resolvedImgIndex
    ) {
      // ビューの更新: imgIndexは一致するがlinkIdが異なる。開いたままにする。
    }

    // 3. 既存のオーバーレイを削除（切り替え）またはシームレス更新
    // 古いObserverロジックをクリーンアップするが、オーバーレイDOMは維持してちらつきを防ぐ
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // 4. ターゲットコンテナ（メインマップラッパー）を検索
    const mainWrapper = document.getElementById(
      GG_CONSTANTS.SELECTORS.MAIN_WRAPPER_ID,
    );
    if (!mainWrapper) {
      this._warn("Main wrapper not found for overlay projection.");
      return;
    }

    // 5. Create or Reuse Overlay Container
    let overlay = document.getElementById("gg-left-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "gg-left-overlay";
      overlay.onclick = (e) => {
        e.stopPropagation();
        this.closeOverlay(); // クリックで閉じる
      };
      // 新規作成時は即座に追加
      mainWrapper.appendChild(overlay);
    }

    let imgIndex = imageIndex;
    if (imgIndex < 0 && title && typeof title === "string") {
      const match = title.match(/Image\s+(\d+)/);
      if (match) {
        imgIndex = parseInt(match[1], 10) - 1; // 1始まりを0始まりに変換
      }
    }

    // 可能であればストレージから高解像度画像を取得（分割戦略）
    chrome.storage.local.get(null).then((res) => {
      let displaySrc = imgData; // デフォルトはメッセージ経由の小さい画像
      let isHighRes = false;

      // 高解像度画像をチェック
      if (
        res.highResImages &&
        resolvedImgIndex >= 0 &&
        res.highResImages[resolvedImgIndex]
      ) {
        displaySrc = res.highResImages[resolvedImgIndex];
        isHighRes = true;
      } else {
        console.warn(
          `[GGAdviser:GridOverlay] High-Res Image fallback. Index=${resolvedImgIndex}`,
          res.highResImages
            ? `Length=${res.highResImages.length}`
            : "No Storage",
        );
      }

      if (!displaySrc) {
        console.warn(
          "[GGAdviser:GridOverlay] No image source available. Aborting overlay.",
        );
        return;
      }

      // 5. 構造設計: [サムネイルバー] [メイン分析画像]
      overlay.style.flexDirection = "column";
      overlay.style.justifyContent = "center";
      overlay.style.alignItems = "center";

      // レイアウト一括制御ラッパー (親要素であるoverlay/mainWrapperの全域を使用)
      const layoutWrapper = document.createElement("div");
      layoutWrapper.id = "gg-overlay-layout-wrapper";

      // 5a. サムネイルバー (上部エリア - 全体の20%を目標)
      const topbar = document.createElement("div");
      topbar.id = "gg-overlay-topbar";

      // グリッド状態の取得 (コンパス同期のために上に移動)
      const STORAGE_KEY_GRID = "gg_grid_visible";
      let isGridOn =
        res[STORAGE_KEY_GRID] !== undefined ? res[STORAGE_KEY_GRID] : true;
      this.initialGridState = isGridOn;

      if (res.highResImages && res.highResImages.length > 0) {
        res.highResImages.forEach((src, idx) => {
          const isActive = idx === resolvedImgIndex;
          // ラベル配置用のラッパー
          const thumbWrapper = document.createElement("div");
          thumbWrapper.className = "gg-overlay-thumb-wrapper";
          thumbWrapper.style.maxWidth = `${Math.floor(100 / res.highResImages.length)}%`;

          const thumb = document.createElement("img");
          thumb.src = src;
          thumb.className = `gg-overlay-thumb ${isActive ? "active" : "inactive"}`;

          thumb.onclick = (e) => {
            e.stopPropagation();
            const newTitle = `Image ${idx + 1}`;
            // 同じオーバーレイセッション内で手動で画像を切り替える場合、現在のlinkIdを保持するか？
            // 現状は単純に切り替える。
            this.showOverlay(null, null, newTitle);
          };

          thumbWrapper.appendChild(thumb);

          // コンパスラベルのオーバーレイ
          if (
            res.highResMetadata &&
            res.highResMetadata[idx] &&
            typeof res.highResMetadata[idx].heading === "number"
          ) {
            const heading = res.highResMetadata[idx].heading;
            let labelText = "";
            // 0-360正規化
            const h = ((heading % 360) + 360) % 360;

            // 単純な4方向マッピング (GeoGuessrの標準的な N/E/S/W ロジックに準拠)
            // 315-45: N, 45-135: E, 135-225: S, 225-315: W
            // メモ: 正確な境界を使用
            if (h >= 315 || h < 45) labelText = "N";
            else if (h >= 45 && h < 135) labelText = "E";
            else if (h >= 135 && h < 225) labelText = "S";
            else if (h >= 225 && h < 315) labelText = "W";

            if (labelText) {
              const label = document.createElement("div");
              label.innerText = labelText;
              label.className = "gg-compass-label";
              // グリッド状態に基づく初期可視性
              label.style.display = isGridOn ? "block" : "none";
              thumbWrapper.appendChild(label);
            }
          }

          topbar.appendChild(thumbWrapper);
        });
      } else {
        topbar.style.display = "none";
      }
      // 重複するappendはここで削除済み

      // 5b. メイン画像コンテナ (残りの80%を目標)
      const imgContainer = document.createElement("div");
      imgContainer.className = "gg-overlay-img-container";

      const img = document.createElement("img");
      img.src = displaySrc;
      img.className = "gg-overlay-main-img";

      img.addEventListener("click", (e) => {
        e.stopPropagation();
        // シングルクリックで閉じる機能や同期機能は削除されました
      });

      img.ondblclick = (e) => {
        e.stopPropagation();
        if (
          res.highResMetadata &&
          resolvedImgIndex >= 0 &&
          res.highResMetadata[resolvedImgIndex]
        ) {
          const meta = res.highResMetadata[resolvedImgIndex];
          if (meta && typeof meta.heading === "number") {
            window.dispatchEvent(
              new CustomEvent(GG_CONSTANTS.EVENTS.SYNC_POV, {
                detail: { heading: meta.heading, pitch: 0 },
              }),
            );
          }
        }
        this.closeOverlay();
      };

      // スケーリングロジック: コンテナに合わせて画像を最大化 (はみ出しを確実に防止)
      const updateImageScale = () => {
        const cw = imgContainer.clientWidth;
        const ch = imgContainer.clientHeight;
        if (!img.naturalWidth || !cw || !ch) return;

        // コンテナの枠内に「縦横どちらも」収まる最大の倍率を計算
        const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);

        // 小数点以下の誤差によるはみ出しを防ぐため Math.floor
        const targetW = Math.floor(img.naturalWidth * scale);
        const targetH = Math.floor(img.naturalHeight * scale);

        // % ではなく物理ピクセルで固定
        img.style.width = `${targetW}px`;
        img.style.height = `${targetH}px`;

        // グリッドとハイライトの再描画
        this._triggerRender(imgWrapper, img, res, resolvedImgIndex, coord);
        if (coord) {
          GridRenderer.renderHighlight(imgWrapper, img, coord, isHighRes);
        }
      };

      // 6. グリッドとハイライトの同期
      this.resizeObserver = new ResizeObserver(() => {
        updateImageScale();
      });
      this.resizeObserver.observe(imgContainer); // コンテナの変動を監視

      img.onload = () => {
        updateImageScale();
      };

      // グリッドON/OFF切り替えボタン
      const toggleBtn = document.createElement("div");
      toggleBtn.className = "gg-overlay-control-btn gg-grid-toggle-btn";

      // isGridOn definition moved up
      // const STORAGE_KEY_GRID = 'gg_grid_visible';
      // const isGridOn = (res[STORAGE_KEY_GRID] !== undefined) ? res[STORAGE_KEY_GRID] : true;

      const updateButtonStyle = (isOn) => {
        toggleBtn.innerText = isOn ? "Grid: ON" : "Grid: OFF";
        toggleBtn.classList.toggle("on", isOn);
        toggleBtn.dataset.isOn = isOn;
      };

      // Hover effects
      toggleBtn.onmouseenter = () => {
        toggleBtn.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
        toggleBtn.style.color = "white";
      };
      toggleBtn.onmouseleave = () => {
        const isOn = toggleBtn.dataset.isOn === "true";
        updateButtonStyle(isOn);
      };

      updateButtonStyle(isGridOn);

      toggleBtn.onclick = (e) => {
        e.stopPropagation();
        const gridLayer = document.getElementById("gg-grid-layer");
        if (gridLayer) {
          const currentDisplay = gridLayer.style.display;
          const newState = currentDisplay === "none";

          gridLayer.style.display = newState ? "grid" : "none";

          // コンパスラベルも切り替え
          const compassLabels = document.querySelectorAll(".gg-compass-label");
          compassLabels.forEach((el) => {
            el.style.display = newState ? "block" : "none";
          });

          updateButtonStyle(newState);
          toggleBtn.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
          chrome.storage.local.set({ [STORAGE_KEY_GRID]: newState });
          this.initialGridState = newState;
        }
      };

      this.initialGridState = isGridOn;

      // 5c. 画像ラッパー (画像 + グリッド + ボタンを一体化)
      const imgWrapper = document.createElement("div");
      imgWrapper.className = "gg-image-wrapper";

      imgWrapper.appendChild(img);
      imgWrapper.appendChild(toggleBtn);

      // ジャンプボタン (右上)
      const jumpBtn = document.createElement("div");
      jumpBtn.innerText = "JUMP";
      jumpBtn.className = "gg-overlay-control-btn gg-jump-btn";

      jumpBtn.onmouseenter = () =>
        (jumpBtn.style.backgroundColor = "rgba(0, 0, 0, 0.7)");
      jumpBtn.onmouseleave = () =>
        (jumpBtn.style.backgroundColor = "rgba(0, 0, 0, 0.3)");

      jumpBtn.onclick = (e) => {
        e.stopPropagation();

        if (
          res.highResMetadata &&
          resolvedImgIndex >= 0 &&
          res.highResMetadata[resolvedImgIndex]
        ) {
          const meta = res.highResMetadata[resolvedImgIndex];
          if (meta && typeof meta.heading === "number") {
            window.dispatchEvent(
              new CustomEvent(GG_CONSTANTS.EVENTS.SYNC_POV, {
                detail: { heading: meta.heading, pitch: 0 },
              }),
            );
          }
        }
        this.closeOverlay();
      };
      imgWrapper.appendChild(jumpBtn);

      const gridLayer = document.createElement("div");
      gridLayer.id = "gg-grid-layer";
      imgWrapper.appendChild(gridLayer);

      imgContainer.appendChild(imgWrapper);

      imgContainer.appendChild(imgWrapper);

      // クイズモード用のホバーインタラクション (グリッドセルによる遮蔽を避けるためラッパー上で処理)
      imgWrapper.onmouseenter = () => {
        // 画像全体の同期: GRID_HOVER を Gemini に送信 (coord=null)
        window.dispatchEvent(
          new CustomEvent(GG_CONSTANTS.EVENTS.GRID_HOVER, {
            detail: {
              coord: null,
              imgIndex: resolvedImgIndex + 1,
              isWholeImage: true,
            },
          }),
        );

        window.dispatchEvent(
          new CustomEvent("GG_GRID_HOVER_ENTER", {
            detail: { imageIndex: resolvedImgIndex },
          }),
        );
      };

      // マウスが離れた時にハイライトをクリア
      imgWrapper.onmouseleave = () => {
        this.clearAllHighlights();
        // Gemini の全体画像ホバーをクリア
        window.dispatchEvent(
          new CustomEvent(GG_CONSTANTS.EVENTS.GRID_HOVER, {
            detail: { coord: null, imgIndex: -1 },
          }),
        );
        window.dispatchEvent(new CustomEvent("GG_GRID_HOVER_LEAVE"));
      };

      layoutWrapper.appendChild(topbar);
      layoutWrapper.appendChild(imgContainer);

      overlay.innerHTML = "";
      overlay.appendChild(layoutWrapper);

      mainWrapper.appendChild(overlay);
      this.currentOverlayState = {
        imgWrapper,
        img,
        imgData,
        coord,
        title,
        isHighRes,
        imgIndex: resolvedImgIndex,
        linkId: linkId,
      };

      // グリッド描画とレスポンシブ対応のための ResizeObserver
      this.resizeObserver = new ResizeObserver(() => {
        if (img.clientWidth > 0 && img.clientHeight > 0) {
          this._triggerRender(imgWrapper, img, res, resolvedImgIndex, coord);
          // coordが渡されている場合はハイライトを再適用
          if (coord) this.highlightCell(coord, resolvedImgIndex);
        }
      });
      this.resizeObserver.observe(img);

      // 初期描画の試行 (既にロード済み、または ResizeObserver に時間がかかる場合)
      if (img.complete) {
        this._triggerRender(imgWrapper, img, res, resolvedImgIndex, coord);
        if (coord) this.highlightCell(coord, resolvedImgIndex);
      } else {
        img.onload = () => {
          this._triggerRender(imgWrapper, img, res, resolvedImgIndex, coord);
          if (coord) this.highlightCell(coord, resolvedImgIndex);
        };
      }
    });

    // メインラッパーの位置指定を保証
    const computedStyle = window.getComputedStyle(mainWrapper);
    if (computedStyle.position === "static") {
      mainWrapper.style.position = "relative";
    }
  }

  /**
   * 現在表示されているオーバーレイを閉じ、状態をリセットする。
   */
  closeOverlay() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    const existing = document.getElementById("gg-left-overlay");
    if (existing) existing.remove();
    this.currentOverlayState = null;
  }

  /**
   * 特定のグリッドセルをハイライトする。
   * @param {string|null} coord - 座標文字列（例: "A-1"）、ハイライト解除時は null
   * @param {number} requestedImgIndex - 画像のインデックス（現在は同一オーバーレイ内を想定）
   */
  highlightCell(coord, requestedImgIndex = -1) {
    if (!this.currentOverlayState?.imgWrapper || !this.currentOverlayState?.img)
      return;

    // ターゲット画像が現在のオーバーレイと一致するか確認
    if (
      requestedImgIndex >= 0 &&
      this.currentOverlayState.imgIndex !== requestedImgIndex
    ) {
      return;
    }

    const { imgWrapper, img, isHighRes } = this.currentOverlayState;
    GridRenderer.renderHighlight(imgWrapper, img, coord, isHighRes);
  }

  /**
   * 一度に複数のセルをハイライトする（Quiz OFFモード時のホバー用）。
   * @param {Array<{coord: string, imageIndex: number}>} clues
   */
  highlightAllClues(clues) {
    if (!this.currentOverlayState?.imgWrapper || !this.currentOverlayState?.img)
      return;
    const { imgWrapper, img, isHighRes, imgIndex } = this.currentOverlayState;

    // 既存のマルチレイヤーをクリア
    this.clearAllHighlights();

    const container = imgWrapper;
    const multiLayer = document.createElement("div");
    multiLayer.id = "gg-multi-highlight-layer";
    multiLayer.style.position = "absolute";
    multiLayer.style.top = "0";
    multiLayer.style.left = "0";
    multiLayer.style.width = "100%";
    multiLayer.style.height = "100%";
    multiLayer.style.zIndex = "1000";
    multiLayer.style.pointerEvents = "none";
    container.appendChild(multiLayer);

    // 現在の画像に対するヒントをフィルタリング
    const currentClues = clues.filter(
      (c) => parseInt(c.imageIndex, 10) === parseInt(imgIndex, 10),
    );

    currentClues.forEach((c) => {
      GridRenderer.renderSingleHighlightTo(multiLayer, img, c.coord, isHighRes);
    });
  }

  /**
   * すべてのグリッドハイライト（単一、複数）を消去する。
   */
  clearAllHighlights() {
    const multi = document.getElementById("gg-multi-highlight-layer");
    if (multi) multi.remove();

    // フォーカスハイライトもクリアする必要があるか？
    // ユーザー要件: "リスト側にカーソルが入るとハイライトが消える"
    // 一貫性のため、フォーカスされたものもクリアする。
    const focal = document.getElementById("gg-highlight-layer");
    if (focal) focal.remove();
  }
}
