/**
 * 検証用トリガースクリプト (Trigger Only)
 * 
 * 1. 検索窓に座標URLを入力
 * 2. Analyzeボタンを1回だけクリックして即終了する
 * 
 * 注意: 完了の監視はAIエージェント側で CDP (Chrome DevTools) を介して行います。
 */
(async () => {
    try {
        console.log("[SETUP] Triggering analysis...");

        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        
        // --- Step 1: Set Location ---
        const input = document.querySelector('.search-control__input');
        if (!input) throw new Error("Search input not found");
        
        input.focus();
        input.select();
        document.execCommand('insertText', false, "https://www.google.com/maps/@22.349247,-97.880156,3a,112.6y,53.90h,94.35t/data=!3m5!1e1!3m3!1s_reNnho0KLE-dEGoIucrIw!2e0!6shttps%3A%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fw%3D900%26h%3D600%26panoid%3D_reNnho0KLE-dEGoIucrIw%26cb_client%3Dmaps_sv.share%26yaw%3D53.8959519306689%26pitch%3D-4.346574133244587%26thumbfov%3D113?coh=235716&entry=tts");
        await wait(500);

        // --- Step 2: Clear Old Clues (To avoid false positives in monitoring) ---
        const panel = document.getElementById('gg-meta-panel');
        if (panel) {
            console.log("[SETUP] Clearing old clues...");
            panel.innerHTML = '';
        }

        // --- Step 3: Trigger Analyze ---
        const sidebarBtn = document.getElementById('gg-manual-analyze-btn');
        if (sidebarBtn) {
            sidebarBtn.click();
            return "TRIGGERED: Sidebar analysis started.";
        } else {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const btn = btns.find(b => b.innerText.includes('ANALYZE'));
            if (!btn) throw new Error("Analyze button not found");
            btn.click();
            return "TRIGGERED: Generic analysis started.";
        }

    } catch (e) {
        console.error("[SETUP] Trigger Error:", e);
        return "ERROR: " + e.message;
    }
})()
