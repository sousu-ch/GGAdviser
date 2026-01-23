# Gemini統合 コンプライアンス対応改修計画書 (Granular Version)

## 1. 目的とゴール
本改修の目的は、Googleの利用規約およびChromeウェブストアのポリシー（特にセキュリティ機能の妨害および自動化ボットに関する条項）に完全準拠しつつ、現在のユーザー体験（サイドバーでのチャット、画像連携）を維持・再現することです。

### 達成される状態
1.  **完全なコンプライアンス**: `iframe` による強制的な埋め込みやセキュリティヘッダーの無効化（`rules.json`）を廃止します。
2.  **「タブ + アシスタント」モデル**: Geminiを正規の別タブで開き、ユーザーの操作（送信ボタン押下）を必須とすることで、「ボット」ではなく「入力支援ツール」としての地位を確立します。
3.  **シームレスな連携**: 「自動戻り（Auto-Return）」機能と「Proxy Chat（サイドバーチャット）」により、ユーザーはタブの切り替えを意識せず、サイドバー内で完結しているかのような体験を得られます。

---

## 2. 仕様詳細

### 2.1. 基本アーキテクチャ: "Proxy Stream UI"
サイドバー（`GameUI.js`）を、単なる結果表示板から「情報ストリーム」へ昇格させます。
- **入力**: サイドバー最下部に設けた入力欄で行います。
- **送信**: 送信ボタンを押すと、裏でGeminiタブが開き、テキストが転送されます。
- **表示**: Geminiの応答（解説テキスト）を正規表現で解析し、サイドバー内にストリーム形式（枠なし）で追記します。リンク機能（`【看板】[画像1: A-2]`）もここで再現します。

### 2.2. ワークフロー: "Draft & Auto-Return"
規約違反となる「完全自動化」を避けつつ、手間を最小限にするフローです。

1.  **ユーザー**: サイドバーで質問し「Ask」を押す。
2.  **システム**: Geminiタブを開き（またはフォーカスし）、質問文をペーストする。
3.  **ユーザー**: Geminiタブで**「送信 (Enter)」ボタンだけ手動で押す**。（ここがコンプライアンス上の重要ポイント）
4.  **システム**:
    - 生成開始を検知。
    - 生成完了を検知（Stopボタン消失）。
    - 結果（JSON + 解説テキスト）を抽出。
    - **自動でマップのタブに切り替える（Auto-Return）。**
5.  **ユーザー**: 気づいたらマップ画面に戻っており、サイドバーに回答が追記されているのを見る。

---

## 3. 実装フェーズ (Implementation Phases)

**進捗状況の更新**: 未着手=`[ ]`, 作業中=`[/]`, 完了=`[x]`

### Phase 1: セキュリティ違反の除去と基盤整備
**目的**: 規約違反状態を脱し、新しいタブ制御の基盤を作る。

- [x] **Step 1-1: セキュリティ設定の削除 (Manifest Cleaning)**
    - [x] **[実装]**:
        - `rules.json`: ファイル削除。
        - `manifest.json`: `declarative_net_request` 削除、`rules.json` 参照削除。
    - [x] **[検証]**:
        - 拡張機能リロードでエラーなし確認。
        - `gemini.google.com` のレスポンスヘッダーが正常（改変なし）であることを確認。

- [x] **Step 1-1 Verification Gate**:
    1. Step 1-1の実装・検証を完了させる。
    2. **検証結果の証拠（マニフェストの状態、エラーなしのコンソール）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Step 1-2 の実装は絶対に行わない。**

- [x] **Step 1-2: Background Scriptのタブ制御実装（タブ再利用）**
    - [x] **[実装]**:
        - `background.js`: `OPEN_GEMINI_TAB` 受信時に、`chrome.tabs.query` で既存のGeminiタブ（`gemini.google.com/app`）を検索する。
        - **[重要]**: 既存タブがあれば `update` でアクティブ化（再利用）、なければ `create` で新規作成するロジックを実装し、**タブ乱立を防ぐ**。
        - `background.js`: 呼び出し元（マップタブ）のIDを保存し、完了後の戻り先として確保する。
    - [x] **[検証]**:
        - 連続で「Analyze」を実行しても、**Geminiタブが1つしか存在しない**状態が維持されることを確認。

