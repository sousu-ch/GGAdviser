# GGAdviser: Meta Hunter Mode 実装計画書

## 1. 目的とゴール
ユーザーが能動的に画像を探索し、ヒントを見つけ出す「ゲーム型学習モード（Meta Hunter Mode）」を実装する。
これにより、受動的な解説閲覧だけでなく、発見と達成感を伴う学習体験を提供する。

---

## 2. 実装フェーズ (Implementation Phases)

**進捗状況の更新**: 未着手=`[ ]`, 作業中=`[/]`, 完了=`[x]`

### Phase 0: Refactoring (構造整理)
**目的**: `SplitViewManager.js` から画像オーバーレイとグリッド描画ロジックを分離し、Hunter Mode の拡張に耐えうる設計にする。

- [x] **Step 0-1: GridOverlayManager.js の作成**
    - [x] **[実装]**: 
        - 新規ファイル `content_scripts/modules/GridOverlayManager.js` を作成。
        - `SplitViewManager.js` からメソッド群を移動・適合させる: `showImageOverlay`, `closeOverlay`, `_renderGridLayer`, `_renderHighlight`, `persistence` logic.
    - [x] **[検証]**: 
        - コードがエラーなくロードされることを確認。

- [x] **Step 0-1 Verification Gate**: 
    1. Step 0-1の実装・検証を完了させる。
    2. **検証結果の証拠（新ファイルの存在確認）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Step 0-2 の実装は絶対に行わない。**

- [x] **Step 0-2: SplitViewManager.js の修正**
    - [x] **[実装]**: 
        - `GridOverlayManager` をインスタンス化。
        - 既存呼び出しを委譲するように変更。
    - [x] **[検証]**: 
        - 既存の解析機能を使用し、画像オーバーレイとグリッドが**以前と全く同じように動作すること**を確認。

- [x] **Step 0-2 Verification Gate**: 
    1. Step 0-2の実装・検証を完了させる。
    2. **検証結果の証拠（動作確認動画/ログ）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Phase 1 の実装は絶対に行わない。**

- [x] **Step 0-3: HeaderControlManager.js の分離 (追加リファクタリング)**
    - [x] **[実装]**: 
        - 新規ファイル `content_scripts/modules/HeaderControlManager.js` を作成。
        - `SplitViewManager.js` からボタン注入・監視ロジックを移動。
    - [x] **[検証]**: 
        - 拡張機能をリロードし、Map作成画面でボタンが表示・機能することを確認。

- [x] **Step 0-3 Verification Gate**: 
    1. 実装・検証を完了させる。
    2. **検証結果の証拠を提示し**、ユーザーに動作確認を依頼する。
    3. これにて Phase 0 完了とする。


### Phase 1: Dual-Output Prompt & Logic (プロンプトとレスポンス解析)
**目的**: AIに「解説テキスト」と「システム用JSONデータ」の両方を一度に出力させ、Web UI上でそれらを分離して扱う仕組みを実装する。

- [x] **Step 1-1: Prompt Layout & Content Update**
    - [x] **[実装]**:
        - `constants.js` の `PROMPT.DEFAULT` を更新。
        - JSONスキーマを定義。
    - [x] **[検証]**: 
        - Geminiの出力に、解説とJSONブロックの両方が含まれていることを確認（検証完了）。

- [x] **Step 1-1 Verification Gate**:
    1. プロンプト更新とJSON出力の確認を完了させる。
    2. **検証結果の証拠を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Step 1-2 の実装は絶対に行わない。**

- [x] **Step 1-2: レスポンス解析ロジック** (`ResponseParser.js`)
    - [x] **[実装]**: 
        - 新規クラス `ResponseParser` を作成。
        - JSON部分をパースしてイベント `GG_GAME_DATA_FETCH` を発火。
    - [x] **[検証]**: 
        - 解説文だけが表示され、裏でJSONデータが正しくConsoleに出力されることを確認。

- [x] **Step 1-2 Verification Gate**: 
    1. Step 1-2の実装・検証を完了させる。
    2. **検証結果の証拠（Consoleログとスクリーンショット）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Phase 2 の実装は絶対に行わない。**


### Phase 2: Hunter Mode UI (UI実装)
**目的**: 「解説モード」と「ハンターモード」の切り替えタブ、およびハンターモード専用の探索画面を実装する。

