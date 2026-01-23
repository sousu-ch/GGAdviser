/**
  * map_extractor.js
 * map-making.app のメインワールドで実行される。
 * Google Maps のプロトタイプとコンストラクターを乗っ取り、アクティブな StreetViewPanorama をキャプチャする。
 */

(function () {
  const DEBUG = false;

  const _warn = (msg) => { if(DEBUG) console.warn(`[GGAdviser:Main:WARN] ${msg}`); };
  const _error = (msg, err) => { if(DEBUG) console.error(`[GGAdviser:Main:ERROR] ${msg}`, err || ""); };

  // クリップボード保護 (モンキーパッチ)
  // ユーザーがパネル内でテキストを選択しているときに、アプリが Ctrl+C を乗っ取るのを防ぐ。
  if (navigator.clipboard && navigator.clipboard.writeText) {
      const originalWriteText = navigator.clipboard.writeText;
      navigator.clipboard.writeText = async function(text) {
          try {
              // ユーザーが拡張機能パネル内で選択しているかどうかを確認
              const selection = window.getSelection();
              if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
                  const anchorNode = selection.anchorNode;
                  // 拡張機能パネル内にいるかどうかを確認するために上にトラバース
                  let current = anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode;
                  while (current) {
                      if (current.id === "gg-gemini-panel" || (current.classList && current.classList.contains("gg-side-panel-content"))) {
                          _warn("アプリのクリップボード乗っ取りをブロックしました。ユーザー選択の書き込みを強制します。");
                          // アプリの URL の代わりにユーザーの選択を強制的に書き込む
                          return originalWriteText.call(navigator.clipboard, selection.toString());
                      }
                      current = current.parentElement;
                  }
              }
          } catch (e) {
              _error("Clipboard patch check failed", e);
          }
          // デフォルト: アプリによるクリップボードへの書き込みを許可
          return originalWriteText.apply(this, arguments);
      };
  }



  let capturedPano = null;
  let originalState = null; // 復元のために元の状態を追跡
  let panoContainer = null;

  /**
   * 指定された GMap インスタンスの DOM コンテナを見つけようとする。
   * Google Maps の構造では、通常すべてが .gm-style div の中に配置される。
   */
  function findContainer(instance) {
    if (instance.getContainer && typeof instance.getContainer === "function") {
      return instance.getContainer();
    }
    if (instance.getDiv && typeof instance.getDiv === "function") {
      return instance.getDiv();
    }

    // 戦略: StreetView メタデータを含む .gm-style を検索する
    const scripts = document.querySelectorAll(".gm-style");
    for (const div of scripts) {
      if (div.closest("#" + GG_CONSTANTS.SELECTORS.MAIN_WRAPPER_ID)) continue;
      // StreetView 固有のマーカー (リンクまたはウィジェット) を確認
      if (
        div.querySelector('a[href*="maps/streetview"]') ||
        div.querySelector(".gm-sv-label")
      ) {
        return div.parentElement || div;
      }
    }

    // 最終候補: 利用可能な最初のマップのような div
    return document.querySelector(
      `.gm-style:not(#${GG_CONSTANTS.SELECTORS.MAIN_WRAPPER_ID} .gm-style)`,
    )?.parentElement;
  }

  function captureStats(instance, container = null) {
    if (instance) {
      capturedPano = instance;
      if (container) {
        panoContainer = container;
      } else if (!panoContainer) {
        panoContainer = findContainer(instance);
      }

      if (panoContainer) {
        if (
          !panoContainer.classList.contains(GG_CONSTANTS.CLASSES.PANO_TARGET)
        ) {

          panoContainer.classList.add(GG_CONSTANTS.CLASSES.PANO_TARGET);
        }

        // 祖先のタグ付け (堅牢版)
        // すべての親とコンテナ自体にタグを付け、CSS でレイアウト制約を無効化できるようにする
        let current = panoContainer;
        while (current && current !== document.body) {
          if (
            current.classList &&
            !current.classList.contains(GG_CONSTANTS.CLASSES.PANO_ANCESTOR)
          ) {
            current.classList.add(GG_CONSTANTS.CLASSES.PANO_ANCESTOR);

            // 元の可視性を一度だけ保存
            if (current.dataset.ggOrigVisibility === undefined) {
              current.dataset.ggOrigVisibility = current.style.visibility || "";
            }
          }
          // キャプチャ中はパスを表示する必要がある
          current.style.visibility = "visible";
          current = current.parentElement;
        }
      }
    }
  }

  function applyHijack() {
    if (
      !window.google ||
      !window.google.maps ||
      !window.google.maps.StreetViewPanorama
    )
      return;

    // 1. コンストラクター乗っ取り (作成時にキャプチャ)
    if (!window.google.maps.StreetViewPanorama.__ggHijackedConstructor) {

      const OriginalConstructor = window.google.maps.StreetViewPanorama;

      window.google.maps.StreetViewPanorama = function (container, ...args) {
        const instance = new OriginalConstructor(container, ...args);
        captureStats(instance, container);
        return instance;
      };

      // 念のため静的プロパティをコピー
      Object.assign(window.google.maps.StreetViewPanorama, OriginalConstructor);
      window.google.maps.StreetViewPanorama.prototype =
        OriginalConstructor.prototype;
      window.google.maps.StreetViewPanorama.__ggHijackedConstructor = true;
    }

    // 2. プロトタイプ乗っ取り (インタラクション/更新時にキャプチャ)
    const proto = window.google.maps.StreetViewPanorama.prototype;
    if (!proto.__ggHijackedProto) {

      ["setPosition", "setPov", "setVisible", "setZoom"].forEach(
        (methodName) => {
          if (proto[methodName]) {
            const original = proto[methodName];
            proto[methodName] = function (...args) {
              captureStats(this);
              return original.apply(this, args);
            };
          }
        },
      );
      proto.__ggHijackedProto = true;
    }
  }

  // 遅延ロードチェック
  // 最適化: window.google.maps の作成をトラップ
  function startWatch() {
    if (
      window.google &&
      window.google.maps &&
      window.google.maps.StreetViewPanorama
    ) {
      applyHijack();
    } else {
      // Poll faster
      const interval = setInterval(() => {
        if (
          window.google &&
          window.google.maps &&
          window.google.maps.StreetViewPanorama
        ) {
          applyHijack();
          clearInterval(interval);
        }
      }, 50); // 50ms check
    }
  }
  startWatch();

  // リクエストリスナー
  window.addEventListener(GG_CONSTANTS.EVENTS.REQUEST_MAP_DATA, (e) => {
    const responseData = { success: false, data: null, error: null };
    if (capturedPano) {
      try {
        const pos = capturedPano.getPosition();
        const pov = capturedPano.getPov();
        if (pos && pov) {
          // [CLEAN CAPTURE] 元のオプションを保存
          originalState = {
            heading: pov.heading,
            pitch: pov.pitch,
            zoom: capturedPano.getZoom(),
            options: {
              clickToGo: capturedPano.get("clickToGo"),
              linksControl: capturedPano.get("linksControl"),
              panControl: capturedPano.get("panControl"),
              addressControl: capturedPano.get("addressControl"),
              showRoadLabels: capturedPano.get("showRoadLabels"),
              fullscreenControl: capturedPano.get("fullscreenControl"),
              zoomControl: capturedPano.get("zoomControl"),
            },
          };


          // [CLEAN CAPTURE] スクリーンショットのためにすべての UI を無効化
          capturedPano.setOptions({
            clickToGo: false,
            linksControl: false,
            panControl: false,
            addressControl: false,
            showRoadLabels: false,
            fullscreenControl: false,
            zoomControl: false,
          });

          responseData.success = true;
          responseData.data = {
            lat: pos.lat(),
            lng: pos.lng(),
            heading: pov.heading,
            pitch: pov.pitch,
            zoom: originalState.zoom,
          };
        } else {
          responseData.error = "Pano instance found but data is not ready.";
        }
      } catch (err) {
        responseData.error = "Error: " + err.message;
      }
    } else {
      responseData.error = "No StreetView instance captured yet.";
    }
    window.dispatchEvent(
      new CustomEvent(GG_CONSTANTS.EVENTS.MAP_DATA_RESPONSE, {
        detail: responseData,
      }),
    );
  });

  /**
   * 回復ロジック
   * キャプチャモード終了時に元の可視性を復元する。
   */
  window.addEventListener(GG_CONSTANTS.EVENTS.EXIT_CAPTURE, () => {


    // 元のパノラマ状態を復元
    if (capturedPano && originalState) {


      // オプションを復元
      if (originalState.options) {
        capturedPano.setOptions(originalState.options);
      }

      capturedPano.setPov({
        heading: originalState.heading,
        pitch: originalState.pitch,
      });
      capturedPano.setZoom(originalState.zoom);
      google.maps.event.trigger(capturedPano, "resize");
      originalState = null; // クリア
    }

    const tagged = document.querySelectorAll(
      "." + GG_CONSTANTS.CLASSES.PANO_ANCESTOR,
    );
    tagged.forEach((el) => {
      if (el.dataset.ggOrigVisibility !== undefined) {
        el.style.visibility = el.dataset.ggOrigVisibility;
      }
      el.classList.remove(GG_CONSTANTS.CLASSES.PANO_ANCESTOR);
    });

    const target = document.querySelector(
      "." + GG_CONSTANTS.CLASSES.PANO_TARGET,
    );
    if (target) {
      target.classList.remove(GG_CONSTANTS.CLASSES.PANO_TARGET);
    }
  });

  /**
   * パノラマの位置、POV、ズームを更新する。
   * 場所が大幅に変更された場合は true を返す。
   */
  function updatePanoState(data) {
    let locationChanged = false;

    // 1. 位置の更新
    if (data.lat && data.lng) {
      const currentPos = capturedPano.getPosition();
      const newPos = { lat: parseFloat(data.lat), lng: parseFloat(data.lng) };
      const dist = currentPos
        ? Math.abs(currentPos.lat() - newPos.lat) +
          Math.abs(currentPos.lng() - newPos.lng)
        : 1;

      if (dist > 0.000001) {

        capturedPano.setPosition(newPos);
        locationChanged = true;
      }
    }

    // 2. 方位/角度の更新
    capturedPano.setPov({
      heading: parseFloat(data.heading),
      pitch: parseFloat(data.pitch || 0),
    });
    capturedPano.setZoom(0);

    // 3. 強制リサイズ
    google.maps.event.trigger(capturedPano, "resize");

    return locationChanged;
  }

  /**
   * イベントと複数のフォールバックを使用して「スマート待機」ロジックを調整する。
   */
  function waitForPanoReady(locationChanged) {
    let readyDispatched = false;
    const startTime = Date.now();
    const MAX_WAIT = 1000;

    const sendReady = (source, extra = {}) => {
      if (readyDispatched) return;
      readyDispatched = true;
      if (checkInterval) clearInterval(checkInterval);
      if (tilesLoadedListener)
        google.maps.event.removeListener(tilesLoadedListener);

      const elapsed = Date.now() - startTime;
      const metaData = {
        date: capturedPano.getPhotographDate
          ? capturedPano.getPhotographDate()
          : null,
        source: source,
        timeSpent: elapsed,
        ...extra,
      };


      window.dispatchEvent(
        new CustomEvent(GG_CONSTANTS.EVENTS.PANO_READY, {
          detail: { ...metaData, fast: true },
        }),
      );
    };

    // 1. プライマリ: 公式イベント
    const tilesLoadedListener = google.maps.event.addListenerOnce(
      capturedPano,
      "tilesloaded",
      () => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= 300) {
          sendReady("EVENT_tilesloaded");
        } else {
          setTimeout(
            () => sendReady("EVENT_tilesloaded_delayed"),
            300 - elapsed,
          );
        }
      },
    );

    // 2. セカンダリ: アクティブポーリング
    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed < 100) return;

      let foundHighRes = false;
      let loadingHighRes = false;
      let highResCount = 0;
      let anyImgCount = 0;
      let canvasCount = 0;
      let sampleUrl = "";

      if (panoContainer) {
        const imgs = panoContainer.querySelectorAll("img");
        anyImgCount = imgs.length;
        if (anyImgCount > 0 && !sampleUrl)
          sampleUrl = imgs[0].src.substring(0, 100);

        for (const img of imgs) {
          const src = img.src || "";
          const isTile =
            src.includes("khms") ||
            src.includes("tile") ||
            src.includes("/vt/") ||
            src.includes("ggpht.com");
          const isLarge = img.naturalWidth > 50 || !img.complete;

          if (isTile && isLarge) {
            foundHighRes = true;
            highResCount++;
            if (!img.complete || img.naturalWidth === 0) {
              loadingHighRes = true;
            }
          }
        }
        canvasCount = panoContainer.querySelectorAll("canvas").length;
      }

      const statusOk = capturedPano.getStatus() === "OK";
      const diag = {
        images: anyImgCount,
        highRes: highResCount,
        canvas: canvasCount,
        sample: sampleUrl,
      };

      if (statusOk) {
        if (foundHighRes && !loadingHighRes && elapsed >= 300) {
          sendReady("POLL_visual_highres", diag);
        } else if (!foundHighRes && elapsed >= 750) {
          sendReady("POLL_no_tiles_fallback_safe", diag);
        }
      }

      if (elapsed >= MAX_WAIT) {
        sendReady("TIMEOUT_hard_limit_1s", diag);
      }
    }, 50);
  }

  window.addEventListener(GG_CONSTANTS.EVENTS.SET_POV_FAST, (e) => {
    if (!capturedPano || !e.detail) return;


    captureStats(capturedPano);

    // 状態更新を実行し、準備完了追跡をトリガーする
    const locationChanged = updatePanoState(e.detail);
    waitForPanoReady(locationChanged);
  });

  // [NEW] UI インタラクション用のクリーン同期 (キャプチャモードの副作用なし)
  window.addEventListener(GG_CONSTANTS.EVENTS.SYNC_POV, (e) => {
    if (!capturedPano || !e.detail) return;


    capturedPano.setPov({
      heading: parseFloat(e.detail.heading),
      pitch: parseFloat(e.detail.pitch || 0),
    });
    capturedPano.setZoom(0);
  });
})();
