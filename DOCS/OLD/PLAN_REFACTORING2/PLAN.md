# Refactoring Plan: Code Cleanup & Robustness (Phase 4)

**概要**:
実装フェーズ (Phase 1~3) で肥大化したコードを整理し、保守性と可読性を向上させるための計画書。
機能追加は行わず、既存機能の動作担保を最優先とする。

---

## 1. 目的とゴール
- **責務の分離**: 巨大なクラス (`GameUI.js`, `gemini.js`) を分割し、単一責任の原則に近づける。
- **遺物の排除**: 過去のアーキテクチャ（iframe版）の不要コードを削除する。
- **スタイルの統一**: 散在するCSSを集約する。
- **安定性の向上**: 明示的な `manifest.json` 管理を行い、読み込みエラーを防ぐ。

---

## 2. 実装計画

**進捗状況**: 未着手=`[ ]`, 作業中=`[/]`, 完了=`[x]`

### Phase 4: Refactoring Steps

- [x] **Step 4-0: Pre-Refactoring Baseline**
    - **目的**: 安全なリファクタリングのためのベースライン確保。
    - [x] **[検証]**:
        - 現状の全機能（キャプチャ、解析、対話、停止、タブ復帰）が正常に動作することを確認。
        - Gitコミットハッシュを記録する。 (Hash: `861ca75`)
    - [x] **Step 4-0 Verification Gate**: 
        1. 動作確認結果を提示し、ベースラインのコミットハッシュをユーザーに報告する。 (完了: `861ca75`)
        2. ユーザーの承認を得るまで、**Step 4-1 の実装は絶対に行わない。**

---

### Phase 4-1: Manifest & Logic Separation

- [x] **Step 4-1-A: Manifest Update (CRITICAL)**
    - [x] **[実装]**: 
        - `manifest.json` の `content_scripts` ("matches": ["https://map-making.app/*"]) の `js` リストを編集。
        - `MessageRenderer.js` と `GeminiService.js` を `GameUI.js` の**前**に追加する。
    - [x] **[検証]**: 
        - 拡張機能をリロードし、DevTools等でエラー（"File not found" 等）が出ないことを確認。
    - [x] **Step 4-1-A Verification Gate**: 
        1. 修正後の `manifest.json` の内容を提示する。 (完了: エラーなし)
        2. ユーザーの承認を得るまで、**Step 4-1-B の実装は絶対に行わない。**

- [x] **Step 4-1-B: MessageRenderer Class Extraction**
    - [x] **[実装]**: 
        - `content_scripts/modules/MessageRenderer.js` を作成。
        - `GameUI.js` から `appendUserMessage`, `appendAiMessage`, `_scrollToBottom`, `updateStopButtonState` 等のDOM操作メソッドを移動。
        - `GameUI.js` を修正し、このクラスをインスタンス化して委譲する。
    - [x] **[検証]**: 
        - チャット表示、自動スクロール、ボタン状態遷移がスムーズであることを目視確認。
    - [x] **Step 4-1-B Verification Gate**: 
        1. 分割後のコードと、動作確認時の挙動（ログまたはスクショ）を提示する。 (完了済み)
        2. ユーザーの承認を得るまで、**Step 4-1-C の実装は絶対に行わない。**

- [x] **Step 4-1-C: GeminiService Class Extraction & Stop Button Optimization**
    - [x] **[実装]**:
        - `content_scripts/modules/GeminiService.js` を作成し通信ロジックを抽出。
        - **停止ボタンの最適化**: 貼り付け開始直後に `finalData` を削除するように `gemini.js` を修正。
        - `background.js`: `GG_STOP_GENERATION` の転送先を `gg_gemini_tab_id` 優位に修正。
    - [x] **[検証]**:
        - チャット送信および**画像貼り付け中の停止**が正常に機能することを確認する。
        - **確認方法**: Gemini タブでの動作目視およびログ (`[GGAdviser:Gemini] 🛑 STOP COMMAND RECEIVED`)
    - [x] **Step 4-1-C Verification Gate**:
        1. 抽出した `GeminiService.js` のコードを提示する。 (完了済み)
        2. `gemini.js` と `background.js` の停止ロジック最適化の差分を提示する。 (完了済み)
        3. 停止ボタンが期待通りに機能した証拠（ログ等）を提示し、動作確認を依頼する。 (完了済み: walkthrough.md にて提示)
        4. ユーザーの承認を得るまで、**Phase 4-2 の実装は絶対に行わない。** (承認済み)

