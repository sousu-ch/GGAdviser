# グリッドオーバーレイへの座標表示提案

ユーザー様のご要望を受け、グリッド（網目）上に「A-1」「C-3」などの座標ラベルをうっすらと表示する機能を追加案です。

## 実装イメージ

現在の透明なセルの中央に、以下のスタイルでテキストを配置します。

*   **テキスト内容**: `A-1`, `B-3` など
*   **フォントサイズ**: 大きめ (例: `2.5rem` 〜 `3rem`)
*   **色**: 白 (`rgba(255, 255, 255, 0.2)`) - 透明度高め
*   **配置**: 上下左右中央 (`flex` + `center`)
*   **挙動**: マウスイベント（クリック等）はこれまで通り透過

## コード変更点 (SplitViewManager.js)

`_renderGridLayer` メソッド内のループ処理を変更します。

```javascript
// Before (現状)
for (let i = 0; i < 25; i++) {
    const cell = document.createElement('div');
    // ...スタイル設定...
    
    // 右クリック時のみ計算していた
    cell.oncontextmenu = (e) => {
        const row = Math.floor(i / 5);
        // ...
    };
}

// After (変更案)
for (let i = 0; i < 25; i++) {
    const cell = document.createElement('div');
    
    // 1. 座標をループ内で先に計算
    const row = Math.floor(i / 5);
    const col = i % 5;
    const rowChar = String.fromCharCode('A'.charCodeAt(0) + row);
    const colNum = col + 1;
    const coordStr = `${rowChar}-${colNum}`;

    // 2. ラベル表示用スタイルを追加
    cell.innerText = coordStr;
    cell.style.display = 'flex';
    cell.style.alignItems = 'center';
    cell.style.justifyContent = 'center';
    cell.style.fontSize = '3rem';           // 大きく
    cell.style.fontWeight = 'bold';
    cell.style.color = 'rgba(255, 255, 255, 0.15)'; // 邪魔にならない薄さ
    cell.style.userSelect = 'none';         // テキスト選択防止
    cell.style.cursor = 'crosshair';        // ポインタを照準に

    // ... (右クリックイベントなどは coordStr を使って簡略化) ...
}
```

## 期待される効果

*   ユーザーは「ここが何番のグリッドか」を直感的に把握できるようになります。
*   AIの解説（「A-2の看板」など）と画像を照らし合わせるストレスが大幅に軽減されます。

この方針で実装を進めてよろしいでしょうか？
