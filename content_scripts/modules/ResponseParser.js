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
   * @param {string} rawText - Gemini レスポンスからの完全なテキストコンテンツ。
   * @returns {object} { text: string, data: object|null, error: string|null } を含むオブジェクト
   */
  parse(rawText) {
    if (!rawText) {
      return { text: "", data: null, error: "Empty response" };
    }

    const parts = rawText.split(this.delimiter);

    // ケース 1: デリミタが見つからない (通常のチャットまたは不完全なレスポンス)
    if (parts.length < 2) {
      return {
        text: rawText.trim(),
        data: null,
        error: null,
      };
    }

    let explanation = "";
    let jsonPart = "";

    // 戦略 1: 明示的なマーカー (推奨)
    const startMarker = "[解説開始]";
    const endMarker = "[解説終了]";

    // 最後の終了マーカーを見つける (最新の完了)
    const endIndex = rawText.lastIndexOf(endMarker);

    // その終了マーカーに関連付けられた開始マーカーを見つける (終了位置から後方に検索)
    const startIndex =
      endIndex !== -1 ? rawText.lastIndexOf(startMarker, endIndex) : -1;

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      explanation = rawText
        .substring(startIndex + startMarker.length, endIndex)
        .trim();

      // JSONについては、解説の後のデリミタまたはJSONブロックを引き続き探す
      const afterExplanation = rawText.substring(endIndex + endMarker.length);
      const delimiterIndex = afterExplanation.indexOf(this.delimiter);

      if (delimiterIndex !== -1) {
        jsonPart = afterExplanation
          .substring(delimiterIndex + this.delimiter.length)
          .trim();
      } else {
        // 解説後にデリミタが見つからない場合は、すべてを取得する
        jsonPart = afterExplanation.trim();
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

    return {
      text: explanation,
      data: jsonResult.data,
      error: jsonResult.error,
    };
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
}

// コンテンツスクリプトおよびテスト用CommonJSでのグローバル使用のためにエクスポート
if (typeof module !== "undefined" && module.exports) {
  module.exports = ResponseParser;
} else {
  (typeof self !== "undefined" ? self : window).ResponseParser = ResponseParser;
}
