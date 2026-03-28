/**
 * GameUI.js
 * サイドバー内の「Meta Hunter」インターフェース全体を管理するクラス。
 * 解析されたメタデータの表示、チャット画面の切り替え、入力エリアの管理を行う。
 * 実際のDOM描画や通信の一部は MessageRenderer および GeminiService に委譲されている。
 */
class GameUI {
  static DEBUG = false;
  constructor() {

    this.container = null;
    this.metaTable = null;
    this.currentData = null; // 切り替え時の再描画用に保存
    this.currentTab = "chat";
    this.chatView = null;
    this.metaView = null;
    this.messageRenderer = new MessageRenderer();
    this.geminiService = new GeminiService();
    this._isWaitingForResponse = false;
    // Always "Analyze Mode" (Quiz flag removed)
    this._init();
  }

  /**
   * チャット（Markdown）ビューとメタ（テーブル）ビューの表示を切り替える。
   * @param {string} mode - 'chat' または 'meta'
   */
  setTabMode(mode) {
    this.currentTab = mode;
    if (!this.container) return; // Wait for clean init

    // ロジックベースのレイアウト切り替え
    // Chat Mode: Sticky FooterのためのFlex Column
    // Meta Mode: 堅牢性のための標準Block (レガシー動作を復元)
    if (mode === "chat") {
      this.container.style.display = "flex";
      this.container.style.flexDirection = "column";
      this.container.style.overflow = "hidden"; // Flexコンテナ自体はスクロールしない
      if (this.scrollArea) {
        this.scrollArea.style.overflowY = "auto"; // 子要素がスクロールする
      }
    } else {
      this.container.style.display = "block";
      this.container.style.overflowY = "auto"; // コンテナがスクロールする
      if (this.scrollArea) {
        this.scrollArea.style.overflowY = "visible";
      }
    }

    if (this.chatContainer) {
      this.chatContainer.style.display = mode === "chat" ? "block" : "none";
    }
    if (this.metaContainer) {
      this.metaContainer.style.display = mode === "meta" ? "block" : "none";
    }

    // 入力エリアの可視性を切り替え
    // 入力はチャットモードでのみ表示されるべき
    const inputBlock = this.container.querySelector(".gg-input-block");
    if (inputBlock) {
      inputBlock.style.display = mode === "chat" ? "block" : "none";
    }


  }

  _init() {
    // SplitViewManager がパネルを作成するのを待つ
    // 描画時にコンテナを確認する

    // データを監視
    window.addEventListener(GG_CONSTANTS.EVENTS.GAME_DATA_FETCH, (e) => {
      this.currentData = e.detail;
      this.setWaitingState(false);
      this.renderTable(e.detail);
    });

    // 分析開始時に待機状態を同期
    window.addEventListener(GG_CONSTANTS.EVENTS.ANALYSIS_START, () => {

      this._ensureSkeletalLayout();
      this._isWaitingForResponse = true;
      this.setWaitingState(true);
    });

    // 集中同期リスナー (gemini.js の動作をミラーリング)
    window.addEventListener(GG_CONSTANTS.EVENTS.GRID_HOVER, (e) => {
      const { coord, imgIndex } = e.detail;
      this._handleSyncEvent(
        GG_CONSTANTS.EVENTS.GRID_HOVER,
        coord,
        imgIndex - 1,
      );
    });

    window.addEventListener(GG_CONSTANTS.EVENTS.GRID_CLICK, (e) => {
      const { coord, imgIndex } = e.detail;
      this._handleSyncEvent(
        GG_CONSTANTS.EVENTS.GRID_CLICK,
        coord,
        imgIndex - 1,
      );
    });

    // 必要な場合、Iframe -> Sidebar 同期も監視
    // (現在は Iframe は Page/Grid とのみ通信するが、Sidebar も反応すべき)
    window.addEventListener(GG_CONSTANTS.EVENTS.HINT_HOVER, (e) => {
      const { coord, imgIndex } = e.detail;
      this._handleSyncEvent(
        GG_CONSTANTS.EVENTS.GRID_HOVER,
        coord,
        imgIndex,
        true,
      ); // テキストサイドから
    });

    window.addEventListener(GG_CONSTANTS.EVENTS.HINT_CLICK, (e) => {
      const { coord, imgIndex } = e.detail;
      this._handleSyncEvent(GG_CONSTANTS.EVENTS.GRID_CLICK, coord, imgIndex);
    });
  }

