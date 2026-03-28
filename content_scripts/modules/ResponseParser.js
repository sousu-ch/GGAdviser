/**
 * ResponseParser.js
 * Gemini のデュアル出力フォーマット（解説 + JSON）をパースするロジックを処理する。
 */
class ResponseParser {
  constructor() {
    this.delimiter = "---METADATA_START---";
  }

  /**
   * Gemini からの生テキストをパースし、解説と JSON データを分離する。
   * JSON が含まれない場合（JSONレス）は、解説テキスト内から座標ヒント（[Image X: Y-Z]）を
   * 自動的に抽出して data.local_clues として補強する。
   * @param {string} rawText - Gemini レスポンスからの完全なテキストコンテンツ。
   * @returns {object} { text: string, data: object, error: string|null }
   */
  parse(rawText) {
    if (!rawText) {
      return { text: "", data: null, error: "Empty response" };
    }

    const parts = rawText.split(this.delimiter);

    // ケース 1: デリミタが見つからない (通常のチャットまたは不完全なレスポンス、またはJSONなしプリセット)
    if (parts.length < 2) {
      const extracted = this._extractFromMarkers(rawText);
      const fallbackData = extracted.data || {
        global_clues: {},
        local_clues: [],
        is_fallback: true
      };
      // テキストから local_clues を自動抽出して補強
      fallbackData.local_clues = this._extractLocalCluesFromText(extracted.text);
      if (fallbackData.local_clues && fallbackData.local_clues.length > 0) {
        fallbackData.is_fallback = false;
      }
      return {
        text: extracted.text,
        data: fallbackData,
        error: null,
      };
    }

    let explanation = "";
    let jsonPart = "";

    // 戦略 1: 明示的なマーカー (推奨)
    const extracted = this._extractFromMarkers(rawText);
    if (extracted.found) {
      explanation = extracted.text;
      
      // JSONについては、解説の後のデリミタまたはJSONブロックを引き続き探す
      const afterExplanation = rawText.substring(extracted.endPos);
      const delimiterIndex = afterExplanation.indexOf(this.delimiter);

      if (delimiterIndex !== -1) {
        jsonPart = afterExplanation
          .substring(delimiterIndex + this.delimiter.length)
          .trim();
      } else {
        // 解説後にデリミタが見つからない場合は、すべてを取得する
        jsonPart = afterExplanation.trim();
      }

      // JSONが見つからない場合、ヘッダーおよびテキストからの抽出データを利用する
      if (!jsonPart && extracted.data) {
        // ヘッダーは見つかったがJSONがない場合の補強
        extracted.data.local_clues = this._extractLocalCluesFromText(explanation);
        if (extracted.data.local_clues && extracted.data.local_clues.length > 0) {
          extracted.data.is_fallback = false;
        }
        return {
          text: explanation,
          data: extracted.data,
          error: null
        };
      }
    } else {
      // 戦略 2: デリミタ分割へのフォールバック (レガシー)
      // 最新のレスポンスを取得するために lastIndexOf を使用する
      const lastDelimiterIndex = rawText.lastIndexOf(this.delimiter);
      if (lastDelimiterIndex !== -1) {
        explanation = rawText.substring(0, lastDelimiterIndex).trim();
        jsonPart = rawText
          .substring(lastDelimiterIndex + this.delimiter.length)
          .trim();

        // レガシー Markdown ブロックのクリーンアップ
        const mdRegex =
          /(?:```|\\u0060\\u0060\\u0060)(?:markdown)?\s*([\s\S]*?)\s*(?:```|\\u0060\\u0060\\u0060)/i;
        const mdMatch = explanation.match(mdRegex);
        if (mdMatch && mdMatch[1]) {
          explanation = mdMatch[1].trim();
        }
      } else {
        // ケース 3: 構造が見つからない
        return { text: rawText.trim(), data: null, error: null };
      }
    }

    const jsonResult = this._extractAndParseJSON(jsonPart);
    let finalData = jsonResult.data;

    // JSONが存在しない、または local_clues が空の場合
    if (!finalData || !finalData.local_clues || finalData.local_clues.length === 0) {
      if (!finalData) finalData = { global_clues: {}, local_clues: [] };
      if (!finalData.local_clues) finalData.local_clues = [];
      finalData.local_clues = this._extractLocalCluesFromText(explanation);
    }

    if (finalData && finalData.local_clues && finalData.local_clues.length > 0) {
      finalData.is_fallback = false;
    }

    return {
      text: explanation,
      data: finalData,
      error: jsonResult.error && (!finalData.local_clues || finalData.local_clues.length === 0) ? jsonResult.error : null,
    };
  }

  /**
   * [解説開始] [解説終了] マーカーからテキストを抽出し、ヘッダーからデータを解析する。
   * @param {string} rawText 
   * @returns {object} { found: boolean, text: string, data: object|null, endPos: number }
   */
  _extractFromMarkers(rawText) {
    const startMarker = "[解説開始]";
    const endMarker = "[解説終了]";

    const endIndex = rawText.lastIndexOf(endMarker);
    const startIndex = endIndex !== -1 ? rawText.lastIndexOf(startMarker, endIndex) : -1;

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      const text = rawText.substring(startIndex + startMarker.length, endIndex).trim();
      
      // ヘッダー解析: ## 🇧🇷 国名 (地域名)
      // 例: ## 🇧🇷 ブラジル (地域: セラン)
      const headerRegex = /^##\s*([\u{1F1E6}-\u{1F1FF}]{2})?\s*([^\(\n]+)(?:\((?:地域:?\s*)?([^\)]+)\))?/mu;
      const match = text.match(headerRegex);
      
      let data = null;
      if (match) {
        data = {
          global_clues: {
            country: (match[1] ? match[1] + " " : "") + match[2].trim(),
            region: match[3] ? match[3].trim() : ""
          },
          local_clues: [],
          is_fallback: true
        };
      }

      return {
        found: true,
        text: text,
        data: data,
        endPos: endIndex + endMarker.length
      };
    }

