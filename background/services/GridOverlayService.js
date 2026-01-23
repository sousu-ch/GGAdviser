/**
 * GridOverlayService.js
 * OffscreenCanvas を使用して画像にグリッドオーバーレイを追加するサービス。
 * Service Worker 環境で実行するように設計されている。
 */
class GridOverlayService {
    constructor() {
        this.config = {
            gridColor: 'rgba(255, 255, 255, 0.5)',
            labelColor: 'rgba(255, 255, 255, 0.9)',
            labelBgColor: 'rgba(0, 0, 0, 0.6)',
            fontSize: 24,
            rows: 5, // A, B, C, D, E
            cols: 5  // 1, 2, 3, 4, 5
        };
    }

    /**
     * Base64 画像を処理し、グリッドオーバーレイを追加する。
     * @param {string} base64Image - Base64 文字列としての入力画像。
     * @returns {Promise<string>} - Base64 文字列としての処理済み画像。
     */
    async processImage(base64Image) {
        try {
            // 1. Base64 を Bitmap に変換
            const response = await fetch(base64Image);
            const blob = await response.blob();
            const bitmap = await createImageBitmap(blob);

            const originalWidth = bitmap.width;
            const originalHeight = bitmap.height;
            
            // 定規の設定
            const rulerSize = 40; // ラベルマージンのピクセルサイズ (上と左)

            // 2. OffscreenCanvas を作成 (定規用に拡張)
            const canvas = new OffscreenCanvas(originalWidth + rulerSize, originalHeight + rulerSize);
            const ctx = canvas.getContext('2d');

            // 3. 背景を塗りつぶす (定規用は黒)
            ctx.fillStyle = '#1e1e1e'; // Dark gray/black
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // 4. 元画像を描画 (rulerSize 分オフセット)
            ctx.drawImage(bitmap, rulerSize, rulerSize);

            // 5. グリッドと定規を描画
            this._drawRulerGrid(ctx, originalWidth, originalHeight, rulerSize);

            // 6. Base64 に再変換
            const processedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
            return await this._blobToBase64(processedBlob);

        } catch (error) {
            console.error('GridOverlayService: Error processing image', error);
            return base64Image; // エラー時は元画像を返す
        }
    }

    _drawRulerGrid(ctx, imageWidth, imageHeight, rulerSize) {
        const rows = this.config.rows;
        const cols = this.config.cols;
        const rowHeight = imageHeight / rows;
        const colWidth = imageWidth / cols;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.floor(rulerSize * 0.6)}px sans-serif`;

        // --- 垂直線と上部定規ラベルを描画 ---
        for (let i = 0; i < cols; i++) {
            const x = rulerSize + (i * colWidth);
            const centerX = x + (colWidth / 2);

            // Grid Line
            if (i > 0) {
                ctx.beginPath();
                ctx.moveTo(x, rulerSize);
                ctx.lineTo(x, rulerSize + imageHeight);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.stroke();
            }

            // 上部定規ラベル (1, 2, 3)
            ctx.fillStyle = '#ffffff';
            ctx.fillText((i + 1).toString(), centerX, rulerSize / 2);
        }

        // --- 水平線と左定規ラベルを描画 ---
        const rowLabels = ['A', 'B', 'C', 'D', 'E'];
        for (let i = 0; i < rows; i++) {
            const y = rulerSize + (i * rowHeight);
            const centerY = y + (rowHeight / 2);

            // Grid Line
            if (i > 0) {
                ctx.beginPath();
                ctx.moveTo(rulerSize, y);
                ctx.lineTo(rulerSize + imageWidth, y);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.stroke();
            }

            // 左定規ラベル (A, B, C)
            ctx.fillStyle = '#ffffff';
            ctx.fillText(rowLabels[i] || '?', rulerSize / 2, centerY);
        }

        // 定規と画像の境界線
        ctx.beginPath();
        ctx.moveTo(rulerSize, 0);
        ctx.lineTo(rulerSize, rulerSize + imageHeight); // 垂直分割線
        ctx.moveTo(0, rulerSize);
        ctx.lineTo(rulerSize + imageWidth, rulerSize); // 水平分割線
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#555';
        ctx.stroke();
    }

    async _blobToBase64(blob) {
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const len = bytes.byteLength;
        const CHUNK_SIZE = 0x8000; // 32KB
        
        // スタックオーバーフローと過度の連結を避けるためにチャンクを使用して文字列構築を最適化
        for (let i = 0; i < len; i += CHUNK_SIZE) {
            const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
            binary += String.fromCharCode.apply(null, chunk);
        }
        
        return `data:${blob.type};base64,${btoa(binary)}`;
    }
}

// background.js の importScripts 用にグローバルスコープに公開
self.GridOverlayService = GridOverlayService;
