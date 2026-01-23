/**
 * PromptBuilder.js
 * Gemini プロンプトのテンプレート化と変数置換を処理する。
 */
class PromptBuilder {
    /**
     * テンプレート文字列内のプレースホルダーを実際のデータ値に置き換える。
     * @param {string} template - {{key}} プレースホルダーを含むプロンプトテンプレート。
     * @param {Object} data - 置換用のキーと値のペア。
     * @returns {string} 処理されたプロンプト。
     */
    static build(template, data) {
        if (!template) return "";
        
        let prompt = template;
        
        // データのキーを反復処理し、{{key}} を値に置き換える
        for (const [key, value] of Object.entries(data)) {
            const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            prompt = prompt.replace(placeholder, value || "");
        }

        // 残りのプレースホルダーをクリーンアップ（オプションだが、より安全）
        prompt = prompt.replace(/\{\{.*?\}\}/g, "");
        
        return prompt.trim();
    }
}

// 他のスクリプトで使用するためにエクスポート（読み込み方法に依存）
if (typeof window !== 'undefined') {
    window.PromptBuilder = PromptBuilder;
}