  /**
   * グリッド座標に基づいてヒントをアンロック（表示）し、フォーカスする。
   * @param {string} targetCoord - 対象の座標 (例: "A-2")
   * @param {boolean} skipScroll - 真の場合、リストの先頭への自動スクロールをスキップする
   */
  unlockClue(targetCoord, skipScroll = false) {
    if (!this.container) return;

    // 一致する dataset.coord を持つ全てのリストアイテムを検索
    const items = this.container.querySelectorAll(
      `.gg-clue-li[data-coord="${targetCoord}"]`,
    );
    if (items.length === 0) return;

    // 混乱を避けるため、まず全ての選択ハイライトをクリア
    document
      .querySelectorAll(".gg-clue-li")
      .forEach((el) => el.classList.remove("selected"));

    items.forEach((item) => {
      const body = item.querySelector(".gg-clue-body");
      if (body) {
        body.classList.remove("masked");
        body.classList.add("revealed");
      }
      // 一致する全てのアイテムをハイライト
      item.classList.add("selected");
    });

    // フィードバック: 以前はここに scrollIntoView がありましたが、ユーザー体験向上のため削除しました。
  }

  /**
   * サイドバーに必要な骨組みレイアウトが存在することを保証する。
   * これにより、最初のデータ到着前でも「停止」ボタンなどを表示可能にする。
   */
  _ensureSkeletalLayout() {
    this.container = document.getElementById("gg-meta-panel");
    if (!this.container) {
      if (GameUI.DEBUG) console.warn("[GameUI] Meta Panel not found. Is Split View active?");
      return;
    }

    // scrollArea が存在しない、または破棄されている場合のみ初期化
    if (!this.scrollArea || !document.getElementById("gg-scroll-area")) {

      this.container.innerHTML = "";
      this.container.className = "gg-meta-panel-container";

      // スクロールエリア (利用可能な全スペースを使用)
      this.scrollArea = document.createElement("div");
      this.scrollArea.id = "gg-scroll-area";
      this.scrollArea.className = "gg-scroll-area";
      this.container.appendChild(this.scrollArea);

      // ビュー切り替え用のコンテナ
      this.chatContainer = document.createElement("div");
      this.chatContainer.id = "gg-chat-container";
      this.chatContainer.style.display = "none";

      this.metaContainer = document.createElement("div");
      this.metaContainer.id = "gg-meta-container";
      this.metaContainer.style.display = "none";

      this.scrollArea.appendChild(this.chatContainer);
      this.scrollArea.appendChild(this.metaContainer);

      // 入力エリアを描画 (Flex Footer)
      this._renderInputArea();

      // 統一されたコンテナで MessageRenderer を初期化
      this.messageRenderer.setContainers(
        this.chatContainer,
        this.scrollArea,
        this.inputArea,
      );

      // 分析開始時にチャット履歴をクリア（内部リスナー）
      window.addEventListener("GG_ANALYSIS_START", () => {
        this.messageRenderer.clearChat();
      });

      // 初期タブの可視性を設定
      this.setTabMode(this.currentTab);
    }
  }

