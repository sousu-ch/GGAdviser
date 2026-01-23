# GGAdviser プロジェクト指示書

## 1. プロジェクト概要
Geoguessr のプレイ内容を分析し、Gemini からアドバイスを得るための Chrome 拡張機能。

## 2. 技術スタック
- **Frontend**: JavaScript (ES6+), Vanilla CSS
- **API**: Geoguessr Internals, Google Maps API (Panorama)
- **AI Integration**: Gemini (via web interface)

## 3. リファクタリング計画

### Phase 1: `geoguesser.js` の責務分割 (Strategy Pattern) [DONE]
- [x] Step 1.1: 基盤クラスの作成とロード確認
- [x] Step 1.2: InterceptorStrategy の実装と単体確認
- [x] Step 1.3: NextDataStrategy の実装と単体確認
- [x] Step 1.4: メインロジックの書き換え (統合)

### Phase 2: `api_viewer.js` の分離 (UI/Map Logic Separation) [DONE]
- [x] Step 2.1: `PanoBridge.js` (Map Logic)
- [x] Step 2.2: `SplitViewManager.js` (UI Logic)
- [x] Step 2.3: `api_viewer.js` のコーディネーター化

### Phase 3: 定数の共通化 (Centralization) [DONE]
- [x] Step 3.1: `constants.js` の作成
- [x] Step 3.2: 各スクリプトの定数参照化

### Phase 4: ドキュメント整備と最終確認 [DONE]
- [x] Step 4.1: コードのクリーンアップ (JSDoc, logs)
- [x] Step 4.2: ドキュメント更新 (instructions.md, guide)
- [x] Step 4.3: 最終結合テスト

### Phase 5: プロンプトのカスタマイズ機能 [DONE]
- [x] Step 5.1: ストレージ基盤の構築 (Storage API)
- [x] Step 5.2: プロンプト置換エンジンの実装 (PromptBuilder)
- [x] Step 5.3: 設定画面 (Popup) の UI/UX 刷新
- [x] Step 5.4: 座標データの完全なパイプライン統合
- [x] Step 5.5: デフォルトプロンプトの洗練と方位明示化

---

## 開発の引き継ぎガイド

### 1. 開発環境とリロード
開発中の変更を反映するには、`DOCS/EXTENSION_RELOAD_GUIDE.md` に従い、`Gemini CLI` を使用した自動リロードを推奨します。手動の場合は `chrome://extensions/` でリロードが必要です。

### 2. 新しいデータ抽出方式の追加
Geoguessr の HTML 構造が大きく変わった場合は、以下の手順で対応します：
1. `content_scripts/strategies/` に新しい Strategy クラスを作成。
2. `DataExtractionStrategy` を継承し、`extract(gameId, roundIndex)` を実装。
3. `manifest.json` の `js` 配列に新しいファイルを追加。
4. `geoguesser.js` の `strategies` 配列にインスタンスを追加。

### 3. 定数の管理
DOM セレクタや API エンドポイント、イベント ID が変更になった場合は、**必ず `content_scripts/utils/constants.js` のみを編集**してください。他のファイルを個別に修正する必要はありません。

### 4. 通信フローのデバッグ
- **Geoguessr -> Background**: `chrome.runtime.sendMessage` を使用。
- **Content Script -> Main World**: `window.dispatchEvent` + `CustomEvent` を使用。
- **Handshake**: 起動時に `GG_BRIDGE_READY` イベントが発行されるのを待つ構造になっています（`PanoBridge.js` 参照）。

### 5. 注意点
- **Shadow DOM**: Chrome の設定画面などを操作する際は Shadow DOM の走査が必要です（自動リロードスクリプトが例になります）。
- **Main World**: `window` オブジェクトを直接操作する必要があるスクリプト（インターセプターなど）は、`inject_main.js` または `gg_interceptor.js` を介して注入します。
