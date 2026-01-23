# Script Injection Tips

## Shadow DOM 対応
要素が見つからない場合は、Shadow Root を探索してください。

```javascript
const getEl = (sel) => document.querySelector(sel) 
     || document.querySelector('extensions-manager')?.shadowRoot?.querySelector(sel);
```

## データ注入
`CustomEvent` を使用するのが最もクリーンです。

```javascript
(() => {
    const mockData = { key: "value" };
    window.dispatchEvent(new CustomEvent('YOUR_EVENT_NAME', { detail: mockData }));
    return "SUCCESS: Dispatched event.";
})()
```

## 待機処理
`async/await` と `setTimeout` のラッパーを使用してください。

```javascript
const wait = (ms) => new Promise(r => setTimeout(r, ms));
```
