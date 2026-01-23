# 引き継ぎ資料：UIトグル機能の実装と仕様詳細

## 1. 概要と現状
本機能は「GGAdviser UIの表示/非表示を切り替えるトグルボタン」の実装です。
現在、基本的は実装済みであり、gitコミットも完了していますが、ユーザー指示により「次のタスクでUI変更を行う」として一時中断となりました。

### 現在のステータス
- **実装状態:** 完了 (Committed)
- **検証状態:** 完了 (ロジック確認済み)
- **コミットハッシュ:** 最新の HEAD 参照
- **関連ファイル:**
    - `DOCS/SYSTEM_SPECIFICATION.md` (システム仕様書・全体設計図)
    - `DOCS/PLAN_UI_TOGGLE.md` (実施計画書・更新済み)
    - `content_scripts/modules/SplitViewManager.js`
    - `css/split_view.css`
    - `content_scripts/utils/constants.js`

---

## 2. 仕様詳細（Technical Specifications）

### A. 画面レイアウト（Floating Split View）
Map-making.app の既存デザインを尊重し、従来の「画面分割（Split）」ではなく「浮き出し（Floating）」レイアウトを採用しています。

- **ON時の挙動:**
    - コンテンツラッパー（`#gg-main-wrapper`）の幅を `calc(70vw - 24px)` に制限。
    - 上下左に `12px` のマージン、右側に `12px` のギャップを確保。
    - **重要:** `margin: 0` の強制適用は行わず、元のスタイルを活かす形に。
    - 装飾（影・角丸）はユーザー要望により除去（フラットデザイン）。

- **OFF時の挙動:**
    - `body.gg-ui-disabled` クラスが付与される。
    - この時、拡張機能の全てのスタイル（`split_view.css`）が `unset` または `display: none` となり、**ブラウザ本来のレンダリング（マージン含む）に完全に戻る**。
    - これにより「OFFにしてもパツパツになる」「マージンが消える」問題を根絶。

### B. トグルボタンの配置戦略
ヘッダーの構造が可変であるため、以下の優先順位でボタンを注入しています。

1.  **Strategy A (Primary):** `.icon-button` の右隣
    - ヘッダー左側にあるアイコンボタンを特定し、その兄弟要素（`.after()`）として挿入。
    - これにより、他のUI要素（検索バーや右側のツールボタン）と干渉せず、自然な並びになる。
2.  **Strategy B (Fallback):** 汎用ヘッダー
    - `.icon-button` が見つからない場合、`header:not([class*="tool-block"])`（サイドバーを除くメインヘッダー）の末尾に追加。

### C. 状態管理
- `chrome.storage.local` の `gg_ui_enabled` キーを使用。
- `true` (ON) / `false` (OFF)。デフォルトは `true`。
- `SplitViewManager.js` 初期化時にロードされる。

---

## 3. 次のタスクへの申し送り事項

### 1. 動作確認からスタートしてください
コードはコミット済みですが、もしユーザーが「リセット」を望む場合は、`git reset` 等の対応が必要かもしれません。まずは現状の実装が意図通り（特にマージン維持とボタン位置）かを確認してください。

### 2. 今後の拡張可能性
- **プロンプト:** ユーザーは「UI変更」と仰っていましたが、具体的な変更内容は未定です。現在の「シンプル・フラット」なデザインが気に入らない場合、再度装飾（Shadow/Radius）の調整になる可能性があります。
- **配置:** ヘッダー構造が変わった場合、Strategy A が失敗するリスクがあります。`SplitViewManager.js` の `injectAppHeaderToggle` メソッドが改修ポイントです。

### 3. ドキュメント
- `DOCS/PLAN_UI_TOGGLE.md` は実装に合わせて更新済みです。
- 作業再開時はこのドキュメントと計画書を正としてください。