  /**
   * 解析結果のメタデータをサイドバーパネルに描画する。
   * @param {Object} data - Gemini から返された解析済みの JSON データ
   */
  renderTable(data) {

    if (!data) return;

    // 基本構造（スクロールエリア、入力エリア等）があることを確認
    this._ensureSkeletalLayout();

    // metaContainer をリセットして再構築（スケルトンは維持）
    if (this.metaContainer) {
      this.metaContainer.innerHTML = "";
    }
    // metaContainer を常にクリアして再構築（現在のヒント）
    if (this.metaContainer) {
      this.metaContainer.innerHTML = "";
    }

    // 初期のAIメッセージ
    if (data.explanationText) {
      this.chatView = this.messageRenderer.appendAiMessage(
        data.explanationText,
      );
    } else {
      this.chatView = null;
    }

    // メインリストコンテナを作成
    const listContainer = document.createElement("div");
    listContainer.className = "gg-meta-list";
    this.metaView = listContainer;

    // ... existing code ...

    // リストにマウスが入った時にハイライトをクリア
    listContainer.onmouseenter = () => {
      // 1. 写真グリッドのハイライトをクリア
      window.dispatchEvent(new CustomEvent("GG_HIGHLIGHT_CLEAR_REQ"));

      // 2. リストのホバー状態をクリア
      this.container.querySelectorAll(".gg-clue-li").forEach((li) => {
        li.classList.remove("gg-clue-hover");
      });
    };

    // 2. グローバルヒント（コンパクト行）
    if (data.global_clues) {
      const globalSection = document.createElement("div");
      globalSection.className = "gg-global-section compact";

      // アクション行（画像/クイズボタン）は計画通り削除。

      // アイコンマップ
      const icons = {
        country: "🏳️",
        region:
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
        driving_side:
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>',
      };

      const keys = ["country", "region", "driving_side"];

      keys.forEach((key) => {
        let value = data.global_clues[key];
        let icon = icons[key] || "🔹";

        if (value) {
          if (key === "country") {
            const match = value.match(
              /^((?:[\uD800-\uDBFF][\uDC00-\uDFFF])+)\s*(.*)/,
            );
            if (match) {
              icon = match[1];
              value = match[2];

              try {
                const codePoints = [...icon].map((c) => c.codePointAt(0));
                if (codePoints.length >= 2) {
                  const OFFSET = 127462 - 65;
                  const iso = codePoints
                    .map((cp) => String.fromCharCode(cp - OFFSET))
                    .join("")
                    .toLowerCase();
                  if (iso.length === 2 && /[a-z]{2}/.test(iso)) {
                    const flagPath = chrome.runtime.getURL(`assets/flags/${iso}.png`);
                    icon = `<img src="${flagPath}" class="gg-flag-icon" alt="${iso}">`;
                  }
                }
              } catch (e) {
                if (GameUI.DEBUG) console.warn("[GameUI] Flag conversion failed", e);
              }
            }
          }

          const chip = document.createElement("div");
          chip.className = "gg-info-chip";
          chip.innerHTML = `
                        <span class="gg-icon">${icon}</span>
                        <span class="gg-text">${value}</span>
                    `;
          globalSection.appendChild(chip);
        }
      });
      listContainer.appendChild(globalSection);
    }

    // 区切り線
    const divider = document.createElement("div");
    divider.className = "gg-meta-divider";
    // divider.innerText = "LOCAL CLUES";
    listContainer.appendChild(divider);

    // 3. ローカルヒント（リスト）
    if (data.local_clues && Array.isArray(data.local_clues) && data.local_clues.length > 0) {
      const ul = document.createElement("ul");
      ul.className = "gg-clue-list-ul";

      data.local_clues.forEach((clue, index) => {
        const li = document.createElement("li");
        li.className = "gg-clue-li";

        let coord = null;
        if (
          clue.coordinates &&
          Array.isArray(clue.coordinates) &&
          clue.coordinates.length > 0
        ) {
          coord = clue.coordinates[0];
        }

        if (coord) {
          li.dataset.coord = coord;
        }

        const imgIdx =
          typeof clue.image_index !== "undefined"
            ? parseInt(clue.image_index, 10) - 1
            : -1;
        const linkId = `sidebar-clue-${index}`;
        li.dataset.imgIndex = imgIdx;
        li.dataset.linkId = linkId;

        li.addEventListener("mouseenter", () => {
          // グリッドとチャットへの同期をディスパッチ
          window.dispatchEvent(
            new CustomEvent(GG_CONSTANTS.EVENTS.HINT_HOVER, {
              detail: { coord: coord, imgIndex: imgIdx },
            }),
          );
        });

        li.addEventListener("mouseleave", () => {
          window.dispatchEvent(
            new CustomEvent(GG_CONSTANTS.EVENTS.HINT_HOVER, {
              detail: { coord: null, imgIndex: imgIdx },
            }),
          );
        });

        li.addEventListener("click", (e) => {

          e.stopPropagation();

          // 同期をディスパッチ
          window.dispatchEvent(
            new CustomEvent(GG_CONSTANTS.EVENTS.HINT_CLICK, {
              detail: { coord, imgIndex: imgIdx, linkId },
            }),
          );

          // オーバーレイを開くトリガー
          window.dispatchEvent(
            new CustomEvent("GG_SHOW_EVIDENCE_REQ", {
              detail: {
                coord,
                imgIndex: imgIdx,
                title: clue.title || `Image ${imgIdx + 1}`,
                linkId,
              },
            }),
          );
        });

        li.innerHTML = `
                    <div class="gg-clue-header-row">
                        <span class="gg-clue-title">${clue.title || "Unknown Clue"}</span>
                        ${coord ? `<span class="gg-clue-tag">${this._getDirLabel(clue.image_index)} ${coord}</span>` : ""}
                    </div>
                    ${clue.description ? `
                    <div class="gg-clue-body">
                        ${clue.description}
                    </div>` : ""}
                `;
        ul.appendChild(li);
      });
      listContainer.appendChild(ul);
    }

    // 4. 追加とタブ可視性の適用
    this.metaContainer.appendChild(listContainer);


    // タブ可視性を適用
    this.setTabMode(this.currentTab);
  }