    return { found: false, text: rawText.trim(), data: null, endPos: -1 };
  }

  /**
   * 潜在的なコードブロックから JSON 文字列を抽出し、パースする。
   * @param {string} str - JSON を含む文字列（markdown でラップされている可能性がある）。
   * @returns {object} { data: object|null, error: string|null }
   */
  _extractAndParseJSON(str) {
    // JSON の境界を見つけるヘルパー
    const findJSON = (s) => {
      const start = s.indexOf("{");
      const end = s.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        return s.substring(start, end + 1);
      }
      return null;
    };

    const codeBlockRegex =
      /(?:```|\\u0060\\u0060\\u0060)(?:json)?\s*([\s\S]*?)\s*(?:```|\\u0060\\u0060\\u0060)/i;
    const match = str.match(codeBlockRegex);
    
    let jsonStr = str; // ReferenceError を防ぐために生の文字列をデフォルトにする
    
    // 戦略 1: コードブロック
    if (match && match[1]) {
      jsonStr = match[1];
    }

    // 戦略 2: ヒューリスティックなクリーンアップ ("JSON" プレフィックスがあれば削除)
    // 戦略 1 が失敗した場合、生の文字列を見ていることになる。
    // "JSON\n{...}" のようになっている可能性がある。

    // パースを試みる。失敗した場合は、中括弧探索のフォールバックを使用する。
    try {
      const parsed = JSON.parse(jsonStr);
      // 基本的なスキーマ検証
      if (!this._validateSchema(parsed)) {
        // スキーマが失敗した場合、間違ったものをパースした可能性がある？
        throw new Error("Schema Validation Failed");
      }
      return { data: parsed, error: null };
    } catch (e) {
      // 最初のパースに失敗。中括弧を探す。
      const extracted = findJSON(str);
      if (extracted) {
        try {
          const parsed2 = JSON.parse(extracted);
          if (this._validateSchema(parsed2)) {
            return { data: parsed2, error: null };
          }
        } catch (e2) {
          // 堅牢なエラー処理の開始
        }
      }

      // デバッグプレビューの生成
      const preview = jsonStr.substring(0, 100).replace(/\n/g, "\\n");
      return {
        data: null,
        error: `JSON Parse Error: ${e.message} | Content Start: "${preview}..."`,
      };
    }
  }

  /**
   * パースされたオブジェクトが期待されるスキーマに準拠していることを検証する。
   * @param {object} obj
   * @returns {boolean}
   */
  _validateSchema(obj) {
    if (!obj || typeof obj !== "object") return false;
    if (!obj.global_clues || !obj.local_clues) return false;
    if (!Array.isArray(obj.local_clues)) return false;
    
    // プロンプトテンプレートデータの拒否
    // プロンプトテンプレートには "Title (Short Noun Phrase)" が含まれている。
    // これが見つかった場合、レスポンスではなくプロンプトをパースしていることになる。
    const firstTitle = obj.local_clues[0]?.title;
    if (
      firstTitle &&
      (firstTitle.includes("Short Noun Phrase") ||
        firstTitle.includes("Noun Phrase"))
    ) {
      return false;
    }

    return true;
  }

  /**
   * テキスト内のヒント記法（例: [Image 1: C-2]）を検出し、
   * ハイライト用の座標メタデータオブジェクト (local_clues) に変換する。
   * JSON 出力が廃止された環境でのメインのメタデータソースとして機能する。
   * @param {string} text - 抽出対象の解説テキスト
   * @returns {Array<object>} 抽出された座標オブジェクトの配列
   * @private
   */
  _extractLocalCluesFromText(text) {
    const clues = [];
    if (!text) return clues;

    // "【赤いボラード】[Image 1: A-2]" または "【ボラード】[Image 1 : A-2]" などのパターンにマッチ
    const linkRegex = /【([^】]+)】\[(?:画像|Image)?\s*(\d+)\s*:\s*([A-Z0-9-]+)\]/ig;
    let match;

    // 重複した座標・タイトルのヒントを除外するためのSet
    const seen = new Set();

    while ((match = linkRegex.exec(text)) !== null) {
      const title = match[1].trim();
      const imgNum = parseInt(match[2], 10);
      const coord = match[3].trim();

      const uniqueKey = `${imgNum}-${coord}-${title}`;
      if (!seen.has(uniqueKey)) {
        seen.add(uniqueKey);
        clues.push({
          image_index: imgNum,
          coordinates: [coord],
          title: title,
          description: "",
          importance: 2 // ハイライト発火用として固定の重要度
        });
      }
    }

    return clues;
  }
}

// コンテンツスクリプトおよびテスト用CommonJSでのグローバル使用のためにエクスポート
if (typeof module !== "undefined" && module.exports) {
  module.exports = ResponseParser;
} else {
  (typeof self !== "undefined" ? self : window).ResponseParser = ResponseParser;
}