- [x] **Step 1-2 Verification Gate**:
    1. Step 1-2の実装・検証を完了させる。
    2. **検証結果の証拠（タブが開く様子）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Step 1-3 の実装は絶対に行わない。**

- [x] **Step 1-3: SplitViewManagerのIframe除去 & SidePanel化**
    - [x] **[実装]**:
        - `SplitViewManager.js`: `renderGeminiIframe` を削除し、`renderSidePanel` を実装（純粋な `div#gg-meta-panel` を生成）。
        - `SplitViewManager.js`: `initSplitter` 内の `iframes` 配列からGeminiフレームを除去・修正し、リサイズ対象をSidePanelに変更する。
        - `SplitViewManager.js`: Analyzeボタンのクリックイベントを `OPEN_GEMINI_TAB` 送信に変更。
        - CSS: `renderSidePanel` 用の最低限のスタイル調整（高さ100%, overflow-y: auto）。
    - [x] **[検証]**:
        - マップ画面でAnalyzeボタンを押し、IframeではなくIframeレスなサイドバーが表示され、Geminiが別タブで開くことを確認。
    
- [x] **Step 1-3 Verification Gate**:
    1. Step 1-3の実装・検証を完了させる。
    2. **検証結果の証拠（IframeのないDOM）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Phase 2 の実装は絶対に行わない。**


### Phase 2: Gemini連携ロジックの修正
**目的**: コンテンツスクリプトを「自動送信ボット」から「入力支援アシスタント」へ変更する。

- [x] **Step 2-1-A: 手動送信の強制 (Stop Auto-Send)**
    - [x] **[実装]**:
        - `gemini.js`: `checkInterval` (自動ポーリング) の廃止。
        - `gemini.js`: `executeInjection` 内の `sendButton.click()` 削除。
        - `gemini.js`: ペースト完了後に「送信してください」Toast/ConsoleLogを表示。
    - [x] **[検証]**:
        - Analyze実行後、Geminiタブで入力欄にテキストが入った状態で止まること、自動送信されないことを確認。

- [x] **Step 2-1-A Verification Gate**:
    1. ユーザーに動作確認（自動送信されないこと）を依頼する。
    2. 承認後、次へ進む。

- [x] **Step 3-2-E (Final Tone Tuning)**:
    - [x] **Global Section**: Floating Chips (Transparent BG).
    - [x] **Divider**: Subtle Line (HR).
    - [x] **Typography**: Title 16px, Body 15px.
- [x] **Step 3-2-G (Header Block Design)**:
    - [x] **Header**: Grey Block (`#f1f3f4`).
    - [x] **Divider**: Removed.
- [x] **Step 3-2-H (Header Refinement)**:
    - [x] Lighten Background (`#f8f9fa`).
