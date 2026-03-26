/**
 * MessageRenderer.js
 * チャットバブルの生成、Markdown要素のパース、および入力エリアの表示状態管理を担当するクラス。
 * インラインスタイルを排除し、外部CSS（ui_components.css）への統合を前提とする。
 */
class MessageRenderer {
  static DEBUG = false;
  constructor() {
    this.chatContainer = null;
    this.scrollArea = null;
    this.inputArea = null;
  }

  /**
   * レンダラーに必要なDOM要素のコンテナを設定する。
   * @param {HTMLElement} chatContainer - チャットメッセージが表示されるコンテナ
   * @param {HTMLElement} scrollArea - スクロールを担当するラッパー要素
   * @param {HTMLElement} inputArea - 入力エリア全体のコンテナ要素
   */
  setContainers(chatContainer, scrollArea, inputArea) {
    this.chatContainer = chatContainer;
    this.scrollArea = scrollArea;
    this.inputArea = inputArea;

  }

  /**
   * チャット履歴をクリアする。
   */
  clearChat() {
    if (this.chatContainer) {
      this.chatContainer.innerHTML = "";

    }
  }

  /**
   * ユーザーメッセージの吹き出しを追加する。
   * @param {string} text
   */
  appendUserMessage(text) {
    if (!this.chatContainer) return;
    const bubble = document.createElement("div");
    bubble.className = "gg-chat-bubble gg-chat-bubble-user";
    bubble.innerText = text;
    this.chatContainer.appendChild(bubble);
    this._scrollToBottom();
  }

  /**
   * Markdownサポート付きのAIメッセージ吹き出しを追加する。
   * @param {string} text
   * @returns {HTMLElement} 吹き出し要素
   */
  appendAiMessage(text) {
    if (!this.chatContainer) return null;
    const bubble = document.createElement("div");
    bubble.className = "gg-chat-bubble gg-chat-bubble-ai";

    const content = document.createElement("div");
    content.className = "gg-stream-raw";
    content.innerHTML = this._parseMarkdown(text);

    bubble.appendChild(content);
    this.chatContainer.appendChild(bubble);

    // 新しいメッセージ内のインタラクティブリンクにリスナーを添付
    this._attachLinkListeners(content);

    this._scrollToBottom();
    return bubble;
  }

  /**
   * 待機状態を反映するためにUIを更新する。
   * @param {boolean} isWaiting - 待機中かどうか
   */
  setWaitingState(isWaiting) {
    if (!this.inputArea) {
      // console.warn("[MessageRenderer] setWaitingState: inputArea not set.");
      return;
    }
    const textarea = this.inputArea.querySelector("textarea");
    const sendBtn = this.inputArea.querySelector(".gg-send-btn");
    const wrapper = this.inputArea.querySelector(".gg-input-wrapper");

    // SVG 定数
    const SEND_SVG =
      '<svg viewBox="0 0 24 24" style="width: 24px; height: 24px; fill: currentColor;"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>';
    const STOP_SVG =
      '<svg viewBox="0 0 24 24" style="width: 24px; height: 24px; fill: #d32f2f;"><rect x="6" y="6" width="12" height="12"></rect></svg>';

    if (isWaiting) {
      if (textarea) textarea.disabled = true;
      if (sendBtn) {
        sendBtn.innerHTML = STOP_SVG;
        sendBtn.classList.add("gg-stop-mode");
        sendBtn.style.pointerEvents = "auto"; // 停止のためにクリック可能にしておく
        sendBtn.title = "生成を停止";
      }
      if (wrapper) {
        wrapper.style.opacity = "0.7";
      }
    } else {
      if (textarea) textarea.disabled = false;
      if (sendBtn) {
        sendBtn.innerHTML = SEND_SVG;
        sendBtn.classList.remove("gg-stop-mode");
        sendBtn.style.pointerEvents = "auto";
        sendBtn.title = "プロンプト送信";
      }
      if (wrapper) {
        wrapper.style.opacity = "1";
        wrapper.style.pointerEvents = "auto";
      }
    }
  }

  /**
   * チャットエリアを最下部までスクロールする。
   */
  _scrollToBottom() {
    if (this.scrollArea) {
      setTimeout(() => {
        this.scrollArea.scrollTo({
          top: this.scrollArea.scrollHeight,
          behavior: "smooth",
        });
      }, 50);
    }
  }

