class NextDataStrategy extends DataExtractionStrategy {
  static DEBUG = false;
  constructor() {
    super();
  }

  /**
   * DOM 内の __NEXT_DATA__ スクリプトタグを解析してゲームデータを抽出する。
   * @param {string} gameId - 現在のゲームID (検証用)。
   * @param {number} roundIndex - ターゲットラウンドインデックス。
   * @returns {Promise<Object|null>} フォーマットされたラウンドデータ。取得できなければ null。
   * @throws {ExtractionError} 同じゲームのデータに対して、ラウンドが範囲外のとき。
   */
  async extract(gameId, roundIndex) {
    try {
      const nextDataScript = document.getElementById(
        GG_CONSTANTS.SELECTORS.NEXT_DATA_ID,
      );
      if (!nextDataScript) return null;

      const json = JSON.parse(nextDataScript.textContent);
      const game = json?.props?.pageProps?.game;

      if (game) {
        const nextDataId = game.gameId || game.id;
        if (nextDataId !== gameId) {
          if (NextDataStrategy.DEBUG) {
            console.warn(
              `[NextDataStrategy] 古いデータが検出されました (Data: ${nextDataId}, Current: ${gameId})`,
            );
          }
          return null;
        }

        if (game.rounds && game.rounds.length > 0) {
          const targetIdx = roundIndex;
          if (!Number.isInteger(targetIdx) || targetIdx < 0 || targetIdx >= game.rounds.length) {
            throw new ExtractionError("指定のラウンドは存在しません。");
          }

          const targetRound = game.rounds[targetIdx];
          if (targetRound && targetRound.panorama) {
            // プレイヤーの推測データを特定 (Duels時は game オブジェクトも渡す)
            const guess = (game.player && game.player.guesses && game.player.guesses[targetIdx])
              ? game.player.guesses[targetIdx]
              : null;
              
            return await this.formatRoundData(
              targetRound.panorama,
              targetIdx,
              "NEXT_DATA",
              guess,
              game
            );
          }
        }
      }
    } catch (e) {
      if (e instanceof ExtractionError) throw e;
      if (NextDataStrategy.DEBUG) console.error("[NextDataStrategy] Parse error:", e);
    }
    return null;
  }
}
