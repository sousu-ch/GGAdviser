/**
 * データ抽出戦略の基本クラス。
 * インターフェースと共有ヘルパーメソッドを定義する。
 */
class DataExtractionStrategy {
  constructor() {}

  /**
   * 指定されたゲームIDとターゲットラウンドインデックスのゲームデータを抽出する。
   * @param {string} gameId - 現在のゲームのID。
   * @param {number} roundIndex - 抽出するラウンドの0ベースのインデックス。
   * @returns {Promise<Object|null>} - 抽出されたデータオブジェクト、失敗した場合は null。
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

  formatRoundData(pano, roundIndex, source) {
    const baseUrl = GG_CONSTANTS.URLS.GOOGLE_MAPS_PANO_BASE;
    const params = [
      `viewpoint=${pano.lat}%2C${pano.lng}`,
      `heading=${pano.heading || 0}`,
      `pitch=${pano.pitch || 0}`,
      `fov=180`,
    ];

    // 精度の高いパノラマIDの優先順位
    let panoId = pano.panoId || pano.pano_id;
    if (panoId) {
      panoId = this.decodePanoId(panoId); // 存在する場合は16進数をデコード
      params.push(`pano=${panoId}`);
    }

    const directUrl = `${baseUrl}&${params.join("&")}`;


    return {
      actualLocation: { lat: pano.lat, lng: pano.lng },
      directUrl: directUrl,
      source: `${source}_R${roundIndex + 1}`,
      address: `GeoGuessr Round ${roundIndex + 1} (${pano.countryCode ? pano.countryCode.toUpperCase() : "Unknown"})`,
    };
  }
}
// Note: This class is loaded into the global scope by manifest.json ordering.