  /**
   * 簡易的なMarkdownパーサー。
   * 見出し(h1-h3)、強調(strong)、リスト(li/ul)、改行、および特定の画像ヒントリンクをパースする。
   * スタイリングは外部CSS（.gg-stream-raw）に委ねる。
   * @param {string} text - パース対象のプレーンテキスト
   * @returns {string} HTML化された文字列
   * @private
   */
  /**
   * ブロックベースの再帰的アプローチを使用したMarkdownパーサーロジック。
   * ネストされたリストを正しく処理するために Marked.js の基本構造を模倣。
   * @param {string} text
   * @returns {string} HTML
   */
  _parseMarkdown(text) {
    if (!text) return "";
    const lines = text.split(/\r?\n/);
    return this._parseBlock(lines, 0).html;
  }

  /**
   * 再帰ブロックパーサー。
   * @param {string[]} lines - 全行
   * @param {number} startIdx - 現在の処理インデックス
   * @param {number} baseIndent - 現在のパース深度（インデントレベル）
   * @returns {{html: string, nextIndex: number}}
   */
  _parseBlock(lines, startIdx, baseIndent = 0) {
    let html = "";
    let i = startIdx;

    while (i < lines.length) {
      let line = lines[i];

      // 空行（スキップするが、必要に応じて構造的な区切りを維持）
      if (!line.trim()) {
        html += "<br>"; // 汎用スペーサーとして空行を保持
        i++;
        continue;
      }

      // リストブロック検出
      // "- ..." または "* ..." にマッチ（必要に応じて特定のインデントチェック）
      const listMatch = line.match(/^(\s*)([-*])\s+(.*)/);
      if (listMatch) {
        // この行がリスト項目にマッチする場合、リストパーサーに委譲する。
        // ただし、厳密に *この* レベルまたはそれより深いレベルに属していることを確認する必要がある。
        // トップレベルの呼び出しでは、任意のリスト開始が有効。
        const currentIndent = listMatch[1].length;

        // ネストされたコンテキストにいて、この行がベースインデントより浅い場合、
        // ネストされたブロックが終了したことを意味する。ブレイクして親に戻る。
        if (currentIndent < baseIndent) {
          break;
        }

        const listResult = this._parseList(lines, i, currentIndent);
        html += listResult.html;
        i = listResult.nextIndex;
        continue;
      }

      // 見出しブロック
      const headerMatch = line.match(/^(#{1,3})\s+(.*)/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        html += `<h${level}>${this._parseInline(headerMatch[2])}</h${level}>`;
        i++;
        continue;
      }

      // 通常の段落 / テキスト行
      // 汎用ブロックコンテキストでBaseIndentよりインデントが少ない場合、
      // 通常はブレイクアウトを意味するが、ここでは "baseIndent" は主にリストコンテキスト用。
      // 再帰的に呼び出された場合に親のリスト項目を消費しないように注意。

      // メモ: 厳密なMarkdownではテキストブロックが結合される場合がある。ここではチャットの単純化のため行単位で扱う。
      // この行が実際に親レベル（より浅いインデント）のリスト項目のように見えるかチェック。
      const potentialList = line.match(/^(\s*)([-*])\s+/);
      if (potentialList && potentialList[1].length < baseIndent) {
        break;
      }

      html += this._parseInline(line.trim()) + "<br>";
      i++;
    }

    return { html, nextIndex: i };
  }

  /**
   * リスト項目の連続ブロックをパースする。
   */
  _parseList(lines, startIdx, parentIndent) {
    let html = "<ul>";
    let i = startIdx;

    while (i < lines.length) {
      const line = lines[i];
      const match = line.match(/^(\s*)([-*])\s+(.*)/);

      // リスト項目でない、またはインデントレベルの不一致（浅すぎる -> このリストの終了）
      if (!match) {
        // 遅延継続またはリスト終了の可能性。
        // チャットUIの単純化のため、箇条書きの点でなければインデントをチェックする。
        // インデントが深い場合は、前の項目の部分である（下記で処理）。
        // 同レベルの純粋なテキストの場合、継続の可能性があるか？
        // とりあえず、インデントされていない限り、非箇条書き行はリストを中断すると仮定する。
        break;
      }

      const currentIndent = match[1].length;
      if (currentIndent < parentIndent) {
        // このレベルを終了
        break;
      }

      // currentIndent > parentIndent の場合、技術的には
      // *前の* 項目の再帰呼び出しによって処理されているはずである。ここで「開始」として表示される場合、
      // インデントの奇妙なジャンプを意味する可能性がある。新しい項目またはサブリストとして扱うか？
      // 標準的なアプローチ: `parentIndent` の項目は <li> である。

      if (currentIndent > parentIndent) {
        // 前の項目が厳密に深い行を消費しているはずなので、
        // このループ構造では通常このシナリオ（より深い開始）は発生しないはずである。
        // しかし発生する場合、それはサブリストである。
      }

      // リスト項目の開始
      const contentText = match[3];
      let itemHtml = `<li>${this._parseInline(contentText)}`;

      i++; // リスト項目行を消費

      // 子要素（ネストされたリストまたは複数行コンテンツ）を先読み
      // 現在の項目よりも厳密に *深く* インデントされた行を収集する
      const childrenLines = [];
      // 前方のみを確認
      while (i < lines.length) {
        const nextLine = lines[i];
        if (!nextLine.trim()) {
          i++;
          continue; // リスト構造内の空行をスキップ
        }

        // 次の行のインデントを確認
        const nextMatch = nextLine.match(/^(\s*)/);
        const nextIndent = nextMatch ? nextMatch[1].length : 0;

        // 子要素であるためには、現在の項目の箇条書き点よりも深くインデントされている必要がある
        if (nextIndent > currentIndent) {
          childrenLines.push(nextLine);
          i++;
        } else {
          // 同レベルまたはより浅い場合 -> 子要素の終了
          break;
        }
      }

      // 子行を収集した場合、再帰する！
      if (childrenLines.length > 0) {
        // 最初の子要素のインデントを新しいベースとして渡すか？
        // または汎用パーサーを渡すだけか？
        // これらの行のパースを再開する。
        // メモ: これらはブロックとして処理する必要がある。
        const childBlock = this._parseBlock(
          childrenLines,
          0,
          currentIndent + 1,
        );
        itemHtml += childBlock.html;
      }

      itemHtml += "</li>";
      html += itemHtml;
    }

    html += "</ul>";
    return { html, nextIndex: i };
  }

  /**
   * パース対象の文字列内のインライン要素（エスケープ、装飾）を処理する。
   */
  _parseInline(text) {
    if (!text) return "";
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // 太字
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // ヒントリンク
    const linkRegex =
      /【([^】]+)】\[(?:画像|Image)?\s*(\d+)\s*:\s*([A-Z0-9-]+)\]/g;
    html = html.replace(linkRegex, (match, text, num, coord) => {
      const linkId = `chat-link-${Math.random().toString(36).substr(2, 9)}`;
      return `<a href="javascript:void(0)" class="gg-hint-link" 
                    data-coord="${coord}" 
                    data-img-index="${num}" 
                    data-link-id="${linkId}"
                    title="View Image ${num}: ${coord}">${text}</a>`;
    });

    return html;
  }

  /**
   * インタラクティブなリンクを処理するための委譲イベントリスナーを添付する。
   * @param {HTMLElement} container
   */
  _attachLinkListeners(container) {
    if (!container) return;

    container.addEventListener("click", (e) => {
      const link = e.target.closest(".gg-hint-link");
      if (!link) return;

      e.preventDefault();
      e.stopPropagation();

      const coord = link.getAttribute("data-coord");
      const imgNum = link.getAttribute("data-img-index");
      const linkId = link.getAttribute("data-link-id");
      const imgIndex = parseInt(imgNum, 10) - 1;



      try {
        window.dispatchEvent(
          new CustomEvent(GG_CONSTANTS.EVENTS.HINT_CLICK, {
            detail: { coord, imgIndex, linkId },
          }),
        );

        chrome.runtime.sendMessage({
          action: GG_CONSTANTS.EVENTS.HINT_CLICK,
          coord: coord,
          imgIndex: imgIndex,
          linkId: linkId,
        });

        window.dispatchEvent(
          new CustomEvent("GG_SHOW_EVIDENCE_REQ", {
            detail: { coord, imgIndex, title: `Image ${imgNum}`, linkId },
          }),
        );
      } catch (err) {
        if (MessageRenderer.DEBUG) console.error("[MessageRenderer] Failed to dispatch click event", err);
      }
    });

    container.addEventListener(
      "mouseenter",
      (e) => {
        const link = e.target.closest(".gg-hint-link");
        if (!link) return;

        const coord = link.getAttribute("data-coord");
        const imgNum = link.getAttribute("data-img-index");
        const imgIndex = parseInt(imgNum, 10) - 1;

        try {
          window.dispatchEvent(
            new CustomEvent(GG_CONSTANTS.EVENTS.HINT_HOVER, {
              detail: { coord, imgIndex },
            }),
          );
        } catch (err) {}
      },
      true,
    );

    container.addEventListener(
      "mouseleave",
      (e) => {
        const link = e.target.closest(".gg-hint-link");
        if (!link) return;

        try {
          window.dispatchEvent(
            new CustomEvent(GG_CONSTANTS.EVENTS.HINT_HOVER, {
              detail: { coord: null },
            }),
          );
        } catch (err) {}
      },
      true,
    );
  }
}

// Global Export
window.MessageRenderer = MessageRenderer;