  /**
   * 画像インデックス（1始まり）を方向ラベルにマッピングする。
   * @param {number} index
   * @returns {string}
   */
  _getDirLabel(index) {
    const labels = {
      1: "N",
      2: "E",
      3: "S",
      4: "W",
    };
    return labels[index] || "";
  }



  _highlightAllOnGrid(activeImageIndex, specificCoord = null) {
    if (!this.currentData || !this.currentData.local_clues) return;

    let targetClues = this.currentData.local_clues;
    if (typeof activeImageIndex === "number" && activeImageIndex >= 0) {
      targetClues = targetClues.filter(
        (c) => parseInt(c.image_index, 10) - 1 === activeImageIndex,
      );
    }

    if (specificCoord) {
      targetClues = targetClues.filter(
        (c) => c.coordinates && c.coordinates.includes(specificCoord),
      );
    }

    const allCoords = targetClues
      .filter((c) => c.coordinates && c.coordinates.length > 0)
      .map((c) => ({
        coord: c.coordinates[0],
        imageIndex:
          typeof c.image_index !== "undefined"
            ? parseInt(c.image_index, 10) - 1
            : -1,
      }));

    window.dispatchEvent(
      new CustomEvent("GG_HIGHLIGHT_ALL_REQ", {
        detail: { clues: allCoords },
      }),
    );
  }

  /**
   * 特定の画像に対応するサイドバーリスト内の全てのヒントをハイライトする。
   * @param {number} imgIndex - 0始まりの画像インデックス
   */
  _highlightAllInList(imgIndex) {
    // data-img-index は renderTable で0始まりとして保存される
    const clues = this.container.querySelectorAll(
      `.gg-clue-li[data-img-index="${imgIndex}"]`,
    );
    clues.forEach((li) => li.classList.add("gg-clue-hover"));
  }

