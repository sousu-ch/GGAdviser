class InterceptorStrategy extends DataExtractionStrategy {
  constructor() {
    super();
  }

  /**
   * ネットワークインターセプターを使用してゲームデータを抽出する。
   * データがまだキャッシュされていない場合は、アクティブなフェッチをトリガーする。
   * @param {string} gameId - 現在のゲームID。
   * @param {number} roundIndex - ターゲットラウンドインデックス。
   * @returns {Promise<Object|null>} フォーマットされたラウンドデータまたは null。
   */
  async extract(gameId, roundIndex) {
    // アクティブなフェッチは ensureGameData を介してトリガーされる
    await this.ensureGameData(gameId);

    if (window.lastCapturedGameData) {
      const data = window.lastCapturedGameData;
      const interceptedId = data.gameId || data.id;

      if (interceptedId !== gameId) {

        return null;
      }

      if (data.rounds && data.rounds.length > 0) {
        // 境界チェック
        const targetIdx =
          roundIndex >= 0 && roundIndex < data.rounds.length
            ? roundIndex
            : data.rounds.length - 1;

        const targetRound = data.rounds[targetIdx];
        if (targetRound && targetRound.panorama) {
          // プレイヤーの推測データを特定 (Duels/Teams対応のため raw data も渡す)
          const guess = (data.player && data.player.guesses && data.player.guesses[targetIdx])
            ? data.player.guesses[targetIdx]
            : null;
            
          return await this.formatRoundData(
            targetRound.panorama,
            targetIdx,
            "INTERCEPTED_API",
            guess,
            data
          );
        }
      }
    }
    return null;
  }

  /**
   * 最新のゲームデータが window.lastCapturedGameData で利用可能であることを保証する。
   * 不明またはIDの不一致の場合、メインワールドのインターセプターにイベントをディスパッチする。
   * @param {string} gameId - フェッチするゲームID。
   * @returns {Promise<void>} データが更新されたかタイムアウトが発生したときに解決する。
   */
  async ensureGameData(gameId) {
    if (
      window.lastCapturedGameData &&
      (window.lastCapturedGameData.gameId === gameId ||
        window.lastCapturedGameData.id === gameId)
    ) {
      return;
    }



    return new Promise((resolve) => {
      const handler = (e) => {
        if (e.data && e.data.type === GG_CONSTANTS.EVENTS.GAME_DATA_FETCH) {
          const payload = e.data.data;
          if (payload && (payload.id === gameId || payload.gameId === gameId)) {
            window.removeEventListener("message", handler);
            clearTimeout(tm);
            window.lastCapturedGameData = payload;
            resolve();
          }
        }
      };

      window.addEventListener("message", handler);
      window.dispatchEvent(
        new CustomEvent(GG_CONSTANTS.EVENTS.FETCH_REQUEST, {
          detail: { gameId },
        }),
      );

      const tm = setTimeout(() => {
        window.removeEventListener("message", handler);

        resolve();
      }, 1000);
    });
  }
}