- [x] **Step 2-1: モード切替タブの実装**
    - [x] **[実装]**: 
        - `SplitViewManager.js` に `_renderModeTabs` メソッドを追加し、タブ切り替えUIを実装。
        - `GameUI.js` でサイドバー描画ロジックを実装。
    - [x] **[検証]**: 
        - UI上のタブをクリックし、ChatとAnalysisが正しく切り替わることを確認。

- [x] **Step 2-1 Verification Gate**: 
    1. Step 2-1の実装・検証を完了させる。
    2. **検証結果の証拠（タブ切り替え動作の動画/GIF）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Step 2-2 の実装は絶対に行わない。**

- [x] **Step 2-2: UI Polish & Localization (UI洗練と日本語化)**
    - [x] **[実装]**:
        - UIの日本語化。
        - FlagCDNによる国旗画像表示とSVGアイコンの実装。
        - プロンプトの調整（階層的な地域情報など）。
    - [x] **[検証]**:
        - 国旗が正しく表示され、アイコンが洗練されていることを確認。

- [x] **Step 2-2 Verification Gate**: 
    1. Step 2-2の実装・検証を完了させる。
    2. **検証結果の証拠（スクリーンショット）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Step 2-3 の実装は絶対に行わない。**

- [ ] **Step 2-3: Interactive Features (インタラクティブ機能)**
**目的**: サイドバーの情報と地図（グリッド）を連携させ、直感的な操作を実現する。
    - [ ] **[実装]**: 
        - **グリッド連携**: ローカル情報の座標（例: "A-3"）をクリックすると、地図上の該当グリッドがハイライトされる機能。
        - **ホバー効果**: 手がかりにマウスオーバーすると、該当エリアを強調表示。
    - [ ] **[検証]**: 
        - クリック時に地図上のグリッドが正しく反応・発光することを確認。

- [ ] **Step 2-3 Verification Gate**: 
    1. Step 2-3の実装・検証を完了させる。
    2. **検証結果の証拠（動作確認動画またはスクリーンショット）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Step 2-4 の実装は絶対に行わない。**

- [ ] **Step 2-4: Tactical UX & Loading State (ロード演出)**
**目的**: 解析待ち時間をストレスのない体験に変える（Tactical Loading）。
    - [ ] **[実装]**: 
        - **Tactical Loader**: 分析タブ内に「System Scanning...」のような演出を表示。
        - チャットタブへの強制切り替えを廃止。
    - [ ] **[検証]**: 
        - 「ANALYZE」ボタン押下後、タブ移動せずにかっこいいロード画面が表示され、完了後に結果が表示されることを確認。

- [ ] **Step 2-4 Verification Gate**:
    1. Step 2-4の実装・検証を完了させる。
    2. **検証結果の証拠を提示し**、ユーザーに動作確認を依頼する。
    3. これにて Phase 2 完了とする。

## 3. 残課題・検討事項
- **永続化**: 今回は実装しないが、好評であれば `chrome.storage` への保存を Phase 3 で検討。
- **エラーハンドリング**: JSONパース失敗時は「ハンターモード」タブを非活性にする（Fail-safe）。

## 1. 目的とゴール
ユーザーが能動的に画像を探索し、ヒントを見つけ出す「ゲーム型学習モード（Meta Hunter Mode）」を実装する。
これにより、受動的な解説閲覧だけでなく、発見と達成感を伴う学習体験を提供する。

---

## 2. 実装フェーズ (Implementation Phases)

**進捗状況の更新**: 未着手=`[ ]`, 作業中=`[/]`, 完了=`[x]`

### Phase 0: Refactoring (構造整理)
**目的**: `SplitViewManager.js` から画像オーバーレイとグリッド描画ロジックを分離し、Hunter Mode の拡張に耐えうる設計にする。

- [x] **Step 0-1: GridOverlayManager.js の作成**
    - [ ] **[実装]**: 
        - 新規ファイル `content_scripts/modules/GridOverlayManager.js` を作成。
        - `SplitViewManager.js` から以下のメソッド群を移動・適合させる:
            - `showImageOverlay`
            - `closeOverlay`
            - `_renderGridLayer`
            - `_renderHighlight` (および関連CSS設定)
            - `persistence` logic (Grid toggle state)
    - [ ] **[検証]**: 
        - コードがエラーなくロードされることを確認。

