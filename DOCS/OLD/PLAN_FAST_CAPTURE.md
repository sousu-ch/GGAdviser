# 高速インプレース・キャプチャ実装計画書 (Fast In-Place Capture) - 最終技術仕様版

## 1. 目的と概要
`map-making.app` のパノラマ・インスタンスを直接操作し、別タブ作成のオーバーヘッドを無くします。
「ゴーストモード」とは、撮影の瞬間だけ**既存のパノラマを最前面・全画面に強制拡大し、それ以外の一切のUI（サイドバー、メニュー、拡張機能のボタン類）を消去する**状態を指します。

---

## 2. ゴーストモード（UI最大化と消去）の定義
「透過モード」「ゴーストモード」が具体的に何を行うのか、詳細な実装仕様を定義します。

### A. パノラマの「最前面・全画面化」仕様
- **対象**: `capturedPano` がマウントされているコンテナ（通常 `.gm-style` またはその親）。
- **手法**: `SplitViewManager` から `html` 要素に `.gg-capture-active` クラスを付与。
- **CSS制御**:
  ```css
  /* ゴーストモード発動時 */
  .gg-capture-active {
    overflow: hidden !important; /* スクロール禁止 */
  }

  /* パノラマコンテナを強制的に最前面の全画面(100vw/100vh)に固定 */
  /* map-making.app の構造に合わせてセレクタを特定 */
  .gg-capture-active .gm-style, 
  .gg-capture-active [class*="panorama"], 
  .gg-capture-active #ggadvice-clean-viewer {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important; /* z-indexを最大化 */
      visibility: visible !important;
  }
  ```

### B. それ以外の「UI完全排除」仕様
- **手法**: `visibility: hidden` または `display: none`。
- **CSS制御**:
  ```css
  .gg-capture-active body > *:not(.gg-exception-list) {
      visibility: hidden !important;
  }
  /* パノラマとその子要素だけは見えるように保持（上記Aの visible で制御） */
  ```

---

## 3. 実装フェーズ（詳細ステップ）

### 工程 1: パノラマ制御基盤（Main World ⇔ Bridge） [x] (完了)
- **[map_extractor.js]**: `GG_SET_POV_FAST` 受信時、`capturedPano.setPov()` を実行。
- **[map_extractor.js]**: 実行後に `google.maps.event.trigger(capturedPano, 'resize')` を叩き、全画面化したコンテナに描画をフィットさせる。

### 工程 2: ゴーストモードの確実な実装（CSS & Container Identification）
「地図が大きくなってしまう」問題を解決するため、APIを使用してターゲットを確実に特定します。

- **[map_extractor.js]**:
  - 起動時または回転時に `capturedPano.getContainer()` を実行し、その要素に `id="gg-pano-target"` を付与。これで「地図」と「パノラマ」を確実に区別します。
- **[ui_components.css]**:
  - `#gg-pano-target` をセレクタの核にします。
  ```css
  .gg-capture-active #gg-pano-target {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      visibility: visible !important;
  }
  ```
- **[SplitViewManager.js]**:
  - `setCaptureActive(true)` 呼び出し。

---

### 工程 3: 同一タブ内キャプチャ制御（Background）
- **[background.js]**: `START_CAPTURE_INPLACE` 受信。
- **注意**: 以前のように別タブが開かないよう、送信元の `tabId` を固定してシーケンスを回します。
- **フロー**: 回転命令 -> 400ms待機（描画安定待ち） -> `captureVisibleTab` -> 次の回転。

### 工程 4: 復元ロジック（Recovery）
- **[SplitViewManager.js]**: 撮影終了後、またはエラー発生時に `.gg-capture-active` を削除し、UI（サイドバー等）を元の位置・状態で再表示。

---

## 4. タブ管理と安定性の定義
以前発生した「既存ウィンドウが消える」「新しいウィンドウが立ち上がる」といった問題を完全に排除するため、以下の動作を保証します。

- **新規タブ作成禁止**: キャプチャのために `chrome.tabs.create` を呼び出すことは一切ありません。
- **タブ削除禁止**: `chrome.tabs.remove` は一切呼び出しません。
- **同一URL維持**: `map-making.app` のドメインから離脱したり、ページをリロードしたりすることはありません。
  - 状態の切り替えは CSS クラスの付け替えと、URL ハッシュ（`#` 以降）の更新のみで行います。

---

## 5. 検証ゲート（合格基準）

| フェーズ | 合格基準 |
| :--- | :--- |
| **P1** | コンソールから命令を送り、パノラマの「向き」が即座に変わること。 |
| **P2** | `html` に `gg-capture-active` を付けた際、**サイドバーや拡張機能のパネルが一切見えなくなり、パノラマがモニター一杯に広がっている**こと。 |
| **P3** | Backgroundのログ上で、4回の方位切り替えと撮影がエラーなく完遂すること。 |
| **P4** | 撮影された画像が「完全にクリーンなストリートビュー」であり、かつ完了後に元の `map-making.app` のUIが正しく復元されていること。 |
