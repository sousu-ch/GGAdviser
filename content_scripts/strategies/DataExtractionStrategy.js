/**
 * 確定した抽出の失敗。message は利用者にそのまま表示できる文言にする。
 * これを投げると、呼び出し側は他の戦略を試さずに処理を止める。
 */
class ExtractionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExtractionError";
  }
}

/**
 * データ抽出戦略の基本クラス。
 * インターフェースと共有ヘルパーメソッドを定義する。
 */
class DataExtractionStrategy {
  static DEBUG = false;
  constructor() {}

  /**
   * 指定されたゲームIDとターゲットラウンドインデックスのゲームデータを抽出する。
   * 結果は次の3通りで表す。
   * - 抽出データを返す: 成功。
   * - null を返す: この情報源では取得できない。呼び出し側は次の戦略を試してよい。
   * - ExtractionError を投げる: 確定した失敗(範囲外・通信失敗など)。他の戦略には落とさない。
   * @param {string} gameId - 現在のゲームのID。
   * @param {number|null} roundIndex - 抽出するラウンドの0ベースのインデックス。
   * @returns {Promise<Object|null>} - 抽出されたデータオブジェクト、取得できなければ null。
   * @throws {ExtractionError}
   */
  async extract(gameId, roundIndex) {
    throw new Error("extract() はサブクラスで実装する必要があります");
  }

  /**
   * 必要に応じて、16進エンコードされたパノラマID文字列をASCIIにデコードする。
   * 一部のGeoGuessr API構造は、パノラマIDを16進数で返す。
   */
  decodePanoId(id) {
    if (!id || typeof id !== "string" || id.length < 40) return id;
    if (!/^[0-9A-Fa-f]+$/.test(id)) return id;

    try {
      let str = "";
      for (let i = 0; i < id.length; i += 2) {
        const charCode = parseInt(id.substr(i, 2), 16);
        if (charCode < 32 || charCode > 126) return id; // 印刷不可能な ASCII
        str += String.fromCharCode(charCode);
      }
      return str;
    } catch (e) {
      return id;
    }
  }

  async fetchMyId() {
    if (this._myId) return this._myId;
    try {
      // プレイヤー自身のプロフィールを取得してIDを特定する
      const response = await fetch('/api/v3/profiles/me');
      if (response.ok) {
        const profile = await response.json();
        this._myId = profile.id;
        return this._myId;
      }
    } catch (e) {
      if (DataExtractionStrategy.DEBUG) console.warn("[DataExtractionStrategy] Failed to fetch my ID:", e);
    }
    return null;
  }

  findLocalGuess(rawData, roundIndex, myId) {
    if (!rawData || !rawData.teams || !myId) {
      return null;
    }
    const targetRoundNumber = roundIndex + 1;

    for (const team of rawData.teams) {
      if (!team.players) continue;
      for (const player of team.players) {
        const pid = player.playerId || player.id;
        if (pid === myId) {
          // 該当ラウンドの推測データを検索
          const guess = player.guesses?.find(g => g.roundNumber === targetRoundNumber);
          if (guess) {
            return guess;
          }
        }
      }
    }
    return null;
  }

  async formatRoundData(pano, roundIndex, source, guess = null, rawData = null) {
    const baseUrl = GG_CONSTANTS.URLS.GOOGLE_MAPS_PANO_BASE;
    
    // Helper to extract coordinates from various formats
    const getCoords = (obj) => {
      if (!obj) return null;
      if (typeof obj.lat === "number" && typeof obj.lng === "number") {
        return { lat: obj.lat, lng: obj.lng };
      }
      return null;
    };

    // If guess is not provided but rawData is (Duels/Teams scenario)
    let finalGuess = guess;
    if (!finalGuess && rawData && rawData.teams) {
      const myId = await this.fetchMyId();
      finalGuess = this.findLocalGuess(rawData, roundIndex, myId);
    }

    const actualCoords = getCoords(pano);
    if (!actualCoords) {
      if (DataExtractionStrategy.DEBUG) {
        console.warn(`[DataExtractionStrategy] Failed to extract actual coordinates from source ${source}:`, pano);
      }
      return null;
    }

    const params = [
      `viewpoint=${actualCoords.lat}%2C${actualCoords.lng}`,
      `heading=${pano.heading || 0}`,
      `pitch=${pano.pitch || 0}`,
      `fov=180`,
    ];

    // 精度の高いパノラマIDの優先順位
    let panoId = pano.panoId || pano.pano_id;
    if (panoId) {
      panoId = this.decodePanoId(panoId);
      params.push(`pano=${panoId}`);
    }

    const directUrl = `${baseUrl}&${params.join("&")}`;

    const guessCoords = getCoords(finalGuess);

    return {
      actualLocation: actualCoords,
      guessLocation: guessCoords,
      directUrl: directUrl,
      source: `${source}_R${roundIndex + 1}`,
      address: `GeoGuessr Round ${roundIndex + 1} (${pano.countryCode ? pano.countryCode.toUpperCase() : "Unknown"})`,
    };
  }
}
// Note: This class is loaded into the global scope by manifest.json ordering.
