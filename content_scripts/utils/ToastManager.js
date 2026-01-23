/**
 * ToastManager.js
 * GGAdviser 用のシンプルで自己完結型のトースト通知システム。
 * 現在のページ内に非ブロッキングのアニメーション付きバナーを表示する。
 */

const ToastManager = {
    container: null,

    /**
     * まだ存在しない場合、トーストコンテナを初期化する。
     */
    init() {
        if (this.container) return;

        this.container = document.createElement('div');
        this.container.id = 'gg-toast-container';
        this.container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 2147483647;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
        `;
        document.body.appendChild(this.container);

        // 基本スタイルを追加
        const style = document.createElement('style');
        style.textContent = `
            .gg-toast {
                min-width: 280px;
                max-width: 400px;
                padding: 12px 16px;
                border-radius: 12px;
                background: rgba(30, 30, 35, 0.95);
                color: #fff;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                align-items: center;
                gap: 12px;
                transform: translateX(120%);
                transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                pointer-events: auto;
                cursor: pointer;
            }
            .gg-toast.visible {
                transform: translateX(0);
            }
            .gg-toast-icon {
                font-size: 20px;
                flex-shrink: 0;
            }
            .gg-toast-content {
                flex-grow: 1;
            }
            .gg-toast-title {
                font-weight: 600;
                font-size: 14px;
                margin-bottom: 2px;
                color: #4facfe;
            }
            .gg-toast-message {
                font-size: 13px;
                line-height: 1.4;
                opacity: 0.9;
            }
            .gg-toast-error .gg-toast-title { color: #ff4b2b; }
            .gg-toast-success .gg-toast-title { color: #00f2fe; }
        `;
        document.head.appendChild(style);
    },

    /**
     * トースト通知を表示する。
     * @param {string} title - トーストのタイトル。
     * @param {string} message - メッセージ本文。
     * @param {string} type - 'info', 'success', 'error'。
     * @param {number} duration - 表示時間（ミリ秒単位、デフォルト 5000）。
     */
    show(title, message, type = 'info', duration = 5000) {
        this.init();

        const toast = document.createElement('div');
        toast.className = `gg-toast gg-toast-${type}`;
        
        const iconMap = {
            info: '🔵',
            success: '✅',
            error: '🚨'
        };

        toast.innerHTML = `
            <div class="gg-toast-icon">${iconMap[type] || '✨'}</div>
            <div class="gg-toast-content">
                <div class="gg-toast-title">${title}</div>
                <div class="gg-toast-message">${message}</div>
            </div>
        `;

        toast.onclick = () => this.remove(toast);
        this.container.appendChild(toast);

        this.container.appendChild(toast);

        // スライドイン
        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });

        // 自動削除
        if (duration > 0) {
            setTimeout(() => this.remove(toast), duration);
        }
    },

    remove(toast) {
        toast.classList.remove('visible');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 400);
    }
};

// コンテンツスクリプトでのグローバルアクセスのために window にエクスポート
window.ToastManager = ToastManager;
