class NextDataStrategy extends DataExtractionStrategy {
  constructor() {
    super();
  }

  /**
   * DOM 内の __NEXT_DATA__ スクリプトタグを解析してゲームデータを抽出する。
   * @param {string} gameId - 現在のゲームID (検証用)。
   * @param {number} roundIndex - ターゲットラウンドインデックス。
   * @returns {Promise<Object|null>} フォーマットされたラウンドデータまたは null。
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
          console.warn(
            `[NextDataStrategy] 古いデータが検出されました (Data: ${nextDataId}, Current: ${gameId})`,
          );
          return null;
        }

        if (game.rounds && game.rounds.length > 0) {
          const targetIdx =
            roundIndex >= 0 && roundIndex < game.rounds.length
              ? roundIndex
              : game.rounds.length - 1;

          const targetRound = game.rounds[targetIdx];
          if (targetRound && targetRound.panorama) {
            return this.formatRoundData(
              targetRound.panorama,
              targetIdx,
              "NEXT_DATA",
            );
          }
        }
      }
    } catch (e) {
      console.error("[NextDataStrategy] Parse error:", e);
    }
    return null;
  }
}
