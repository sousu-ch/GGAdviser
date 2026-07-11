/**
 * StateManager.js
 * GGAdviser のための集中状態管理。
 * メモリキャッシュを chrome.storage.local と同期し、変更通知を提供する。
 */
class StateManager {
    constructor() {
        this.state = {};
        this.listeners = [];
        this.initialized = false;
        
        // 内部ロギング (本番用は最小限)

        this._error = (msg, err) => console.error(`[GGAdviser:State:ERROR] ${msg}`, err || "");
    }

    /**
     * ストレージから値をロードして状態を初期化する。
     * @param {Object} defaultState - 初期のデフォルト値のキーと値のペア。
     * @returns {Promise} 状態がロードされたときに解決する。
     */
    async initialize(defaultState = {}) {
        return new Promise((resolve) => {
            const keys = Object.keys(defaultState);
            chrome.storage.local.get(keys, (result) => {
                this.state = { ...defaultState, ...result };
                this.initialized = true;
                // this._log("Initialized with state: " + JSON.stringify(this.state));
                resolve(this.state);
            });
        });
    }

    /**
     * 状態から値を取得する。
     * @param {string} key - 状態キー (GG_CONSTANTS.STORAGE_KEYS を使用)。
     * @returns {*} 値。
     */
    get(key) {
        if (!this.initialized) {
            console.warn(`[GGAdviser:State:WARN] Accessing key "${key}" before initialization.`);
        }
        return this.state[key];
    }

    /**
     * 状態に値を設定し、ストレージに保存する。
     * @param {string} key - 状態キー。
     * @param {*} value - 新しい値。
     * @param {boolean} silent - true の場合、保存と通知をスキップする。
     */
    set(key, value, silent = false) {
        if (this.state[key] === value) return;

        const oldValue = this.state[key];
        this.state[key] = value;

        if (!silent) {
            // this._log(`Update: ${key} -> ${value}`);
            
            // ストレージに保存
            const update = {};
            update[key] = value;
            chrome.storage.local.set(update);

            // リスナーに通知
            this.notify(key, value, oldValue);
        }
    }

    /**
     * 状態変更のリスナーを追加する。
     * @param {Function} callback - Function(key, value, oldValue).
     */
    addListener(callback) {
        this.listeners.push(callback);
    }

    /**
     * 変更をすべてのリスナーに通知する。
     */
    notify(key, value, oldValue) {
        this.listeners.forEach(callback => {
            try {
                callback(key, value, oldValue);
            } catch (e) {
                this._error("Listener Error", e);
            }
        });
    }
}

// グローバルシングルトン
window.GG_STATE = new StateManager();
