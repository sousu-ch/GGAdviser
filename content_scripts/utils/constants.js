/**
 * constants.js
 * 拡張機能全体で使用されるセレクター、URL、イベント名の中央レジストリ。
 * 他のコンテンツスクリプトからアクセスできるように、グローバルオブジェクト GG_CONSTANTS として定義される。
 */
// コンテンツスクリプト (window) とサービスワーカー (self) の両方に対応
(typeof self !== 'undefined' ? self : window).GG_CONSTANTS = {
    SELECTORS: {
        // Geoguessr UI
        ROUND_ITEM: '[class*="game-summary_playedRound"]',
        SHELL_MAIN: 'main[id="shell-main"]',
        GAME_MENU: '[class*="game-menu_gameMenu__"]',
        ANALYZE_BTN_ID: 'gg-analyze-btn',
        NEXT_DATA_ID: '__NEXT_DATA__',
        GAME_SUMMARY_CONTAINER: 'div[class*="buttons_buttons"]',
        SELECTED_ROUND: '[class*="game-summary_selectedRound"]',
        IN_GAME_ROUND_INDICATOR: '[class*="round-indicator_roundIndicatorContent__"]',
        
        // Map-making.app UI
        MAP_APP_WRAPPER: '.page-map-editor',
        SEARCH_INPUTS: [
            'input.controls',
            'input[placeholder*="Search"]',
            'input[type="text"][class*="search"]'
        ],
        MAIN_WRAPPER_ID: 'gg-main-wrapper',
        GEMINI_PANEL_ID: 'gg-gemini-panel',
        SPLITTER_ID: 'gg-splitter',
        SPLIT_CSS_ID: 'gg-split-css',
        WIDE_CSS_ID: 'gg-wide-css',
        UI_COMPONENTS_CSS_ID: 'gg-ui-components-css'
    },
    CLASSES: {
        HEADER_BUTTONS_WRAPPER: 'gg-header-buttons-wrapper',
        HEADER_BUTTON: 'gg-header-button',
        AI_BUTTON: 'gg-ai-button',
        WIDE_BUTTON: 'gg-wide-button',
        ENABLED: 'gg-enabled',
        DISABLED: 'gg-disabled',
        ANALYZE_BUTTON: 'gg-analyze-button',
        CONTROL_HEADER: 'gg-control-header',
        CONTROL_TITLE: 'gg-control-title',
        // Map Extractor
        PANO_TARGET: 'gg-pano-target',
        PANO_ANCESTOR: 'gg-pano-ancestor',
    },
    URLS: {
        GEMINI: "https://gemini.google.com/app",
        MAP_MAKING_BASE: "https://map-making.app",
        DEFAULT_MAP_ID: "",
        RESULT_MAP_URL: "",
        GOOGLE_MAPS_PANO_BASE: "https://www.google.com/maps/@?api=1&map_action=pano"
    },
    EVENTS: {
        FETCH_REQUEST: "GG_FETCH_REQUEST",
        FETCH_RESPONSE: "GG_FETCH_RESPONSE",
        MANUAL_INJECT: "GG_MANUAL_INJECT",
        BRIDGE_READY: "GG_BRIDGE_READY",
        PANO_READY: "GG_PANO_READY_EVENT",
        UPDATE_POV: "GG_UPDATE_POV",
        GAME_DATA_FETCH: "GG_GAME_DATA_FETCH",
        // Map Extractor
        REQUEST_MAP_DATA: "GG_REQUEST_MAP_DATA",
        EXIT_CAPTURE: "GG_EXIT_CAPTURE",
        MAP_DATA_RESPONSE: "GG_MAP_DATA_RESPONSE",
        SET_POV_FAST: "GG_SET_POV_FAST",
        SYNC_POV: "GG_SYNC_POV",
        GRID_QUERY: "GG_GRID_QUERY",
        
        // Enhanced Highlighting
        HINT_HOVER: "GG_HINT_HOVER",
        HINT_CLICK: "GG_HINT_CLICK",
        GRID_HOVER: "GG_GRID_HOVER",
        GRID_CLICK: "GG_GRID_CLICK",
        ANALYSIS_START: "GG_ANALYSIS_START"
    },
    ACTIONS: {
        START_CAPTURE_INPLACE: "START_CAPTURE_INPLACE",
        SHOW_RESULT: "SHOW_RESULT",
        RESTORE_UI_ERROR: "RESTORE_UI_ERROR",
        REMOTE_ANALYZE: "REMOTE_ANALYZE",
        SHOW_TOAST: "SHOW_TOAST",
        GG_LOG: "GG_LOG",
        INJECT_GRID_LINK: "INJECT_GRID_LINK",
        CTX_INJECT_QUERY: "CTX_INJECT_QUERY",
        
        // Highlighting Actions
        HIGHLIGHT_HINT: "GG_HIGHLIGHT_HINT",
        HIGHLIGHT_GRID: "GG_HIGHLIGHT_GRID",
        
        // Stop Generation
        STOP_GENERATION: "GG_STOP_GENERATION",

        // Tab Life-cycle
        UNLOCK_SIDEBAR: "GG_UNLOCK_SIDEBAR"
    },
    STORAGE_KEYS: {
        FINAL_DATA: 'finalData',
        PROMPT_TEMPLATE: 'gg_prompt_template',
        MAP_BASE_URL: 'gg_map_base_url',
        UI_ENABLED: 'gg_ui_enabled',
        WIDE_ENABLED: 'gg_wide_enabled',
        QUIZ_MODE: 'gg_quiz_mode',
        LAST_GUESS_DATA: 'ggadviser_last_guess_data'
    },


};
