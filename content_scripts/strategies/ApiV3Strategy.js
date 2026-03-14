/**
 * GeoGuessr API v3 を使用してデータを取得する戦略
 */
class ApiV3Strategy extends DataExtractionStrategy {
  constructor() {
    super();
  }

  /**
   * API v3 からゲームデータを抽出する。
   * @param {string} gameId - 現在のゲームID。
   * @param {number} roundIndex - ターゲットラウンドインデックス (0-based)。
   * @returns {Promise<Object|null>} フォーマットされたラウンドデータまたは null。
   */
  async extract(gameId, roundIndex) {
    if (!gameId) return null;

    try {
      // API v3 エンドポイント
      const url = `/api/v3/games/${gameId}`;
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[ApiV3Strategy] Fetch failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      
      // IDの整合性チェック
      if (data.token !== gameId) {
        console.warn(`[ApiV3Strategy] Game ID mismatch: expected ${gameId}, got ${data.token}`);
        return null; 
      }

      if (data.rounds && data.rounds.length > 0) {
        // 表示されているラウンドまたは最後のラウンドを選択
        const targetIdx =
          roundIndex >= 0 && roundIndex < data.rounds.length
            ? roundIndex
            : data.rounds.length - 1;

        const targetRound = data.rounds[targetIdx];
        
        // API v3 では lat/lng 等が round オブジェクトの直下にある
        if (targetRound && targetRound.lat !== undefined) {
          // プレイヤーの推測データを特定 (もし存在すれば)
          const guess = (data.player && data.player.guesses && data.player.guesses[targetIdx]) 
            ? data.player.guesses[targetIdx] 
            : null;
            
          // 基本クラスの formatRoundData を非同期で呼び出し
          return await this.formatRoundData(
            targetRound,
            targetIdx,
            "API_V3",
            guess,
            data
          );
        } else {
          console.warn("[ApiV3Strategy] Target round has no coordinates.", targetRound);
        }
      }
    } catch (e) {
      console.error("[ApiV3Strategy] Unexpected Error:", e);
    }

    return null;
  }
}
