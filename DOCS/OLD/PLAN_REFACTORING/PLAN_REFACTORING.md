# GridOverlayManager & Constants リファクタリング計画書

## 1. 目的とゴール
肥大化した `GridOverlayManager.js` の責務を分割し、可読性と保守性を向上させる。
また、`constants.js` からプロンプトなどの「データ」を分離し、設定ファイルとしての役割を明確にする。

**ゴール:**
1. `GridOverlayManager.js` を「管理」「描画」「操作」の3つに分割し、各クラスを300行以下に抑える。
2. `prompts.js` を新設し、定数ファイルの見通しを良くする。
3. 既存機能（ハイライト同期、イベント処理など）がリファクタリング前と変わらず動作することを保証する。

---

## 2. 実装フェーズ (Implementation Phases)

**進捗状況の更新**: 未着手=`[ ]`, 作業中=`[/]`, 完了=`[x]`

### Phase 1: GridOverlayManager の段階的分割 (Refined)
**目的**: 安全に `GridOverlayManager.js` を分割するため、まずはメソッドの疎結合化を行い、その後に物理的なファイル移動を行う。

- [x] **Step 1-0: Preparation (Method Isolation)**
    - [x] **[実装]**: 
        - `GridOverlayManager.js` 内で以下のメソッドを「純粋関数風」にリファクタリングする（`this` への依存を排除し、引数で必要なDOMや状態を受け取る）。
            - `_renderGridLayer` -> `_renderGridLayerStatic(container, img, options, callbacks)`
            - `_renderHighlight` -> `_renderHighlightStatic(...)`
            - `_renderSelection` -> `_renderSelectionStatic(...)`
        - クラス内の呼び出し元を修正し、リファクタリング後のメソッドを使用するように変更。
    - [x] **[検証]**: 
        - リファクタリング前後で挙動（表示、イベント）に一切の変化がないことを確認。
    
- [x] **Step 1-0 Verification Gate**:
    1. Step 1-0 のリファクタリング・動作検証を完了させる。
    2. **検証結果の証拠（既存機能が動作しているログやスクショ）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Step 1-1 の実装は絶対に行わない。**

- [-] **Step 1-1: GridRenderer の物理抽出**
    - [x] **[実装]**: 
        - `GridRenderer.js` を新規作成。
        - Step 1-0 で独立させたメソッドをそのままコピー＆ペーストで移動。
        - `GridOverlayManager` からは `new GridRenderer()` を経由してメソッドを呼び出す形に変更（ロジックの変更は行わない）。
    - [x] **[検証]**: 
        - 物理ファイル移動後も、機能が維持されていることを確認。
        - **重要**: `manifest.json` に `GridRenderer.js` が `GridOverlayManager.js` より **前** に記述されていることを確認。
        - コンソールに `GridRenderer` 関連のエラー（未定義など）が出ていないことを確認。
        
- [x] **Step 1-1 Verification Gate**: 
    1. Step 1-1の実装・検証を完了させる。
    2. **検証結果の証拠（manifest.jsonの差分、動作スクショ）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Step 1-2 の実装は絶対に行わない。**

- [x] **Step 1-2: GridInteractionHandler の物理抽出**
    - [x] **[実装]**: 
        - `GridInteractionHandler.js` を新規作成。
        - `GridOverlayManager` からイベントハンドリング（Click, Hoverなど）のロジックを移動。
        - `GridInteractionHandler` は状態を持たず、必要な情報は引数で受け取るか、最小限のコールバックで返す設計にする。
    - [x] **[検証]**: 
        - クリック、ダブルクリック、ホバーなどのイベントが正常に動作することを確認。
        - `manifest.json` のロード順序が正しいことを確認。
        
- [x] **Step 1-2 Verification Gate**: 
    1. Step 1-2の実装・検証を完了させる。
    2. **検証結果の証拠（イベントログ、動作確認結果）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Phase 2 の実装は絶対に行わない。**


### Phase 2: 定数ファイルの整理
**目的**: `constants.js` を設定（Config）とデータ（Data）に分離する。

- [x] **Step 2-1: Prompts の分離**
    - [x] **[実装]**: 
        - `d:/01ws/js/GGAdvice/content_scripts/utils/prompts.js` を新規作成。
        - `constants.js` 内の `PROMPT` オブジェクトを移動。
        - `constants.js` から `prompts.js` をエクスポート（または利用側でインポート修正）。
        - 参照元の `gemini.js` 等のインポートパスを修正。
    - [x] **[検証]**: 
        - 拡張機能をロードし、エラーが出ないこと。
        - Geminiへの指示生成時、正しいプロンプトが読み込まれていること。
        - optionsページ等の参照エラーも修正済み。
        - **確認方法**: コンソールログでプロンプト内容を出力確認。
        
- [x] **Step 2-1 Verification Gate**: 
    1. Step 2-1の実装・検証を完了させる。
    2. **検証結果の証拠（ログ）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、完了とは見なさない。

### Phase 3: 安全なコードクリーンアップ (Safe Cleanup)
**目的**: 機能に影響を与えずに、不要なデバッグコードとコメントを確実に削除する。
**方針**: ファイル単位で「変更」→「即時検証」→「承認」のサイクルを回す。

- [x] **Step 3-1: GridOverlayManager.js のクリーンアップ**
    - [x] **[実装]**: 
        - `debugMode` フラグの削除（常に本番動作とする）。
        - `_log`, `_debug` メソッド本体の削除と、呼び出し元の削除。
        - 開発用コメント `[PHASE X]` の削除。
    - [x] **[検証]**: 地図ページを開き、オーバーレイが表示されるか、クリック操作が効くかを確認。

- [x] **Step 3-1 Verification Gate**:
    1. Step 3-1 の実装・検証を完了させる。
    2. **検証結果の証拠（オーバーレイ動作のスクショ、コンソールログ）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Step 3-2 の実装は絶対に行わない。**

- [x] **Step 3-2: SplitViewManager.js のクリーンアップ**
    - [x] **[実装]**: 不要な `console.log`（起動ログ等）の削除。
    - [x] **[検証]**: アプリ起動時、コンソールにエラーが出ないことを確認（JSDoc閉じタグ修正済み）。

- [x] **Step 3-2 Verification Gate**:
    1. Step 3-2 の実装・検証を完了させる。
    2. **検証結果の証拠（起動直後のクリーンなコンソールログ）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Step 3-3 の実装は絶対に行わない。**

- [x] **Step 3-3: geoguesser.js / gemini.js のクリーンアップ**
    - [x] **[実装]**: 古いStrategyパターンのログ、詳細な通信ログの削除。
    - [x] **[検証]**: 
        - Geoguessrで `ANALYZE` ボタンが表示されるか（コード上確認）。
        - Geminiへのデータ送信が成功するか（エラーなし確認）。

- [x] **Step 3-3 Verification Gate**:
    1. Step 3-3 の実装・検証を完了させる。
    2. **検証結果の証拠（ANALYZEボタン表示、通信成功ログ）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Phase 3 完了（コミット）とは見なさない。**

## 3. 残課題・検討事項
- イベントバスの導入（Phase 4）は今回は見送り、まずはクラス構造の整理を優先する。