- [ ] **Step 0-1 Verification Gate**: 
    1. Step 0-1の実装・検証を完了させる。
    2. **検証結果の証拠（新ファイルの存在確認）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Step 0-2 の実装は絶対に行わない。**

- [x] **Step 0-2: SplitViewManager.js の修正**
    - [x] **[実装]**: 
        - `GridOverlayManager` をインスタンス化。
        - 既存の `showImageOverlay` 呼び出しを `this.gridManager.showOverlay(...)` に委譲するように変更。
        - 不要になったコードを削除。
    - [x] **[検証]**: 
        - 既存の解析機能を使用し、画像オーバーレイとグリッドが**以前と全く同じように動作すること**を確認。
        - リグレッション（機能退行）がないことを保証する。

- [x] **Step 0-2 Verification Gate**: 
    1. Step 0-2の実装・検証を完了させる。
    2. **検証結果の証拠（動作確認動画/ログ）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Phase 1 の実装は絶対に行わない。**

- [x] **Step 0-3: HeaderControlManager.js の分離 (追加リファクタリング)**
    - [x] **[実装]**: 
        - 新規ファイル `content_scripts/modules/HeaderControlManager.js` を作成。
        - `SplitViewManager.js` からボタン注入・監視ロジック (`injectAppHeaderToggle`, `MutationObserver`等) を移動。
        - 疎結合にするため、コールバック (`onToggleUI`, `onToggleWide`) で連携するように設計。
    - [x] **[検証]**: 
        - 拡張機能をリロードし、Map作成画面でボタン（[AI ON], [WIDE]）が表示されることを確認。
        - ボタン押下時に正しく機能が動作することを確認。
        - ページ遷移してもボタンが維持（再注入）されることを確認。

- [x] **Step 0-3 Verification Gate**: 
    1. 実装・検証を完了させる。
    2. **検証結果の証拠を提示し**、ユーザーに動作確認を依頼する。
    3. これにて Phase 0 完了とする。


### Phase 1: Dual-Output Prompt & Logic (プロンプトとレスポンス解析)
**目的**: AIに「解説テキスト」と「システム用JSONデータ」の両方を一度に出力させ、Web UI上でそれらを分離して扱う仕組みを実装する。

- [x] **Step 1-1: Prompt Layout & Content Update**
    - [x] **[実装]**:
        - `constants.js` の `PROMPT.DEFAULT` を更新。
        - 既存の自然言語解説に加え、最後に `---METADATA_START---` という区切り文字と、厳密なJSONデータを出力する指示を追加。
        - JSONスキーマ（`global_clues`, `local_clues`）を定義。
        - **修正**: テンプレートリテラルの構文エラー回避のため、プロンプト内のバッククォートをシングルクォート/Unicodeエスケープに変更。
        - **修正**: JSONの網羅性を高めるため、「個別のリスト化 (De-consolidation)」ルールを追加。
    - [x] **[検証]**:
        - `constants.js` の構文エラーがないこと（ロード可能であること）を確認。
        - Geminiの出力に、解説とJSONブロックの両方が含まれていることを確認。
        - JSONブロックが指定のスキーマ（`local_clues`の配列形式など）に従っていることを確認。

- [x] **Step 1-1 Verification Gate**:
    1. プロンプト更新とJSON出力の確認を完了させる。
    2. **検証結果の証拠を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Step 1-2 の実装は絶対に行わない。**

- [x] **Step 1-2: レスポンス解析ロジック** (`ResponseParser.js`)
    - [x] **[実装]**: 
        - 新規クラス `ResponseParser` を作成（`MutationObserver`利用）。
        - DOM上の `---METADATA_START---` を監視し、発見次第テキストを分割。
        - JSON部分をパースしてイベント `GG_GAME_DATA_FETCH` を発火。
        - **修正**: `gemini.js` での `_debug` 定義漏れと、`PromptBuilder.js` のマニフェスト登録漏れを修正。
        - **修正**: `ResponseParser.js` の正規表現を緩和し、ストリーミング中の不完全なバッククォートを無視するロジックを追加。
    - [x] **[検証]**: 
        - 解説文だけが表示され、裏でJSONデータが正しくConsoleに出力されることを確認。
        - 自己検証（Unit Test & Screenshot）にて正常動作を確認。

