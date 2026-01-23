# [Gemini常駐リンク化機能 / Persistent Link Observer] 実装計画書

## 1. 目的とゴール
**解決する課題**: 
Geminiの回答生成中（ストリーミング）や、Reactによる画面再描画のタイミングで、一度生成された画像リンク（`[画像1: A-1]`）がプレーンテキストに戻ってしまったり、そもそも変換されなかったりする。

**ゴール**: 
GeminiのDOM更新を「安全に」監視し、テキスト生成完了（静止）を検知して確実にリンク化を行う「常駐型オブザーバー」を実装する。これにより、追加質問や再描画があっても常にリンクが維持される状態を目指す。

---

## 2. 実装フェーズ (Implementation Phases)

**進捗状況の更新**: 未着手=`[ ]`, 作業中=`[/]`, 完了=`[x]`

### Phase 1: 安全な監視ロジックの実装（Core Logic）
**目的**: Geminiの描画を邪魔せず、かつ確実に変化を捉える「空気を読む」監視ロジックを `ImageInjector.js` に実装する。

- [ ] **Step 1-1: 監視クラスの改修 (Safe Observer & Debounce)**
    - [ ] **[実装]**: 
        - `content_scripts/modules/ImageInjector.js` を修正。
        - 既存の `waitForResponseAndInject` (Polling) を廃止。
        - `startObserver()` を実装: `MutationObserver` で `document.body` を監視。
        - **Debounce処理**: 変化検知後、500ms～1000ms の静止を待つロジックを追加。
        - **Stopボタン検知**: `aria-label="Stop"` 等のボタンが表示されている間は「生成中」とみなし、処理をスキップするガード条件を追加。
    - [ ] **[検証]**: 
        - Geminiで長文を生成させる。
        - コンソールログに `[GGAdviser] Generating... (Stop button active)` 等が表示され、処理が待機されることを確認。
        - 生成完了後、`[GGAdviser] Prediction Stable. Scanning...` が表示されることを確認。

🛑 **Phase 1 Verification Gate**: 
1. `ImageInjector.js` 単体でのロジック動作（ログ出力）を確認する。
2. **検証結果の証拠（ログのスクショまたはコピペ）を提示し**、ユーザーに動作確認を依頼する。
3. ユーザーの承認を得るまで、**Phase 2 の統合実装は絶対に行わない。**

### Phase 2: Gemini上での統合と動作確認 (Integration)
**目的**: 作成した監視ロジックを `gemini.js` から呼び出し、実際のチャット画面でリンク化機能が持続することを確認する。

- [ ] **Step 2-1: 注入フローの変更**
    - [ ] **[実装]**: 
        - `content_scripts/gemini.js` を修正。
        - ファイル上部で `globalInjector` インスタンスを作成（Singleton化）。
        - `executeInjection` 関数内で、旧メソッドではなく `globalInjector.enablePersistence(images)` を呼び出すように変更。
    - [ ] **[検証]**: 
        - **初回回答**: 最初の分析結果でリンクが生成されること。
        - **追加質問**: "What is A-1?" 等と聞き、返答内のテキストもリンク化されること。
        - **再描画**: ブラウザをリサイズしたり、別のタブに行って戻ったりしてもリンクが維持されること。

🛑 **Phase 2 Verification Gate**: 
1. 実際のGemini上で一連の動作（初回、追加質問、維持）を確認する。
2. **検証結果の証拠（動作の動画またはスクショ）を提示し**、ユーザーに完了報告を行う。

---

## 3. 残課題・検討事項
- **GeminiのDOM構造変更リスク**: クラス名やaria-label (`Stop`など) がGoogleによって変更された場合、検知ロジックが動かなくなる可能性がある（保守運用での対応が必要）。
