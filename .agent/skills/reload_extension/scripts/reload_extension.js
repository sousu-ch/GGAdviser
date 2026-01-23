/**
 * 拡張機能を確実にリロードするための汎用スクリプト
 * 
 * @param {string} targetName - リロード対象の拡張機能名（部分一致）
 * @param {boolean} reloadAllUnpacked - デベロッパーモードの全拡張機能をリロードするか
 */
(async (targetName = "", reloadAllUnpacked = true) => {
  try {
    const manager = document.querySelector('extensions-manager');
    if (!manager) return "ERROR: extensions-manager not found. Are you on chrome://extensions/?";
    
    const itemList = manager.shadowRoot ? manager.shadowRoot.querySelector('extensions-item-list') : null;
    if (!itemList) return "ERROR: extensions-item-list not found";

    const items = itemList.shadowRoot ? itemList.shadowRoot.querySelectorAll('extensions-item') : [];
    let reloadedCount = 0;
    const reloadedNames = [];
    
    for (const item of items) {
      const name = item.shadowRoot.querySelector('#name').innerText;
      const isUnpacked = !!item.shadowRoot.querySelector('#source-indicator'); // 'source-indicator' exists for unpacked extensions

      const matchByName = targetName && name.toLowerCase().includes(targetName.toLowerCase());
      const shouldReload = matchByName || (reloadAllUnpacked && isUnpacked);

      if (shouldReload) {
        const reloadBtn = item.shadowRoot.querySelector('#dev-reload-button');
        if (reloadBtn) {
           reloadBtn.click();
           reloadedCount++;
           reloadedNames.push(name);
        }
      }
    }

    if (reloadedCount > 0) {
      return `SUCCESS: Reloaded ${reloadedCount} extension(s): ${reloadedNames.join(', ')}`;
    }
    return "ERROR: No matching extensions found to reload.";
  } catch (e) {
    return "ERROR Exception: " + e.toString();
  }
})
