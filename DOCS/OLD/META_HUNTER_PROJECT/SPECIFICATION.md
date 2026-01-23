# プロジェクト仕様書: GGAdviser "Meta Hunter Mode"

## 1. プロジェクト概要

GeoGuessr学習支援ツール「GGAdviser」の新規拡張機能。「AIの回答（解説）を読む」という受動的な学習スタイルから、逆に「画像上のヒント（メタ）を能動的に探す」という**探索・ゲーム型学習**へと体験を進化させる。

## 2. コア・コンセプト

*   **Meta Hunter**: ユーザーは画像上に隠された「決定打（Meta Information）」を探すハンターとなる。
*   **Image-First**: 解説を読んで画像を見るのではなく、画像を見て違和感を感じた場所をクリックし、解説を引き出す。
*   **Discovery & Collection**: 4枚の画像に散らばるヒントを全て見つけ出し、リストをコンプリートすることを目指す。

## 3. UI/UX 仕様

### 3.1. 画面レイアウト (Split View)
画面を左右に分割して使用する（現状のサイドパネル構成を維持）。

*   **左パネル (Control & List)**
    *   **ヘッダー**: 「基本情報カード」（国名、植生、気候などの全体ヒント）。
    *   **リスト**: 「未発見のヒント (???)」が一覧表示される。
        *   初期状態: `[???] ヒントのタイトル (★★★)` のように伏せ字。
        *   発見後: タイトルと詳細解説が表示される。
*   **右パネル (Image Grid)**
    *   **コックピットビュー**: 4枚の画像を切り替えて表示。
    *   **ヒントバッジ**: 画像切り替えサムネイルに「🔴 3」のようなヒント数バッジを表示。
    *   **グリッドハイライト**:
        *   ヒントが存在するグリッドは、うっすらと発光・点滅（Ghost Mode的な表現）。
        *   クリックすると「発見！」エフェクトと共に、左パネルの該当項目がアンロックされ、解説ポップアップが表示される。

### 3.2. ユーザーフロー (Unified Flow)
1.  **解析開始**: ユーザーは通常通り **[ANALYZE]** ボタンを押す。
2.  **データ生成**: AIは「詳細解説テキスト」と「探索用JSONデータ」の両方を生成する。
3.  **モード選択**: 解析完了後、**[解説ビュー]**（従来のテキスト）と **[ハンターモード]**（新規ゲームUI）をタブで切り替え可能にする。
    *   ユーザーは「まずは自力で探したい」ならハンターモードを、「すぐ答えを知りたい」なら解説ビューを選ぶ。

## 4. データ仕様

### 4.1. AI出力フォーマット (JSON)
AIの回答末尾に以下のようなJSONを含める。

```json
{
  "global_clues": {
    "country": "France",
    "driving_side": "right",
    "climate": "Tempura" // Mistyped by AI likely, but schema concept
  },
  "local_clues": [
    {
      "image_index": 1,
      "coordinates": ["A-2", "A-3"],
      "title": "梯子型電柱",
      "description": "フランス特有のコンクリート製はしご型電柱です。",
      "importance": 3
    }
  ]
}
```

### 4.2. データ永続化
*   **Version 1.0**: **リロードでリセット**（セッション内でのみ有効）。
    *   将来的な拡張として `chrome.storage.local` への保存を検討。

## 5. 技術スタック
*   **Parsing**: Markdown + JSON Block extraction.
*   **Frontend**: Vanilla JS (Existing `SplitViewManager` extension).
*   **State Management**: Simple in-memory state for current session logic.

---

## 6. 開発フェーズ
詳細は `PLAN_IMPLEMENTATION.md` 参照。
1.  **Prompt Engineering**: JSON出力プロンプトの実装と検証。
2.  **Data Logic**: レスポンス解析とデータ構造化の実装。
3.  **UI Implementation**: ハンターモードUI（リスト、グリッド）の実装。