- [x] **Step 3-2-I (Conflict Resolution)**:
    - [x] Update `game_mode.css` to remove dark theme overrides.
    - [x] Unify to Light Theme (#fff / #f8f9fa).
- [x] **Step 3-2-J (Divider Color Restoration)**:
    - [x] Darken Header Block to `#e8eaed` (Grey 200).
- [x] **Step 3-2-Recovery (Card Layout)**:
    - [x] Restore `margin-bottom` and `radius` in `game_mode.css`.
- [x] **Step 3-2-Fix (Legacy Cleanup)**:
    - [x] Hide Black Divider (`display: none`).
    - [x] Fix Chip Text Color (Remove `#e8eaed`).
- [x] **Step 3-2-Alignment (Tag)**:
    - [x] Align Coordinates to Right (`margin-left: auto`).
- [ ] **Step 2-1-B: 生成監視とデータ抽出 (Observer & Capture)**
    - [ ] **[実装]**:
        - `gemini.js`: `executeInjection` ペースト直後に `setupGenerationObserver` を呼び出し（送信前待機）。
        - `gemini.js`: `generationObserver` で `Stop` ボタンの出現(生成中) -> 消滅(完了) を検知するロジックの確認。
        - `gemini.js`: 完了時に `ResponseParser` でパースし、`.text` (全文) と `.data` (JSON) を取得。
        - `ResponseParser.js`: 変数初期化バグ (`let jsonStr`) の修正。
    - [x] **[検証]**:
        - コンソールで手動テスト。`PASTE_PROMPT` トリガーではなく、コンソールへの手動入力で確認する。
        - **検証用ペイロード**:
             ```text
             JSON形式で何か返して。ただし、回答の最後に以下の区切り文字を入れて。
             ---METADATA_START---
             {
               "global_clues": ["test"],
               "local_clues": [{"content": "test"}]
             }
             ```
        - 期待値: コンソールに `JSON Data Successfully Parsed!` が表示され、送信データログが出る。

- [x] **Step 2-1-B Verification Gate**:
    1. ユーザーに上記ペイロードでの動作確認（コンソールログ）を依頼する。
    2. 承認後、次へ進む。
    3. ユーザーの承認を得るまで、**Step 2-3 の実装は絶対に行わない。**

- [x] **Step 2-3: Auto-Returnの実装 (Binding)**
    - [ ] **[実装]**:
        - `background.js`: `GG_PARSED_RESPONSE` を受信したら、保存しておいた `originTabId`（マップタブ）に対してデータを転送する（放送ではなくユニキャスト）。
        - `background.js`: 転送後、`chrome.tabs.update(originTabId, {active: true})` で自動的にマップタブへ戻す。
        - `SplitViewManager.js`: データ受信イベントでログ出力確認。
    - [x] **[検証]**:
        - Analyze実行 -> Gemini生成 -> マップタブに自動遷移することを確認。
        - マップタブのコンソールに `Received Game Data from Background` が表示されており、データ（及びテキスト）が届いていることを確認。

- [x] **Step 2-3 Verification Gate**:
    1. Step 2-3の実装・検証を完了させる。
    2. **検証結果の証拠を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**Phase 3 の実装は絶対に行わない。**


### Phase 3: Proxy Stream UI (サイドバー) の構築
**目的**: サイドバーでGeminiライクな連続的な情報表示体験ができるようにUIを刷新する。

#### Step 3-1: データ抽出の確実化 (Data Extraction Hardening)
**目的**: テキストデータがフロントエンドまで確実に届いていることを保証する（UI表示の前段階）。

- [x] **Step 3-1-A: プロンプトマーカーの導入**
    - [x] **[実装]**: 
        - `content_scripts/utils/prompts.js` を修正。
        - 解説テキスト部分を `[解説開始]` と `[解説終了]` で囲むよう指示を追加する。
    - [x] **[検証]**: 
        - `Request Payload` (DevTools) を確認し、送信されるプロンプトにマーカーが含まれていることを確認する。

- [x] **Step 3-1-A Verification Gate**: 
    1. プロンプトの変更のみを行い、コードを実行・検証する。
    2. ユーザーの承認を得るまで、**Step 3-1-B の実装は絶対に行わない。**

- [x] **Step 3-1-B: パーサーロジックの修正**
    - [x] **[実装]**: 
        - `content_scripts/modules/ResponseParser.js` の `parse` メソッドを修正。
        - 正規表現または文字列検索で、`[解説開始]` ～ `[解説終了]` の間のみを抽出するロジックに変更する。
    - [x] **[検証]**: 
        - 既存のユニットテスト(あれば)または動作確認で、JSONとテキストが正しく分離されることを確認する。

- [x] **Step 3-1-B Verification Gate**: 
    1. パーサーの実装・検証を完了させる。
    2. ユーザーの承認を得るまで、**Step 3-1-C の実装は絶対に行わない。**

- [x] **Step 3-1-C: 検証用ログの追加**
    - [x] **[実装]**: 
        - `content_scripts/gemini.js` のログ出力部分を修正。
        - `Extracted Markdown Text: [文字数] chars (Start: "...")` のように、取得成功の証拠をログに出す。
    - [x] **[検証]**: 
        - 実際に「ANALYZE」を実行し、コンソールに上記ログが出力されることを確認する。
        
- [x] **Step 3-1-C Verification Gate**: 
    1. 検証結果の証拠（ログのスクリーンショットまたはテキスト）を提示し、ユーザーに動作確認を依頼する。
    2. ユーザーの承認を得るまで、**Phase 3-2 のUI実装は絶対に行わない。**


#### Phase 3-2: UI実装 (Stream UI Implementation)
**目的**: 届いたデータを段階的に表示・整形する。

- [x] **Step 3-2-A: 生テキストの表示 (Raw Text Rendering)**
    - [x] **[実装]**: 
        - `content_scripts/modules/GameUI.js` の `renderTable` を修正。
        - `data.explanationText` がある場合、単純な `<div>` (class: `gg-stream-raw`) としてテキストを表示する。
    - [x] **[検証]**: 
        - サイドバーにテキスト（Markdown記号含む）がそのまま表示されることを確認する。

- [x] **Step 3-2-A Verification Gate**: 
    1. 生テキストの表示確認を行う。
    2. ユーザーの承認を得るまで、**Step 3-2-B の実装は絶対に行わない。**

- [x] **Step 3-2-B1: 内部パーサー実装 (Basic Markdown)**
    - [x] **[実装]**: 
        - `GameUI.js` に `_parseMarkdown(text)` メソッドを追加。
        - **文字列置換パイプライン**として実装する。
        - 実装する記法: 見出し(`#`), リスト(`-`), 太字(`**`) のみ。
        - **注意**: 画像リンクはこの段階ではまだ変換しない（生テキストのまま残す）。
    - [x] **[検証]**: 
        - サイドバーで箇条書きや太字が正しくHTML化されていることを確認。
        - リンクテキスト `[Image 1: A-2]` がそのまま表示されていることを確認。

- [x] **Step 3-2-B1 Verification Gate**: 
    1. 基本Markdownの変換結果を確認する。
    2. ユーザーの承認を得るまで、**Step 3-2-B2 の実装は絶対に行わない。**

- [x] **Step 3-2-B2: リンク解析と互換性実装 (Link Compatibility)**
    - [x] **[実装]**: 
        - `GameUI.js`: `_parseMarkdown` に `ImageInjector` 互換の正規表現を追加。
            - Regex: `/【([^】]+)】\[(?:画像|Image)?\s*(\d+)\s*:\s*([A-Z0-9-]+)\]/g`
        - 文字列置換で `<a href="#" class="gg-hint-link" ...>` を生成。
        - `dataset.coord`, `dataset.imgIndex`, `dataset.linkId` を付与し、旧仕様と完全互換にする。
        - `GameUI.js`: コンテナ (`#gg-meta-panel` または `.gg-stream-raw`) にイベント委譲(Delegation)を設定。
            - `click` -> `GG_CONSTANTS.EVENTS.HINT_CLICK` 発行
            - `mouseover/out` -> `GG_CONSTANTS.EVENTS.HINT_HOVER` 発行
    - [x] **[検証]**: 
        - リンクが青色（または指定色）で表示され、クリック可能であることを確認。
        - クリック時にコンソールログ (`HINT_CLICK dispatched`) が出ることを確認。

- [x] **Step 3-2-B2 Verification Gate**: 
    1. リンクの生成とイベント発火（ログレベル）を確認する。
    2. ユーザーの承認を得るまで、**Step 3-2-B3 の実装は絶対に行わない。**

- [x] **Step 3-2-B3: タブ制御と表示分離 (Tab Integration)**
    - [x] **[実装]**: 
        - `SplitViewManager.js`: タブ切り替えロジックを修正。`GameUI.setTabMode('chat' | 'meta')` を呼ぶように変更。
        - `GameUI.js`: 
            - `setTabMode` メソッド実装。
            - `chat` モード: `stream-raw` (チャット) を表示、`meta-list` (分析結果) を非表示。
            - `meta` モード: 逆の表示状態にする。
    - [x] **[検証]**: 
        - タブをクリックして表示が切り替わることを確認。
        - タブを切り替えると、チャット（解説テキスト）と分析結果（リスト）が綺麗に切り替わることを確認。

- [x] **Step 3-2-B3 Verification Gate**: 
    1. タブ切り替えによる表示制御を確認する。
    2. ユーザーの承認を得るまで、**Step 3-2-C の実装は絶対に行わない。**

- [x] **Step 3-2-B4: 双方向ハイライト復元 (Legacy Highlight)**
    - [x] **[実装]**:
        - `GridInteractionHandler.js`: グリッドホバー時に `coord: null` を送信 (Highlight Allトリガー)。
        - `GameUI.js`: 
            - ホバー時は「画像内全リンク」をアンバー色 (`.gg-active-amber`) でハイライト。
            - クリック時は「特定座標リンク」を青色 (`.gg-active-blue`) でハイライト。
            - グリッド再ホバー時に、既存の青色ハイライトを即座に解除。
    - [x] **[検証]**:
        - グリッドホバーで全リンクが光ることを確認。
        - グリッドクリックで特定リンクが青くなることを確認。
        - その後マウスを動かすと青色が消えることを確認。

- [x] **Step 3-2-C: ライトモード・スタイリング (Styling)**
    - [x] **[実装]**: 
        - `css/ui_components.css`: `.gg-stream-raw` を追加 (16px, Google Sans/System UI, 白カードスタイル)。
        - `manifest.json`: `ui_components.css` をマップアプリ側にも注入するように修正。
        - `GameUI.js`: インラインスタイルを削除し、CSSクラスそのものを尊重させるように修正。
    - [x] **[検証]**: 
        - フォントサイズが16px（旧来通り）に戻ったことを確認。
        - スタイルが正しく適用されていることを確認。

- [x] **Step 3-2-C Verification Gate**: 
    - [x] 最終確認を行い、Phase 3-2完了とする。

- [x] **Step 3-3: 入力エリアの実装 (Input Implementation)**
    - [x] **Step 3-3-A: UI Layout & CSS (Visuals)**
        - [x] **[実装]**:
            - `GameUI.js`: `renderInputArea` メソッドを追加。
            - フッター領域を作成し、テキストエリアと「送信」ボタンを配置。
            - `ui_components.css`: Gemini風のスタイル（固定フッター、角丸、アイコン）を適用。
        - [x] **[検証]**:
            - 画面下部に正しく入力欄が表示され、リサイズやスクロールに追従することを確認。
    - [x] **Step 3-3-A Verification Gate**:
        1. UIの表示崩れがないか確認する。
        2. 承認後、ロジック実装へ進む。

    - [x] **Step 3-3-B: Event Wiring (Internal Logic)**
        - [x] **[実装]**:
            - `GameUI.js`: テキストエリアの入力イベント（Enter, Shift+Enter）をハンドリング。
            - ボタンクリックまたはEnter送信時に、入力内容をコンソールに出力するだけの処理を入れる。
        - [x] **[検証]**:
            - Shift+Enterで改行、Enterで送信イベント発火を確認。
            - コンソールに入力テキストが正しく表示されることを確認。
    - [x] **Step 3-3-B Verification Gate**:
        1. コンソールログの証拠を提示する。
        2. 承認後、送信ロジック接続へ進む。

    - [x] **Step 3-3-C: 追加プロンプト構築ロジック (Prompt Engineering)**
        - [x] **[実装]**:
            - `content_scripts/utils/prompts.js`: **`FOLLOW_UP` テンプレート**を実装。
                - **必須要件1**: `[解説開始]` ～ `[解説終了]` マーカーで回答本文を囲む指示。
                - **必須要件2**: 既存の `JSON` 構造 (`global_clues`, `local_clues`) を維持する指示。
            - `GameUI.js`: `_buildFollowUpPrompt(userText)` メソッドを実装し、ユーザー入力をテンプレートに埋め込む。
        - [x] **[検証]**:
            - コンソールでビルドされたプロンプトを確認し、マーカー指示とJSON指示が正しく含まれていることを確認。

    - [x] **Step 3-3-C Verification Gate**:
        1. プロンプトの内容がパーサーの要件（マーカー、JSON）を満たしているか確認する。
        2. 承認後、送信ロジックへ進む。

    - [x] **Step 3-3-D: 送信ロジックとリロード回避 (Transmission)**
        - [x] **[実装]**:
            - `background.js`: **`SEND_TO_GEMINI`** アクションを実装。
                - 既存Geminiタブがある場合: **リロードせず** `active: true` (フォーカス) のみにする。
                - ない場合: 新規タブ作成（従来の挙動）。
                - 共通: `PASTE_PROMPT` メッセージを送信。
            - `GameUI.js`: 送信イベントで `SEND_TO_GEMINI` を発行し、構築したプロンプトを渡す。
        - [x] **[検証]**:
            - サイドバーから送信 -> Geminiタブにフォーカス移動 -> プロンプトがペーストされることを確認。
            - **[重要]**: **ページのリロードが発生せず**、文脈が維持されていることを確認。

    - [x] **Step 3-3-D Verification Gate**:
        1. Geminiへのテキスト転送成功と、**リロードが発生しないこと**を確認する。
        2. 承認後、UI表示ロジックへ進む。

    - [x] **Step 3-3-E: チャット履歴と追記UI (Interactive Chat UI)**
        - [x] **Step 3-3-E1-a: DOM構造のリファクタリング (GameUI.js)**
            - [x] **[実装]**: `GameUI.js` を修正し、`metaContainer` と `chatContainer` の2つの箱を作成。既存要素を `metaContainer` に移動。
            - [x] **[検証]**: DOMインスペクタで、既存の分析表示（見た目・挙動）が変化していないこと（デグレードなし）を確認。
        
        - [x] **Step 3-3-E1-a Verification Gate**:
            1. DOM構造が分離され、既存の表示が崩れていないことを確認する。
            2. ユーザーの承認を得るまで、E1-bへは進まない。 (Approved)

        - [x] **Step 3-3-E1-b: チャット用スタイルの定義 (ui_components.css)**
            - [x] **[実装]**: `chatContainer` 内で使用する「吹き出し（User/AI）」用のCSSを `ui_components.css` に追加。
            - [x] **[検証]**: コンソールからダミー要素を追加し、スタイルが正しく適用されることを確認。

        - [x] **Step 3-3-E1-b Verification Gate**:
            1. ダミー吹き出しが正しくスタイル（左右配置、色）されることを確認する。
            2. ユーザーの承認を得るまで、E2へは進まない。 (Approved)
        - [x] **Step 3-3-E2: メッセージレンダリング (Rendering Logic)**
            - [x] **[実装]**: `appendUserMessage(text)` を実装（右側吹き出し）。
            - [x] **[実装]**: `appendAiMessage(text)` を実装（左側吹き出し、Markdownパース含む）。
            - [x] **[検証]**: コンソールからメソッドを直接呼び出し、正しく表示（スタイル適用）されることを確認。

        - [x] **Step 3-3-E2 Verification Gate**:
            1. ユーザー/AI双方のメッセージが正しくレンダリングされることをキャプチャで証明する。
            2. ユーザーの承認を得るまで、E3へは進まない。 (Approved)

        - [x] **Step 3-3-E3: 状態管理とクリアロジック (UI Logic)**
            - **目的**: 新規解析時のみ履歴を消去し、追記時は維持する。
            - [x] **[実装]**:
                - `api_viewer.js`: 解析ボタン押下（新規解析開始）時に `GG_ANALYSIS_START` イベントをディスパッチ。
                - `GameUI.js`: `GG_ANALYSIS_START` 受信時に `chatContainer` を空にする。
                - `GameUI.js`: `renderTable` を修正し、初回でも追記でも `appendAiMessage` を経由するように統一。
            - [x] **[検証]**:
                - コンソールから `GG_ANALYSIS_START` を発火させ、チャット欄が消去されることを確認。
                - `GG_GAME_DATA_FETCH` を複数回発火させ、履歴が積み重なることを確認。
                - **確認方法**: DOMインスペクタ及び画面キャプチャ。
        
        - [x] **Step 3-3-E3 Verification Gate**: 
            1. 擬似イベントによる「クリア」と「積み上げ」の挙動をキャプチャで証明する。
            2. 検証結果の証拠（スクショ等）を提示し、ユーザーに動作確認を依頼する。
            3. ユーザーの承認を得るまで、**Step 3-3-E4 の実装は絶対に行わない。** (Approved)

        - [x] **Step 3-3-E4: Gemini監視ルーチンの再活性化 (Gemini Interaction)**
            - **目的**: チャット追記（手動送信）後も、既存の回答監視・抽出ルーチンが確実に動作するようにする。
            - [x] **[実装]**:
                - `gemini.js`: `PASTE_PROMPT` 受信後の処理を修正。テキスト注入後、即座に `setupGenerationObserver()` を呼び出し、監視状態をリセット・活性化する。
                - `gemini.js`: 回答解析・抽出処理 (`parser.parse`) において、常に最新（最後）の回答メッセージを対象にするようロジックを微調整。
                - **※自動送信は行わず、ユーザーによる手動クリックを待機する設計を堅持する。**
            - [x] **[検証]**:
                - 1回目の解析完了後、サイドバーから追記プロンプトを送り、**Geminiタブ側で手動送信**する。
                - Geminiの生成完了後、サイドバーに自動で2回目の回答が届くことを確認。
                - **確認方法**: Geminiタブの `isGenerating` ログ及びAppタブの追記確認。
        
        - [x] **Step 3-3-E4 Verification Gate**: 
            1. ユーザーによる手動送信後、回答の自動回収・サイドバーへの戻却が正常に行われることをログで証明する。
            2. 検証結果の証拠（ログ等）を提示し、ユーザーに動作確認を依頼する。
            3. ユーザーの承認を得るまで、**Step 3-3-E5 の実装は絶対に行わない。** (Approved)

        - [x] **Step 3-3-E5: ユーザー送信メッセージの可視化 (User UI)**
            - **目的**: ユーザーが質問を送信した際、即座に自分の発言をチャット欄に表示する。
            - [x] **[実装]**:
                - `GameUI.js`: 送信ボタン押下イベント時に `appendUserMessage` を呼び出し、入力欄を空にする。
                - `GameUI.js`: 最新メッセージへの自動スクロール (`_scrollToBottom`) の実行。
            - [x] **[検証]**:
                - サイドバーの入力欄にテキストを入れ送信ボタンを押す。
                - **期待結果**: 自分の発言が右側の青い吹き出しとして即座に出現し、入力欄が空になること。
            - [x] **Step 3-3-E5 Verification Gate**: 
                1. ユーザーメッセージの即時表示とクリア動作をキャプチャで証明する。
                2. ユーザーの承認を得るまで、**Step 3-3-E6 には進まない。** (Approved)

        - [x] **Step 3-3-E6: ラウンドトリップの最終統合 (E2E Flow)**
            - **目的**: 送信・表示・回答回収の全工程を繋ぎ、入力ロック等の制御を行う。
            - [x] **[実装]**:
                - `GameUI.js`: 送信から回答が戻るまでの間、入力欄とボタンを非活性化（Lock）する。
                - `api_viewer.js` 経由の通信フローの最終確認。
            - [x] **[検証]**:
                - 1. 質問送信 ➔ 2. 自分の吹き出し表示 ➔ 3. Gemini手動送信 ➔ 4. AIの回答追記。
                - この一連の「対話」が崩れずに行われることを確認。
            - [x] **Step 3-3-E6 Verification Gate**: 
                1. 実際の対話フローが完成していることを動画または連続キャプチャで証明する。
                2. ユーザーの承認を得るまで、**Step 3-3-F への移行は行わない。** (Approved)

    - [x] **Step 3-3-F: エラー復帰と堅牢化 (Robustness & Recovery)**
        - **目的**: 異常系（通信途絶、生成フリーズ）やユーザーによる中断を処理し、UIがロックされたままになるのを防ぐ。

        - [x] **Step 3-3-F1-a: サイドバーUIの状態切替 (Local UI State)**
            - **内容**: `GameUI.js` の改修。送信/停止ボタンの見た目切替と、ローカルでのロック解除を実装。
            - [x] **[実装]**:
                - `GameUI.js`: `setWaitingState(true)` でボタンを「■」に変更。
                - `GameUI.js`: 「■」押下時に自身を `setWaitingState(false)` にし、入力を再活性化。
            - [x] **[検証]**: 送信後に手動で停止ボタンを押し、サイドバーが即座に復帰することを確認。
            - [x] **Step 3-3-F1-a Verification Gate**: 承認を得るまで次に進まない。 (Approved)

        - [x] **Step 3-3-F1-b: 停止命令の通信経路 (Command Protocol)**
            - **内容**: `background.js` を介して、サイドバーからGeminiタブへ「停止命令」を届ける。
            - [x] **[実装]**:
                - `GameUI.js`: `chrome.runtime.sendMessage({ action: 'GG_STOP_GENERATION' })` を発行。
                - `background.js`: メッセージを受け取り、Geminiタブ (`gemini.google.com`) を特定して転送。
                - `gemini.js`: メッセージを受け取り、コンソールに「受信確認」ログを出す。
            - [x] **[検証]**: サイドバーで停止ボタンを押し、Geminiタブのコンソールにログが出ることを確認。
            - [x] **Step 3-3-F1-b Verification Gate**: 承認を得るまで次に進まない。 (Approved)

        - [x] **Step 3-3-F1-c: Gemini側の後片付け (Gemini Cleanup)**
            - **内容**: `gemini.js` での完全なプロセス停止。
            - [x] **[実装]**:
                - `gemini.js`: Gemini UIの「停止ボタン」要素を検索して `click()`。
                - `gemini.js`: `MutationObserver` を `disconnect()`。
                - `gemini.js`: `setTimeout` などのポーリングがあればクリア。
            - [x] **[検証]**: 生成中に停止ボタンを押し、Geminiの生成が止まり、監視ログも停止することを確認。
            - [x] **Step 3-3-F1-c Verification Gate**: 承認を得るまで次に進まない。 (Approved / Imperfect but functional)

        - [x] **Step 3-3-F1-d: 注入プロセスの緊急停止 (Pre-generation Abort)**
            - **内容**: 生成開始前（画像アップロードやテキスト入力中）でも停止命令が効くようにする。
            - [x] **[実装]**:
                - `gemini.js`: `executeInjection` ループ内に `isStopRequested` フラグのチェックポイントを追加。
                - `gemini.js`: フラグが立っていた場合、注入処理を即座に中断(return)する。
            - [x] **[検証]**: 画像貼付け中に停止ボタンを押し、処理が中断されることを確認。

        - [x] **Step 3-3-F2: タブ消失の検知と自動復帰 (Tab Life-cycle)**
            - **内容**: Geminiタブが閉じられた際、サイドバーのロックを解除し、かつゾンビ実行を防ぐためにデータを掃除する。
            - **[実装]**:
                - `background.js`: `chrome.tabs.onRemoved` でGeminiタブの消失を検知。
                - `background.js`: 消失したタブIDが Geminiタブの場合、以下を実行：
                    1. Mapタブへ `GG_UNLOCK_SIDEBAR` を送信（UI復帰）。
                    2. `chrome.storage.local.remove('finalData')` を実行（**重要: ゾンビ化防止**）。
                - `GameUI.js`: 通知受け取り時にロック解除とエラー表示。
            - [x] **[検証]**: 生成待ち中にGeminiタブを閉じ、サイドバーが復帰すること。直後にGeminiを開いても勝手に生成が始まらないこと。
            - [x] **Step 3-3-F2 Verification Gate**: 承認を得るまで完了宣言は行わない。

    - [x] **Step 3-3 Gate**: Final Verification
        1. Step 3-3-F までの全工程の完了を確認。
        2. ユーザーの承認を得るまで、**完了宣言は行わない。**

---

## 3. 実装フェーズ (続き)

### Phase 4: Code Refactoring (Separated)
**※リファクタリング計画は `DOCS/PLAN_REFACTORING/PLAN.md` へ分離しました。**

---

## 4. 残課題・検討事項
- **GeminiのUI変更リスク**: 正規表現やDOM構造への依存は残るため、Gemini側の仕様変更には引き続き追従が必要です。
- **Firefox対応**: 現状Chrome専用APIを使用している箇所の洗い出し（今回は対象外）。

