# リファクタリング計画書 (GG Adviser) - V6

この計画書は、GG Adviser の安定性と保守性を向上させるためのリファクタリング工程を定義します。各フェーズには「実装計画」と「検証ゲート」を設け、品質を担保します。

## 進捗状況概要
- **Phase 1-3 (安定化)**: 完了
- **Phase 4 (UI 外部化)**: **延期** (ホストサイトとの CSS 競合回避のため)
- **Phase 5 (クリーンアップ)**: 完了
- **Phase 6 (状態管理)**: 次回着手予定

---

## 完了済みのフェーズ

### Phase 1-3: 実行環境の安定化
- **実装内容**:
    - `manifest.json` の整理と Main World への `constants.js` 注入。
    - 定数（セレクタ、ストレージキー）の `GG_CONSTANTS` への集約。
    - `gemini.js` のポーリング・ロジック堅牢化。
- **検証内容**:
    - [x] `map-making.app` の Main World で定数が参照可能であること。
    - [x] Gemini への注入が再読み込みを跨いでも成功すること。

### Phase 5: コードクリーンアップ (Debug & Comments)
- **実装内容**:
    - 全主要ファイル (`SplitViewManager.js`, `gemini.js`, `map_extractor.js`) のロギングを内部ヘルパーに統一。
    - 開発用タグ (`[FIX]`, `[NEW]`) および不要なコメント、重複コードの削除。
- **検証内容**:
    - [x] コンソール出力が `[GGAdviser:xxx]` で統一されていること。
    - [x] `map_extractor.js` 内の重複していたイベントリスナーが排除されていること。

---

## 今後の実施ステップ

### Phase 4: CSS の外部化と UI Factory [延期中]
> [!IMPORTANT]
> このフェーズはホストサイトの CSS 破壊リスクを伴うため、現在は実行せず、安全なリファクタリングを優先します。

---

### Phase 6: 状態管理 (State Manager) の導入 [NEXT]
**目的**: 分散している `chrome.storage.local` の呼び出しを一元化し、状態の不整合を防ぐ。

- **実装計画**:
    1. `content_scripts/utils/StateManager.js` の新規作成。
    2. `uiEnabled`, `wideEnabled` などのフラグ管理を `StateManager` へ移行。
    3. 各モジュールからの直接的な `chrome.storage` アクセスを禁止。
- **検証ゲート**:
    - [ ] `StateManager.js` 単体で `get/set` が動作し、メモリキャッシュとストレージが同期すること。
    - [ ] UI トグル時に他のモジュールへ正しく状態変化が通知されること。

### Phase 7: リサイズエンジンの分離
**目的**: `SplitViewManager.js` からドラッグ＆ドロップの計算ロジックを分離する。

- **実装計画**:
    1. `content_scripts/modules/ResizerEngine.js` の作成。
    2. `SplitViewManager.js` 内のマウスイベント（mousemove, mouseup）の計算コードを移行。
- **検証ゲート**:
    - [ ] 分離後も分割表示の幅調整および Wide Mode のリサイズがスムーズに動作すること。

### Phase 8: 最終ドキュメント化と JSDoc
**目的**: コードの型定義を明確にし、今後の開発を容易にする。

- **実装計画**:
    - すべてのクラス、メソッドに JSDoc を付与。
    - `manifest.json` の最終的なパーミッション最小化チェック。
- **検証ゲート**:
    - [ ] IDE 上で型ヒントが正しく表示され、警告が出ないこと。

---

## 運用ルール
- 各フェーズ着手前に必ず `git commit` を行い、検証ゲートを通過するまで次のフェーズに進まない。
- 技術的な課題（CSS 競合など）に直面した場合は、直ちに計画に立ち返り、フェーズの順序を再検討する。
