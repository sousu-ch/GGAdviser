# 画面モード統合とインタラクション改善計画書

## 1. 目的とゴール
- **Quizモードの廃止と統合**: "Quiz"の概念を廃止し、常に「全ヒント表示（Analyze）」の状態で統合する。
- **インタラクションの最適化**:
    - **シングルクリック**: オーバーレイ維持・ハイライト更新。
    - **ダブルクリック**: POV同期（視点移動）して閉じる。
    - **同じ画像をクリック**: 閉じる (Toggle)。
- **Chatモード/Analyzeモードのグリッド連携**: 各モードに応じた適切なハイライト連携を実現する。

---

## 2. 挙動定義 (Unified Behavior)

| アクション | 挙動概要 | 実装方針 |
| :--- | :--- | :--- |
| **新規画像を開く** | **画像を表示し該当部ハイライト** | 既存ロジック。 |
| **違う画像を開く** | **画像を変更し該当部ハイライト** | 既存ロジック。 |
| **画像ホバー** | **全ヒント表示 (Highlight 1)** | GameUIがイベントを受け取り、常にハイライト処理。<br>「マウスが外れた時」にハイライトを消去する挙動を追加する。 |
| **グリッド表示** | **保存状態に従う** | `chrome.storage` 参照。常にDOMは存在。 |
| **グリッドクリック** | **証拠特定 (Highlight 2)** | **Chat時**: チャット欄該当部のみ青背景強調 (Focus Blue)<br>**Analyze時**: リスト該当部のみ青背景強調 (Focus Blue) |
| **画像クリック** | **オーバーレイ維持 (No Action)** | `closeOverlay()` 呼び出しを削除。 |
| **画像Doubleクリック** | **POV同期 + 閉じる** | `ondblclick` イベントで実装。 |
| **マウスアウト (画像外へ)** | **ハイライト1の消去** | `GG_HIGHLIGHT_CLEAR_REQ` 等を介してハイライトを解除。 |

---

## 3. ハイライトデザイン案と技術的解決策 (Design & Solution)

### A. ハイライトの定義 (Highlight Definitions)
ホバー（広域）とクリック（特定）のハイライトを明確に区別し、視認性を向上させる。

| 状態 (State) | 対象 (Target) | 意味 (Meaning) | デザイン (Design) |
| :--- | :--- | :--- | :--- |
| **Highlight 1**<br>(Hover / Broad) | 画像ホバー時<br>全ヒント | 「関連する可能性のある範囲」 | **"Hint Amber" (薄いオレンジ)**<br>- 背景: `rgba(255, 165, 0, 0.15)` |
| **Highlight 2**<br>(Click / Specific) | グリッドクリック時<br>特定セル・項目 | 「特定・決定された証拠」 | **"Focus Blue" (鮮やかな青)**<br>- 背景: `#2196F3` (選択時のみ)<br>- 文字色: `#FFFFFF` (白) |

### B. Chat Mode (Gemini) でのハイライト実現 (Enhanced)
- **リンク形式の拡張**: `[テキスト[画像n: 座標]]` 形式をパースし、テキスト全体をクリッカブルなリンクにする。
- **双方向連携**: 
    - **Grid -> Gemini**: セル選択でチャット内の対応箇所が光る。
    - **Gemini -> Grid**: 文章内のリンクにホバー/クリックで、画像上のグリッドが光る。
- **技術背景**: `api_viewer.js` が仲介し、`chrome.runtime.sendMessage` で iframe 内の `gemini.js` と通信する。
- **ステート管理**: 各アクションの冒頭で既存ハイライトを全消去し、重複を防止。

---

**Status**: DONE (Complete)

## 4. 実装フェーズ (Implementation Phases)

**進捗状況の更新**: 未着手=`[ ]`, 作業中=`[/]`, 完了=`[x]`

### Phase 1: UIクリーンアップ (Visual Only)
**目的**: 廃止対象の「IMAGEボタン」「QUIZボタン」を画面から削除する（ロジックは触らない）。

- [x] **Step 1-1: 不要ボタンの削除**
    - [x] **[実装]**: 
        - `GameUI.js`: `renderTable` 内のボタン生成コード（viewEvidenceBtn, quizToggleBtn）を削除 / コメントアウト。
    - [x] **[検証]**: 
        - サイドバーから該当ボタンが消えていることを確認。
        - エラーが出ないことを確認。

- [x] **Step 1-1 Verification Gate**: 
1. 承認を得る。


### Phase 2: ロジック統合 (Logic Integration)
**目的**: Quizフラグを廃止し、常に「ヒント表示（Analyze）」モードとして動作させる。

- [x] **Step 2-1: Quizフラグの削除とホバー統一**
    - [x] **[実装]**: 
        - `GameUI.js`: `quizEnabled` フラグ定義を削除。
        - `GameUI.js`: `GG_GRID_HOVER_ENTER` 内のガード削除。
        - `GridOverlayManager.js`: `imgWrapper.onmouseleave` で `GG_HIGHLIGHT_CLEAR_REQ` (または新規Event) を飛ばす処理を追加。
    - [x] **[検証]**: 
        - 画像ホバー時、常にサイドバーのリストがハイライトされることを確認。
        - （旧Quizモードのような）「隠す」挙動がなくなったことを確認。

- [x] **Step 2-1 Verification Gate**: 
1. 承認を得る。


