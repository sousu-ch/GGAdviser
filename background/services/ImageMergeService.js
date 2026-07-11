/**
 * ImageMergeService.js
 * 4枚のパノラマ画像(DataURL)を受け取り、テキストラベル付きの「田の字型(2x2)」の1枚の画像に結合する。
 * (Background Service Worker 内で完結させるため、OffscreenCanvas を使用)
 */

import { blobToDataUrl } from "../modules/bg_utils.js";

export class ImageMergeService {
  /**
   * 4枚の画像を結合する
   * @param {string[]} dataUrls - ["North", "East", "South", "West"] の順で要素数4
   * @returns {Promise<string>} - 結合されたJPEG画像のDataURL
   */
  async createCombinedPanorama(dataUrls) {
    if (!dataUrls || dataUrls.length !== 4) {
      throw new Error("createCombinedPanorama requires exactly 4 images.");
    }

    // 1. 各画像の読み込みとImageBitmapの生成
    const bitmaps = await Promise.all(
      dataUrls.map(async (url) => {
        const res = await fetch(url);
        const blob = await res.blob();
        return await createImageBitmap(blob);
      })
    );

    // 2. サイズ計算
    // 全画像が同サイズと仮定（GeoGuessrキャプチャは同一サイズ）
    const cellW = bitmaps[0].width;
    const cellH = bitmaps[0].height;

    // パディング(px)とヘッダー高さ(px)
    const padding = 20;
    const headerH = 60;

    // キャンバス全体のサイズ
    // 幅: 左パディング + 画像1幅 + 中パディング + 画像2幅 + 右パディング
    // 高さ: 上パディング + ヘッダー + 画像1高 + 中パディング + ヘッダー + 画像3高 + 下パディング
    const totalW = (cellW * 2) + (padding * 3);
    const totalH = ((cellH + headerH) * 2) + (padding * 3);

    const canvas = new OffscreenCanvas(totalW, totalH);
    const ctx = canvas.getContext("2d");

    // 背景を黒で塗りつぶす (パディングやヘッダー部分の背景)
    ctx.fillStyle = "#1e1e1e"; // 暗いグレーで少しスタイリッシュに
    ctx.fillRect(0, 0, totalW, totalH);

    // 3. 各タイルを描画
    const labels = ["North (0°)", "East (90°)", "South (180°)", "West (270°)"];
    const positions = [
      { x: padding, y: padding },                                         // Top-Left
      { x: padding * 2 + cellW, y: padding },                             // Top-Right
      { x: padding, y: padding * 2 + cellH + headerH },                   // Bottom-Left
      { x: padding * 2 + cellW, y: padding * 2 + cellH + headerH }        // Bottom-Right
    ];

    // フォント設定
    ctx.font = "bold 32px sans-serif";
    ctx.textBaseline = "top";

    for (let i = 0; i < 4; i++) {
      const pos = positions[i];

      // ラベルテキストの描画
      ctx.fillStyle = "#ffffff";
      ctx.fillText(labels[i], pos.x, pos.y + 10); // 上部に10pxのマージン

      // 画像の描画
      ctx.drawImage(bitmaps[i], pos.x, pos.y + headerH, cellW, cellH);
    }

    // 4. Blobに出力し、DataURLとして返す
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    return blobToDataUrl(blob);
  }
}
