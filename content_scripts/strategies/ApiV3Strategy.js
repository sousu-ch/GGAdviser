/**
 * GeoGuessr API v3 を使用してデータを取得する戦略
 * 通常ゲーム(/game/, /results/)専用で、唯一の取得経路のため、失敗は null ではなく
 * 理由つきの ExtractionError で返す。
 */
class ApiV3Strategy extends DataExtractionStrategy {
  static DEBUG = false;
  constructor() {
    super();
  }

  /**
   * API v3 からゲームデータを抽出する。
   * @param {string} gameId - 現在のゲームID。
   * @param {number|null} roundIndex - ターゲットラウンドインデックス (0-based)。
   *   null は「直近にプレイ済みのラウンド」(/game/ 用)。
   * @returns {Promise<Object>} フォーマットされたラウンドデータ。
   * @throws {ExtractionError} 取得できない理由が確定しているとき。未プレイ・範囲外の
   *   ラウンドは、次ラウンドの地点が見えてしまうため、丸めずに拒否する。
   */
  async extract(gameId, roundIndex) {
    if (!gameId) throw new ExtractionError("ゲームIDを特定できませんでした。");

    let response;
    try {
      response = await fetch(`/api/v3/games/${gameId}`);
    } catch (e) {
      if (ApiV3Strategy.DEBUG) console.warn("[ApiV3Strategy] Fetch error:", e);
      throw new ExtractionError("ゲームデータの取得に失敗しました(通信エラー)。");
    }
    if (!response.ok) {
      throw new ExtractionError(`ゲームデータの取得に失敗しました(HTTP ${response.status})。`);
    }

    const data = await response.json();

    // IDの整合性チェック
    if (data.token !== gameId) {
      throw new ExtractionError("表示中のゲームと取得したデータが一致しません。");
    }
    if (!data.rounds || data.rounds.length === 0) {
      throw new ExtractionError("ゲームデータにラウンド情報がありません。");
    }

    // roundIndex が null (/game/) のときは直近にプレイ済みのラウンドを対象にする。
    // rounds には未プレイの次ラウンドも含まれるため、guesses に無いラウンドは
    // 地点のネタバレになる。丸めずに拒否する。
    const guesses = (data.player && data.player.guesses) || [];
    if (roundIndex === null && guesses.length === 0) {
      throw new ExtractionError("プレイ済みのラウンドがありません。");
    }
    const targetIdx = roundIndex === null ? guesses.length - 1 : roundIndex;
    if (!Number.isInteger(targetIdx) || targetIdx < 0 || targetIdx >= data.rounds.length) {
      throw new ExtractionError("指定のラウンドは存在しません。");
    }
    if (targetIdx >= guesses.length) {
      throw new ExtractionError("未プレイのラウンドは取得できません。");
    }

    // API v3 では lat/lng 等が round オブジェクトの直下にある
    const targetRound = data.rounds[targetIdx];
    const result =
      targetRound && targetRound.lat !== undefined
        ? await this.formatRoundData(targetRound, targetIdx, "API_V3", guesses[targetIdx], data)
        : null;
    if (!result) {
      throw new ExtractionError("このラウンドの座標を取得できませんでした。");
    }
    return result;
  }
}
