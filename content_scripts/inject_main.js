// inject_main.js
// メインワールドで実行される (隔離ワールドの制限を回避、src 注入によって承認済み)

(function () {


  let activePano = null;
  let _signalTimeout = null;
  let _ggPanoReadySent = false;

  /**
   * Pano のキャプチャ準備が整ったことを通知する。
   * 「状態変更」ごとに一度だけ送信されるように一元管理されている。
   */
  function signalPanoReady(delay = 500) {
    if (_ggPanoReadySent) return;

    if (_signalTimeout) clearTimeout(_signalTimeout);
    _signalTimeout = setTimeout(() => {
      if (_ggPanoReadySent) return;

      _ggPanoReadySent = true;
      window.dispatchEvent(new CustomEvent("GG_PANO_READY_EVENT"));
    }, delay);
  }

  function ensureOverlay(id, isCapture) {
    let div = document.getElementById(id);
    if (div) return div;

    div = document.createElement("div");
    div.id = id;

    if (isCapture) {
      // 絶対/固定フルスクリーンを強制
      div.style.cssText = `
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                z-index: 2147483647 !important;
                background-color: black !important;
                display: block !important;
                visibility: visible !important;
            `;
      document.body.style.setProperty("overflow", "hidden", "important");
      window.scrollTo(0, 0);
    } else {
      // 結果表示モード
      div.style.cssText = `
                width: 100% !important;
                height: 100% !important;
                position: relative !important;
                z-index: 1 !important;
                display: block !important;
                visibility: visible !important;
            `;
    }

    document.body.appendChild(div);
    return div;
  }

  function initPano(data) {

    _ggPanoReadySent = false; // 新しいパノラマのためにリセット

    if (
      !window.google ||
      !window.google.maps ||
      !window.google.maps.StreetViewPanorama
    ) {

      setTimeout(() => initPano(data), 500);
      return;
    }

    // モード検出: メッセージデータを優先、フォールバックとしてレガシーハッシュを使用
    const isCapture =
      data.mode === "capture" || location.hash.includes("gg_capture=true");
    const isResult =
      data.mode === "result" || location.hash.includes("gg_mode=result");

    const divId = isResult ? "gg-result-pano" : "ggadvice-clean-viewer";
    const div = ensureOverlay(divId, isCapture);

    if (!div && !isCapture && !isResult) {

      return;
    }

    const pos = { lat: parseFloat(data.lat), lng: parseFloat(data.lng) };
    const pov = {
      heading: parseFloat(data.heading),
      pitch: parseFloat(data.pitch || 0),
    };

    try {
      if (!activePano) {
          

        activePano = new google.maps.StreetViewPanorama(div, {
          position: pos,
          pov: pov,
          zoom: 1,
          showRoadLabels: false,
          disableDefaultUI: true,
          clickToGo: false,
          scrollwheel: false,
          visible: true,
        });

        activePano.addListener("status_changed", () => {

          // ステータス変更後に準備完了を通知 (タイル読み込みのためにわずかな遅延)
          signalPanoReady(1200);
        });

        activePano.addListener("tilesloaded", () => {
          // タイルが確実に読み込まれた場合は遅延を短縮
          signalPanoReady(400); // Shorter delay if tiles are definitely loaded
        });

        // 初回ロード用のグローバル安全タイムアウト
        setTimeout(() => signalPanoReady(0), 4000);
      } else {
        // 位置と視点を更新
        activePano.setPosition(pos);
        activePano.setPov(pov);
        signalPanoReady(1500); // 更新用のフォールバック
      }

      // 強制サイズ変更は可視性のために重要
      setTimeout(() => {
        google.maps.event.trigger(activePano, "resize");
      }, 100);
    } catch (e) {
      console.error("GGAdviser_MAIN: Pano Error", e);
      signalPanoReady(0); // ハングアップを避けるため、エラー時でもとにかく続行
    }
  }

  function updatePov(data) {

    if (!activePano) {
      initPano(data);
      return;
    }

    _ggPanoReadySent = false; // 新しいアングルのためにリセット
    activePano.setPov({
      heading: parseFloat(data.heading),
      pitch: parseFloat(data.pitch || 0),
    });

    google.maps.event.trigger(activePano, "resize");

    // タイル更新が必要な場合に備えて遅延後に準備完了を通知
    signalPanoReady(800);
  }

  // イベントリスナーの登録

  window.addEventListener("GG_MANUAL_INJECT", (e) => {
    if (e.detail) initPano(e.detail);
  });

  window.addEventListener("GG_UPDATE_POV", (e) => {
    if (e.detail) updatePov(e.detail);
  });

  document.documentElement.dataset.ggBridgeReady = "true";
  window.dispatchEvent(new CustomEvent("GG_BRIDGE_READY"));

  // [非推奨] ハッシュによる自動開始。現在は Bridge からの MANUAL_INJECT を待機する。

})();