- [x] **Step 1-2 Verification Gate**: 
    1. Step 1-2の実装・検証を完了させる。
    2. **検証結果の証拠（Consoleログとスクリーンショット）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Phase 2 の実装は絶対に行わない。**


### Phase 2: Hunter Mode UI (UI実装)
**目的**: 「解説モード」と「ハンターモード」の切り替えタブ、およびハンターモード専用の探索画面を実装する。

- [x] **Step 2-1: モード切替タブの実装**
    - [x] **[実装]**: 
        - `SplitViewManager.js` に `_renderModeTabs` メソッドを追加。
        - サイドバー内にタブUI（CHAT / META DATA）を配置。
        - `_renderSidebar` ロジックを修正し、タブ切り替えによって表示コンテンツ（Gemini Iframe vs GameUI Panel）をスイッチする。
    - [x] **[検証]**: 
        - UI上のタブをクリックし、コンテンツが正しく切り替わることを確認。

- [x] **Step 2-1 Verification Gate**: 
    - [x] Step 2-1の実装・検証を完了させる。
    - [x] **検証結果の証拠（タブ切り替え動作の動画/GIF）を提示し**、ユーザーに動作確認を依頼する。
    - [x] ユーザーの承認を得るまで、**Step 2-2 の実装は絶対に行わない。**

- [x] **Step 2-2: UI Polish & Localization (デザイン洗練と日本語化)**
    - [x] **[実装]**: 
        - フラグ表示の改善: FlagCDNを採用し、WindowsでのEmoji描画問題を解決。
        - アイコン刷新: 汎用Emojiから専用のSVGアイコン（Map Pin, Car Front）へ変更。
        - Prompt更新: 地域情報（Region/Province）を階層的に取得するように指示を変更。
    - [x] **[検証]**: 
        - 国旗が綺麗に表示され、UI全体が「Tactical」なデザインで統一されていることを確認。

- [x] **Step 2-2 Verification Gate**: 
    - [x] Step 2-2の実装・検証を完了させる。
    - [x] **検証結果の証拠（スクリーンショット）を提示し**、ユーザーに動作確認を依頼する。
    - [x] ユーザーの承認を得るまで、**Step 2-3 の実装は絶対に行わない。**

- [x] **Step 2-3-1: Core Interaction Logic (イベント連携の実装)**
**目的**: UIなしでも、イベント経由で「グリッドクリック→リスト解除」が機能するロジックを確立する。
    - [x] **[実装]**: 
        - `GridOverlayManager`: グリッドクリック時に `GG_GRID_CELL_CLICKED` を発火するロジック。
        - `GameUI`: `GG_GRID_CELL_CLICKED` をリッスンし、対象のリスト項目を `unlockClue` するロジック。
        - `GameUI`: リストホバー時に `GG_HIGHLIGHT_REQ` を発火するロジック。
    - [x] **[検証]**: 
        - consoleからイベントを擬似発火させ、機能が動作することをスクリプトで検証する。

- [x] **Step 2-3-1 Verification Gate**: 
    1. Step 2-3-1の実装・検証を完了させる。
    2. **検証結果の証拠（検証スクリプトの実行ログ）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Step 2-3-2 の実装は絶対に行わない。**

- [ ] **Step 2-3-2: UI Entry Point (ボタンとオーバーレイ統合)**
**目的**: ユーザーが実際に機能を利用するためのUI（入り口）を実装する。
    - [ ] **[実装]**:
        - `GameUI`: リストヘッダーに「📷 View Evidence」ボタンを追加。
        - `GameUI`: ボタン押下時に `GridOverlayManager.showOverlay` を呼び出す連携処理。
    - [ ] **[検証]**: 
        - ボタンを押してグリッドが表示され、その上でグリッドをクリックして連携動作が完結する一連のフロー。

- [ ] **Step 2-3-2 Verification Gate**: 
    1. Step 2-3-2の実装・検証を完了させる。
    2. **検証結果の証拠（実操作の動画またはスクリーンショット）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Step 2-4 の実装は絶対に行わない。**

## 3. 残課題・検討事項
- **永続化**: 今回は実装しないが、好評であれば `chrome.storage` への保存を Phase 3 で検討。
- **エラーハンドリング**: JSONパース失敗時は「ハンターモード」タブを非活性にする（Fail-safe）。