  /**
   * サイドバーのLI要素に対する統一された状態処理
   */
  _handleSyncEvent(action, coord, imgIndex, isFromTextSide = false) {
    if (!this.container) return;

    if (action === GG_CONSTANTS.EVENTS.GRID_HOVER) {
      // リストとリンクからホバークラスをクリア
      this.container
        .querySelectorAll(".gg-clue-li.gg-clue-hover")
        .forEach((li) => li.classList.remove("gg-clue-hover"));
      this.container
        .querySelectorAll(".gg-hint-link.gg-active-amber")
        .forEach((a) => a.classList.remove("gg-active-amber"));

      if (imgIndex === -1) {
        // 青色ハイライトも強制クリア
        this.container
          .querySelectorAll(".gg-clue-li.selected")
          .forEach((li) => li.classList.remove("selected"));
        return;
      }

      // [REQ 1] 青色選択ロジックをクリア
      // ユーザー要件: "別のグリッドに移動したら青ハイライトを消す"
      // グリッドホバーは coord=null (全てハイライト) を送るため、任意のグリッドホバーは「特定の選択から離れた」とみなす。
      if (!isFromTextSide) {
        this.container
          .querySelectorAll(
            ".gg-clue-li.selected, .gg-hint-link.gg-active-blue",
          )
          .forEach((el) => {
            el.classList.remove("selected", "gg-active-blue");
          });
      } else {
        // テキストホバー: 異なる場合のみクリアする標準ロジック
        const currentSelected = this.container.querySelector(
          ".gg-clue-li.selected, .gg-hint-link.gg-active-blue",
        );
        if (currentSelected) {
          const sCoord =
            currentSelected.dataset.coord ||
            currentSelected.getAttribute("data-coord");
          const sImgIdx = parseInt(
            currentSelected.dataset.imgIndex ||
              currentSelected.getAttribute("data-img-index"),
            10,
          );
          // 画像インデックスが異なる、または (厳密な座標チェックの場合) 座標が異なる場合にクリア
          if (sImgIdx !== imgIndex || (coord && sCoord !== coord)) {
            this.container
              .querySelectorAll(
                ".gg-clue-li.selected, .gg-hint-link.gg-active-blue",
              )
              .forEach((el) => {
                el.classList.remove("selected", "gg-active-blue");
              });
          }
        }
      }

      // ハイライトルール
      if (imgIndex >= 0) {
        // 1. 分析リストのハイライト (既存ロジック)
        if (isFromTextSide && coord) {
          // チャット/サイドバーホバー: 1対1マッピング (Specificマスだけ)
          const target = this.container.querySelector(
            `.gg-clue-li[data-coord="${coord}"][data-img-index="${imgIndex}"]`,
          );
          if (target) {
            target.classList.add("gg-clue-hover");
          }
          this._highlightAllOnGrid(imgIndex, coord);
        } else if (!isFromTextSide && !coord) {
          // 画像/グリッドホバー または 全体ホバー: 全てハイライト
          // マップ側から来た場合のみ (isFromTextSide is false)。
          // これにより、テキスト側からの 'mouseleave' が 'Highlight All' をトリガーするのを防ぐ。
          this._highlightAllInList(imgIndex);
          this._highlightAllOnGrid(imgIndex);
        }

        // 2. チャットリンクのハイライト (レガシー復元: Amber)
        // ロジック: coordが存在する場合 (テキストホバー)、特定のみハイライト。
        //        coordがnullの場合 (グリッドホバー)、その画像の全てをハイライト。
        let linkSelector = `.gg-hint-link[data-img-index="${imgIndex + 1}"]`;
        if (coord) {
          linkSelector += `[data-coord="${coord}"]`;
        }

        this.container.querySelectorAll(linkSelector).forEach((link) => {
          link.classList.add("gg-active-amber");
        });
      }
    } else if (action === GG_CONSTANTS.EVENTS.GRID_CLICK) {
      // 全てクリア
      this.container
        .querySelectorAll(
          ".gg-clue-li.gg-clue-hover, .gg-clue-li.selected, .gg-hint-link.gg-active-amber, .gg-hint-link.gg-active-blue",
        )
        .forEach((el) => {
          el.classList.remove(
            "gg-clue-hover",
            "selected",
            "gg-active-amber",
            "gg-active-blue",
          );
        });

      if (coord) {
        // 1. リストアイテムのハイライト (既存)
        const targetClue = this.container.querySelector(
          `.gg-clue-li[data-coord="${coord}"][data-img-index="${imgIndex}"]`,
        );
        if (targetClue) {
          targetClue.classList.add("selected");
        }

        // 2. チャットリンクのハイライト (レガシー復元: Blue)
        // ロジック: 1対1マッピング (Specificマスだけ) -> Blue Highlight
        const targetLink = this.container.querySelector(
          `.gg-hint-link[data-coord="${coord}"][data-img-index="${imgIndex + 1}"]`,
        );
        if (targetLink) {
          targetLink.classList.add("gg-active-blue");
          // Optional: Scroll to link if sidebar is long?
          // targetLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }

  /**
   * 入力エリア (Flex Footer) を描画する
   */
  _renderInputArea() {
    const inputBlock = document.createElement("div");
    inputBlock.className = "gg-input-block";

    // Flexbox 子要素スタイリング (Footer)
    // スタイルは sidebar_theme.css の .gg-input-block に移動済み

    // 現在のモードに基づくデフォルト可視性
    if (this.currentTab === "meta") {
      inputBlock.style.display = "none";
    }

    inputBlock.innerHTML = `
            <div class="gg-input-wrapper">
                <textarea class="gg-input-textarea" placeholder="Ask Gemini..." rows="1"></textarea>
                <button class="gg-send-btn">
                    <svg viewBox="0 0 24 24" style="width: 24px; height: 24px; fill: currentColor;"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
                </button>
            </div>
        `;
    this.inputArea = inputBlock; // Assign to class property
    this.container.appendChild(inputBlock);

    // 自動リサイズロジック
    const textarea = inputBlock.querySelector(".gg-input-textarea");
    const sendBtn = inputBlock.querySelector(".gg-send-btn");

    textarea.addEventListener("input", function () {
      this.style.height = "auto"; // Reset
      this.style.height = this.scrollHeight + "px"; // Expand
    });

    // イベントリスナー
    // 1. Enterキー (送信), Shift+Enter (改行)
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault(); // 改行を阻止
        this._handleInputSend(textarea.value);
        textarea.value = ""; // クリア
        textarea.style.height = "auto"; // 高さをリセット
      }
    });

    // 2. 送信ボタンクリック
    sendBtn.addEventListener("click", () => {
      // 待機中なら停止アクションを処理
      if (sendBtn.classList.contains("gg-stop-mode")) {

        this.setWaitingState(false);
        this.geminiService.sendStopCommand();
        return;
      }
      this._handleInputSend(textarea.value);
      textarea.value = "";
      textarea.style.height = "auto";
    });
  }

  /**
   * 入力送信を処理する
   * @param {string} text
   */
  _handleInputSend(text) {
    const cleanText = text.trim();
    if (!cleanText) return;

    // UIへの即時反映（委譲）
    this.messageRenderer.appendUserMessage(cleanText);

    // プロンプト送信を GeminiService に委譲
    this.geminiService.sendPrompt(cleanText);

    // AI待機中はUIをロック
    this.setWaitingState(true);

    // 送信後に入力をクリア
    const textarea = this.inputArea.querySelector("textarea");
    if (textarea) {
      textarea.value = "";
      textarea.style.height = "auto";
    }
  }

  /**
   * ユーザーメッセージの吹き出しを追加（委譲）
   */
  appendUserMessage(text) {
    this.messageRenderer.appendUserMessage(text);
  }

  /**
   * AIメッセージの吹き出しを追加（委譲）
   */
  appendAiMessage(text) {
    return this.messageRenderer.appendAiMessage(text);
  }

  /**
   * UIを更新して待機状態を反映させる（委譲）
   * @param {boolean} isWaiting
   */
  setWaitingState(isWaiting) {
    this._isWaitingForResponse = isWaiting;
    this.messageRenderer.setWaitingState(isWaiting);
  }
}

// Global Export
window.GameUI = GameUI;
