# プロジェクト引き継ぎ書: Meta Hunter Mode

## 1. 現状ステータス (Current Status)

**完了**: プロジェクトの基礎となる要件定義、仕様策定、および実装計画の作成。
**未着手**: 実装フェーズ（Phase 1: Prompt & Logic）の開始。

前回のセッションでは、以下の機能を完了させました：
*   ✅ プロンプトV2の実装 (Strict Evidence-based)
*   ✅ グリッド座標のオーバーレイ表示 (Ghost Mode Style)
*   ✅ 画像リンクのスタイル改善 (Subtle Blue)

## 2. 次のミッション (Next Mission)

**目標**: 新機能「Meta Hunter Mode」の実装を開始する。

### 参照すべて
すべての計画ドキュメントは **`d:\01ws\js\GGAdvice\DOCS\META_HUNTER_PROJECT\`** に格納されています。

1.  **`SPECIFICATION.md`**: 全体仕様書。
2.  **`PLAN_IMPLEMENTATION.md`**: 厳格な実装計画書（これに従って作業すること）。
3.  **`POC_DUAL_OUTPUT_PROMPT.md`**: プロンプト設計の概念実証。

## ## 3. 次のアクション (Immediate Action)

`PLAN_IMPLEMENTATION.md` の **Phase 0: Refactoring** から開始してください。

1.  **Step 0-1: GridOverlayManager.js の作成** に着手する。
    *   `SplitViewManager.js` からオーバーレイ関連コードを分離・移動する。
    *   これが完了してから Phase 1（プロンプト修正）に進むこと。

## 4. 開発ガイド・Tips (Useful Guides)

開発をスムーズに進めるためのドキュメントです。必ず参照してください。

*   **`DOCS/HOW_TO/HOW_TO_TEST.md`**: MCPエージェント用の自動検証スクリプト集。`evaluate_script` で実行可能なコードが記載されています。
*   **`DOCS/HOW_TO/EXTENSION_RELOAD_GUIDE.md`**: 拡張機能を正しくリロードするための手順書。
*   **`DOCS/HOW_TO/DEV_TIPS.md`**: 開発時の一般的なヒント。

## 5. 注意点 (Notes)
*   **ルール厳守**: 実装計画書の **Phase Gate** ルール（承認なしに進まない）を絶対に守ること。
*   **JSONパース**: AIの出力は不安定になる可能性があるため、パースエラー時のフォールバックを意識すること。

---
**Good Luck, Next Agent!**
Meta Hunter Modeの実装を楽しんでください。これは非常に革新的な学習機能になります。
