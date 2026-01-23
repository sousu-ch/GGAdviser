# Phase 4-6: コンプライアンス対応・バグ修正・プライバシー強化 実装計画書

## 1. 目的とゴール
Chromeウェブストアの審査基準に準拠するため、不要な権限と設定を削除し、不必要なログ保存を停止する。また、ユーザーから報告されたクリップボード干渉バグおよび設定URLの自動上書きバグを修正し、品質を高める。

---

## 2. 実装フェーズ (Implementation Phases)

**進捗状況の更新**: 未着手=`[ ]`, 作業中=`[/]`, 完了=`[x]`

### Phase 1: マニフェストとプライバシー対応
**目的**: 権限削除、設定適正化、およびログ保存の停止を行い、審査リスクとプライバシー懸念を解消する。

- [x] **Step 1-1: 不要権限と設定の削除**
    - [x] **[実装]**: 
        - `manifest.json` の `permissions` から `clipboardWrite` と `scripting` を削除。
        - `content_scripts` (gemini.google.com) の `all_frames: true` を削除。
    - [x] **[検証]**: 
        - 拡張機能をリロードし、エラーや警告が出ないことを確認する。
        - `chrome://extensions` で権限一覧を確認し、削除された権限が含まれていないことを確認する。
        
- [x] **Step 1-1 Verification Gate**: 
1. Step 1-1の実装・検証を完了させる。
2. **検証結果の証拠（マニフェスト内容等）を提示し**、ユーザーに動作確認を依頼する。
3. ユーザーの承認を得るまで、**Step 1-2 の実装は絶対に行わない。**

- [x] **Step 1-2: ログ保存の無効化**
    - [x] **[実装]**: 
        - `background.js` 内の `atomicLog` 関数にある `chrome.storage.local.set` 行をコメントアウトする。
    - [x] **[検証]**: 
        - アプリを操作し、DevTools > Application > Storage でログが保存されないことを確認する。
        
- [x] **Step 1-2 Verification Gate**: 
1. Step 1-2の実装・検証を完了させる。
2. **検証結果の証拠を提示し**、ユーザーに動作確認を依頼する。
3. ユーザーの承認を得るまで、**Phase 2 の実装は絶対に行わない。**


### Phase 2: バグ修正 (クリップボード & URL設定)
**目的**: クリップボード干渉と設定URLの勝手な上書きを防ぐ。

- [x] **Step 2-1: クリップボード保護 (Main World Patch)**
    - [x] **[実装]**:
        - `d:\01ws\js\GGAdvice\content_scripts\map_extractor.js` (Main World) にクリップボード保護ロジックを追加する。
        - `navigator.clipboard.writeText` をモンキーパッチ（上書き）し、呼び出し時に `window.getSelection()` をチェックする。
        - 選択範囲の親要素を遡り、拡張機能のパネル ID (`gg-gemini-panel` 等) が含まれていれば、アプリ側からのURL書き込み命令を**無視（Promise.resolve()）**する。
        - これにより、アプリが `keydown` イベントで強制的にURLをコピーしようとしても、拡張機能内でのテキスト選択コピー（ブラウザネイティブの動作）が優先され、上書きされなくなる。
    - [x] **[検証]**:
        - 拡張機能パネル内のチャットログなどを選択し、`Ctrl+C` を実行する。
        - ペーストして、テキストだけが貼り付けられること（マップURLが混入しないこと）を確認する。
        - 逆に、アプリ（マップ上の道路など）をクリックして `Ctrl+C` した場合は、通常通りマップURLがコピーされることを確認する。

- [x] **Step 2-1 Verification Gate**: 
1. Step 2-1の実装・検証を完了させる。
2. **検証結果の証拠（コピー時のクリップボード内容）を提示し**、ユーザーに動作確認を依頼する。
3. ユーザーの承認を得るまで、**Step 2-2 の検証（再確認）には進まない。**

- [x] **Step 2-2: URL設定の保護 (自動上書きの無効化)**
    - [x] **[実装]**:
        - `background.js` の `startSequentialCapture` および `handleGeoGuessrAnalyze` を修正。
        - マップ設定 (`gg_map_base_url`) が空の場合、自動保存せずエラー（`RESTORE_UI_ERROR` / `sendToast`）を出して停止するように変更。
        - マップ設定が存在する場合は、その設定を厳守し、勝手に上書きしない（Strict Targeting）。
        - `geoguessr.js` に `SHOW_TOAST` リスナーを追加し、GeoGuessr上でもエラー通知が出るように修正。
        - `api_viewer.js` の `RESTORE_UI_ERROR` ハンドラを修正し、具体的なエラー内容を表示してUIロックを解除するように改善。
    - [x] **[検証]**:
        - 設定空でGeoGuessrから実行 -> エラートースト表示。
        - 設定空でMapアプリから実行 -> エラートースト表示＆UIロック解除。
        - 設定有りで実行 -> 設定されたURLが維持されることを確認。「空」にする。
        - GeoGuessrから解析を実行する。
        - エラー「マップ設定が必要です」が表示されることを確認する（勝手にURLが保存されないこと）。
        
- [ ] **Step 2-2 Verification Gate**: 
1. Step 2-2の実装・検証を完了させる。
2. **検証結果の証拠を提示し**、ユーザーに動作確認を依頼する。
3. すべての工程の完了とする。

### Phase 3: Code Cleanup (ログ出力削減)
**目的**: 本番公開に向け、不要なデバッグログ出力を削減・停止し、プライバシー保護とパフォーマンス向上を図る。