---

### Phase 4-2: CSS Consolidation

- [x] **Step 4-2: CSS Consolidation Refactoring** <!-- id: 4-2 -->
    - [x] モジュール内のインラインスタイルを `css/sidebar_theme.css` に集約。
    - [x] `GridOverlayManager.js` の `isActive` 定義漏れ不具合を特定・修正。
- [x] **Verification Gate 4-2: CSS Integration & Overlay Verification** <!-- id: gate-4-2 -->
    - [x] ユーザー様による手動検証により、オーバーレイおよびサイドバーの正常表示を確認済み。
    - [x] 外部CSSによるスタイリングが正しく適用されていることを確認。
    - [ ] **Step 4-2 Verification Gate**: 
        1. インラインスタイルが各モジュールから抽出され、CSSクラスに置き換わっている証拠を提示する。
        2. 全てのUIコンポーネントの外観が正常に維持されているスクショ/動画を提示する。
        3. ユーザーの承認（Approved）を得るまで、**Step 4-3 の実装は絶対に行わない。**

---

### Phase 4-3: Final Cleanup & Commenting

- [x] **Step 4-3: 最終クリーンアップとコメント整備** <!-- id: 4-3 -->
    - [x] `MessageRenderer.js`: `_parseMarkdown` 内のインラインスタイル（h1, h2, h3, ul等）を削除し、`ui_components.css` に集約。
    - [x] 未使用のインラインスタイル修正残り（もしあれば）の最終スイープ。
    - [x] 全主要クラス（`GeminiService`, `GameUI` 等）への JSDoc コメント整備。
- [x] **Step 4-3-B: Markdown Parser Overhaul (Hierarchical Block Processor)** <!-- id: 4-3-b -->
    - [x] `MessageRenderer.js`: リスト項目の内容を再帰的にパースする「ブロックプロセッサ」を実装。
    - [x] 段落、見出し、リストの境界を正確に認識し、HTML の入れ子構造（ul > li > ul）を正しく生成。
    - [x] **Verification Gate 4-3-B**: 多階層リストのレンダリング検証完了（ユーザー確認済み）。
- [x] **Verification Gate 4-3: Layout Consistency & Code Quality** <!-- id: gate-4-3 -->
    - [x] チャットメッセージ内の Markdown 要素（h2 等）が 18px で正しく装飾されていることをブラウザで確認。
    - [x] インラインスタイルが JS 内から一掃され、外部CSSに移行したことを確認。
    - [x] 主要モジュールの JSDoc 整備完了。

---

### Phase 4-4: Legacy Code Removal

- [ ] **Step 4-4: Legacy Code Removal**
    - **目的**: 遺物の排除による軽量化。
    - [x] **Step 4-4-A: Physical File Deletion** <!-- id: 4-4-a -->
        - [x] 以下の不要ファイル・ディレクトリを削除:
            - `debug/` ディレクトリ一式
            - `legacy_gemini.js`, `legacy_ui.css`
            - `temp_legacy_gemini.js`, `tmp_legacy_svm.js`, `tmp_legacy_svm_utf8.js`
    - [x] **Step 4-4-B: Code Cleanup** <!-- id: 4-4-b -->
        - [x] `SplitViewManager.js` 内の不要な `geminiIframe` 参照や待機ループを削除。
            - コメントマーカーの削除、iframe関連の遺物コードのクリーンアップ完了。
    - [ ] **[検証]**: 
        - ファイル削除後も、拡張機能の全機能（解析、チャット、UI表示）が正常に動作することを確認。
    - [x] **Step 4-4 Verification Gate**: 
        1. ファイル削除後のディレクトリ一覧と、全機能の最終動作確認結果を提示する。 (完了)
        2. ユーザーの最終承認を得て、リファクタリング完了とする。 (完了)

---

## 3. 残課題
- **Firefox対応**: 現状Chrome専用APIを使用している箇所の洗い出し。
