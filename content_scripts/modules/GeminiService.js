/**
 * GeminiService.js
 * バックグラウンドスクリプトを介して Gemini API との通信を管理するクラス。
 * プロンプトの構築、送信、および生成停止コマンドの送信を担当する。
 */
class GeminiService {
  constructor() {

  }

  /**
   * 構造化されたプロンプトを Gemini に送信する。
   * @param {string} userText - ユーザーが入力した生テキスト
   */
  sendPrompt(userText) {
    const cleanText = userText.trim();
    if (!cleanText) return;

    // テンプレートが利用可能な場合はそれを使用して構造化プロンプトを構築
    const prompt = this._buildFollowUpPrompt(cleanText);



    // バックグラウンドにメッセージを送信
    chrome.runtime.sendMessage({
      action: "SEND_TO_GEMINI",
      prompt: prompt,
    });
  }

  /**
   * Gemini の生成を停止するためのグローバル停止信号を送信する。
   */
  sendStopCommand() {

    chrome.runtime.sendMessage(
      {
        action: GG_CONSTANTS.ACTIONS.STOP_GENERATION,
      },
      (response) => {

        if (chrome.runtime.lastError) {
          console.error(
            "[GeminiService] STOP_GENERATION エラー:",
            chrome.runtime.lastError,
          );
        }
      },
    );
  }

  /**
   * ユーザー入力をテンプレートでラップしてフォローアップ用プロンプトを構築する。
   * @param {string} userText - ユーザーテキスト
   * @returns {string} 構造化されたプロンプトテキスト
   * @private
   */
  _buildFollowUpPrompt(userText) {
    if (!GG_PROMPTS || !GG_PROMPTS.FOLLOW_UP) {
      console.warn(
        "[GeminiService] GG_PROMPTS.FOLLOW_UP が見つかりません。生のテキストを使用します。",
      );
      return userText;
    }
    return GG_PROMPTS.FOLLOW_UP.replace("{{userText}}", userText);
  }
}

// Global Export
window.GeminiService = GeminiService;