- [x] **Step 3-1: ログ出力の抑制**
    - [x] **[実装]**:
        - `d:\01ws\js\GGAdvice\background.js` の `atomicLog`, `tabLog` 関数を修正し、`console.log` 出力を削除、または `DEBUG` 定数による条件分岐を追加する。
        - `d:\01ws\js\GGAdvice\content_scripts\api_viewer.js` の `_log`, `_warn` 関数を修正し、`console.log` を実行しない空関数にする（または開発モード判定を入れる）。
        - `d:\01ws\js\GGAdvice\content_scripts\map_extractor.js` の `_log` 関数を空関数化し、Main World コンソールへの出力を停止する。
        - `d:\01ws\js\GGAdvice\content_scripts\geoguesser.js` 内の `console.log`, `console.warn` を検索し、不要なものを削除またはコメントアウトする。
        - `d:\01ws\js\GGAdvice\content_scripts\modules` 以下の UI モジュール群 (`GameUI.js`, `HeaderControlManager.js`, `MessageRenderer.js`, `GeminiService.js`, `SplitViewManager.js`, `ImageInjector.js`) 内の `console.log`, `console.warn` を削除またはコメントアウトする。
        - **補足**: `ImageInjector.js` は現在 `gemini.js` 内で機能呼び出しが無効化されているが、将来の利用に備えてログのみ抑制しておく。
    - [x] **[検証]**:
        - 拡張機能をリロードし、GeoGuessr および Map-making.app で通常操作（Scan等）を行う。
        - DevTools の Console タブを確認し、`[GGAdviser:BG]`, `[GGAdviser:App]`, `[GGAdviser:Main]` 等のプレフィックスが付いたログが出力されていないことを確認する。

- [x] **Step 3-1 Verification Gate**:
    1. Step 3-1の実装・検証を完了させる。
    2. **検証結果の証拠（Console画面のスクリーンショットまたはコピペ）を提示し**、ユーザーに動作確認を依頼する。
    3. ユーザーの承認を得るまで、**完了宣言は行わない。**

- [x] **Step 3-2: 不要ファイルの削除 (Legacy Code Removal)**
    - [x] **[実装]**:
        - `d:\01ws\js\GGAdvice\content_scripts\modules\ImageInjector.js` を削除する。
        - `d:\01ws\js\GGAdvice\manifest.json` から `ImageInjector.js` の記述を削除する。
        - `d:\01ws\js\GGAdvice\content_scripts\gemini.js` から `ImageInjector` 関連のコード（インスタンス化など）を削除する。
    - [x] **[検証]**:
        - 拡張機能をリロードし、エラー（特にクラス未定義エラー）が出ないことを確認する。
        - Gemini上での動作（画像添付、解析）に影響がないことを確認する。

- [x] **Step 3-3: 不要ファイルの削除 (Legacy Google Maps Script)**
    - [x] **[実装]**:
        - `d:\01ws\js\GGAdvice\content_scripts\googlemaps.js` を削除する。
        - （Clean View CSSの使用状況を確認し、不要なら削除する）
    - [x] **[検証]**:
        - ファイルが削除されたことを確認する。
        - 拡張機能の動作に影響がないことを確認する。

- [x] **Step 3-3 Verification Gate**:
    1. Step 3-3の実装・検証を完了させる。
    2. ユーザーに動作確認を依頼する。
    3. 承認を得て、Phase 3完了とする。

- [x] **Step 3-4: ログ出力の追加抑制 (InterceptorStrategy)**
    - [x] **[実装]**:
        - `d:\01ws\js\GGAdvice\content_scripts\strategies\InterceptorStrategy.js` 内の `console.log`, `console.warn` を削除またはコメントアウトする。
    - [x] **[検証]**:
        - Consoleログから当該メッセージが消えていることを確認する。

- [x] **Step 3-4 Verification Gate**:
    1. Step 3-4の実装・検証を完了させる。
    2. ユーザーに動作確認を依頼する。
    3. 承認を得て、Phase 3完了とする。

- [x] **Step 3-5: ログ出力の追加抑制 (background.js)**
    - [x] **[実装]**:
        - `d:\01ws\js\GGAdvice\background.js` 内の `DEBUG` 制御外にある `console.log`, `console.warn` を削除またはコメントアウトする（例: 初期化メッセージ、REUSEロジックのログなど）。
        - `DEBUG = false` が確実に機能しているか再確認する。
    - [x] **[検証]**:
        - 拡張機能管理画面の「ビューを検証: Service Worker」からConsoleを開き、起動時のログが出力されていないことを確認する。

- [x] **Step 3-5 Verification Gate**:
    1. Step 3-5の実装・検証を完了させる。
    2. ユーザーに動作確認を依頼する。
    3. 承認を得て、Phase 3完了とする。

- [x] **Step 3-6: ログ関連コードの完全削除 (Final Logs Cleanup)**
    - [x] **[実装]**:
        - `_log`, `_debug` などのラッパー関数定義と、その呼び出し箇所を全ファイルから**削除**する。
        - Step 3-1, 3-4, 3-5 でコメントアウトした `// console.log(...)` を検索し、行ごと**削除**する。
    - [x] **[検証]**:
        - 拡張機能をリロードし、動作に支障がないこと（削除による構文エラーがないこと）を確認する。

- [x] **Step 3-6 Verification Gate**:
    1. Step 3-6の実装・検証を完了させる。
    2. ユーザーに動作確認を依頼する。
    3. 承認を得て、Phase 3完了とする。

- [x] **Step 3-7: Final Code Audit**
    - [x] **[実装]**:
        - `GameUI.js` の `_getDirLabel` メソッド重複を削除。
        - `clean_view.css` の使用状況を再確認し、削除を撤回（`background.js` で動的注入されていたため）。
        - `gg_interceptor.js` の動的注入を確認。
