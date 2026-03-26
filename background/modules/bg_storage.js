/**
 * Google Chrome 拡張機能のインストール時または更新時に実行される初期化処理。
 * ストレージの初期化、および以前のバージョンからのマップ設定の最小限のマイグレーションを担当する。
 * (v1.1.0 リニューアルに伴い、プロンプトの引き継ぎは廃止)
 * @returns {void}
 */
export function initStorageOnInstalled() {
  const keys = GG_CONSTANTS.STORAGE_KEYS;
  
  chrome.storage.local
    .get([
      keys.ACTIVE_PROMPT_ID,
      keys.MAPS_LIST,
      keys.MAP_BASE_URL
    ])
    .then((res) => {
      // 1. プロンプト管理の初期化
      if (!res[keys.ACTIVE_PROMPT_ID]) {
        // v1.1.0 基準のデフォルト設定
        chrome.storage.local.set({
          [keys.ACTIVE_PROMPT_ID]: "country-fast",
          [keys.PROMPTS_CUSTOM]: {} // 特になければ、prompts.js の PRESETS が使われる
        });
      }

      // 2. マップリストのマイグレーション (既存の URL をリスト形式へ変換)
      if (!res[keys.MAPS_LIST]) {
        const initialMaps = [];
        let activeMapId = "";
        
        // 以前のバージョン (MAP_BASE_URL単体時代) からの URL があれば引き継ぐ
        if (res[keys.MAP_BASE_URL]) {
          activeMapId = "migration-" + Date.now();
          initialMaps.push({ 
            id: activeMapId, 
            name: "デフォルトマップ", 
            url: res[keys.MAP_BASE_URL] 
          });
          
          chrome.storage.local.set({ 
            [keys.MAPS_LIST]: initialMaps, 
            [keys.ACTIVE_MAP_ID]: activeMapId 
          });
        }
      }

      // 3. レガシーな不要キーの徹底清掃 (v1.0.8 時代の残骸)
      chrome.storage.local.remove([
        "gg_prompt_template",
        "gg_prompt_template_region",
        "finalData" // キャッシュのクリア
      ]);
    });
}

/**
 * 現在アクティブに設定されているマップの URL をストレージから取得する。
 * @returns {Promise<string>} アクティブなマップ URL。設定されていない場合は空文字列を返す。
 */
export async function getActiveMapUrl() {
  const storage = await chrome.storage.local.get(["gg_maps_list", "gg_active_map_id"]);
  const mapsList = storage.gg_maps_list || [];
  const activeId = storage.gg_active_map_id;
  
  if (!activeId || mapsList.length === 0) return "";
  
  const activeMap = mapsList.find(m => m.id === activeId);
  return activeMap ? activeMap.url : "";
}

/**
 * キャプチャ権限の許可が必要なタブの ID リストをストレージに保存する。
 * @param {number[]} tabs タブ ID の配列。
 * @returns {Promise<void>}
 */
export async function setCaptureTabs(tabs) {
  await chrome.storage.local.set({ captureTabs: tabs });
}