### Phase 3: Toggle機能の復元
**目的**: 画像リンクの開閉挙動を直感的にする。

- [x] **Step 3-1: Toggle機能の実装**

    - [x] **[実装]**: 
        - `GridOverlayManager.js`: `showOverlay` 呼び出し時、現在表示中の画像と同じID/Indexなら `closeOverlay()` して終了するロジックを追加。
    - [x] **[検証]**: 
        - 画像リンククリック -> 開く。
        - 同じリンククリック -> 閉じる。
        - 違うリンククリック -> 切り替わる。

- [x] **Step 3-1 Verification Gate**: 
1. Step 3-1の実装・検証を完了させる。
2. **検証結果の証拠を提示し**、ユーザーに動作確認を依頼する。
3. 次ステップへ進む前に承認を得る。


### Phase 4: POV同期の分離 (Single vs Double Click)
**目的**: 「見る」と「飛ぶ」の操作を明確に分ける。

- [x] **Step 4-1: シングルクリックの維持とダブルクリック移動**
    - [x] **[実装]**: 
        - `GridOverlayManager.js`: `img.onclick` から `closeOverlay` と `GG_SYNC_POV` 発火処理を削除（または `stopPropagation` のみ維持）。
        - `GridOverlayManager.js`: `img.ondblclick` を追加し、`GG_SYNC_POV` 発火 + `closeOverlay` を実装。
    - [x] **[検証]**: 
        - 画像クリック -> 閉じない、POV変わらない。
        - 画像ダブルクリック -> POV移動して閉じる。

- [x] **Step 4-1 Verification Gate**: 
1. 承認を得る。

- [x] **Step 4-2: Jumpボタンの新設**
    - [x] **[実装]**: 
        - `GridOverlayManager.js`: オーバーレイ上部右側に「JUMP」ボタンを追加。
        - クリック時イベント: `GG_SYNC_POV` + `closeOverlay`。
    - [x] **[検証]**: 
        - ボタンクリックで正しく移動して閉じることを確認。

- [x] **Step 4-2 Verification Gate**: 
1. 承認を得る。


### Phase 5: グリッドインタラクション (Enhanced Sync)
**目的**: 回答文章そのものをリンク化し、双方向の強力な連携を実現する。

- [x] **Step 5-1: プロンプト更新とリンクパースの強化 (Nested Link & Styled)**
    - [x] **[実装]**: 
        - `constants.js`: デフォルトプロンプトを `[テキスト[画像n: 座標]]` 形式に更新。座標を必須化した。
        - `gemini.js`: 二重括弧をパースし、属性付き `<a>` タグを生成。
        - **スタイリング**: 通常時は「薄い青の点線下線」、ホバー時は「アンバー背景」と「強調された下線」を Iframe 内に動的注入。
    - [x] **[検証]**: 
        - Geminiが新形式で回答し、文章全体が正しくリンク化され、洗練されたデザインで表示されることを確認。
- [ ] **Step 5-1 Verification Gate**: 
1. プロンプト更新後、Geminiが `[テキスト[画像n: 座標]]` 形式で回答することを確認。
2. `gemini.js` によってその文章全体がリンク化され、`data-coord` 等の属性が付与されていることをDOMで確認。
3. 承認を得る。


- [ ] **Step 5-2: 双方向メッセージング基盤 (Bi-directional Messaging)**
    - [ ] **[実装]**: 
        - `api_viewer.js`: Page(アプリ) -> Iframe(Gemini) への転送。
        - `api_viewer.js`: Iframe(Gemini) -> Page(アプリ) への転送。
    - [ ] **[検証]**: 
        - コンソールで、クリック/ホバー信号が Iframe の壁を越えて往復しているか確認。

- [ ] **Step 5-2 Verification Gate**: 
1. Iframe内のクリック/ホバーが親画面に届き、親画面の操作がIframeに届くことをログで確認。
2. 承認を得る。


- [ ] **Step 5-3: 同期ロジックとリセットの統合 (Sync & State)**
    - [ ] **[実装]**: 
        - **リセット管理**: 描画前に既存ハイライトを全消去。
        - **ホバー優先ロジック**: 画像ホバー時にチャット側の青ハイライトを消去。
        - **双方向同期**: Grid Click -> Chat Blue, Chat Link Hover -> Grid Amber。
    - [ ] **[検証]**: 
        - グリッドクリックで文章が青く光る。
        - 文章ホバーでグリッドがオレンジに光る。
        - ホバー時に古い青が消える。

- [ ] **Step 5-3 Verification Gate**: 
1. 最終的な双方向ハイライトの動作を確認。
2. 承認を得る。


### Phase 6: Layout Robustness (Skipped)
- **Status**: Skipped (Unnecessary)
- **Goal**: Prevent grid misalignment on resize.
- [x] Task: Implement RAF loop. (Cancelled)
- [ ] **Step 6-1: RAFとOffsetLeftによる座標補正**
    - [ ] **[実装]**: 
        - `GridOverlayManager.js`: `_renderGridLayer` の座標計算に `requestAnimationFrame` を導入し、描画完了後の `offsetLeft/Top` を確実に取得する。
    - [ ] **[検証]**: 
        - ウィンドウリサイズ、サイドバー開閉を行ってもグリッドが画像にピッタリ張り付いていることを確認。

- [ ] **Step 6-1 Verification Gate**: 
1. 最終承認を得る。
