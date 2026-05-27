(function () {
  const DEBUG = false;
  const XHR = XMLHttpRequest.prototype;
  const open = XHR.open;
  const send = XHR.send;
  const originalFetch = window.fetch;

  // 1. Fetch を傍受 (Next.js で使用されている可能性が高い)
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const url = response.url;
      // ターゲットAPI: /api/v3/games/ または /api/v4/games/
      if (url && url.includes("/api/v3/games/") && !url.includes("summary")) {
        const clone = response.clone();
        clone
          .json()
          .then((data) => {

            window.postMessage({ type: "GG_GAME_DATA_FETCH", data: data }, window.location.origin);
          })
          .catch((e) => {}); // json エラーを無視
      }
    } catch (e) {
      if (DEBUG) console.warn("GGAdviser Interceptor Error:", e);
    }

    return response;
  };

  // 2. アクティブ Fetch リスナー (オンデマンドの最新データ用)
  window.addEventListener("GG_FETCH_REQUEST", async (event) => {
    const gameId = event.detail.gameId;
    if (!gameId) return;


    try {
      // まずゲームサーバー API を試す (Duels で機能することが証明済み)
      const url = `https://game-server.geoguessr.com/api/duels/${gameId}`;
      const res = await originalFetch(url, { credentials: "include" });

      if (res.ok) {
        const data = await res.json();

        window.postMessage({ type: "GG_GAME_DATA_FETCH", data: data }, window.location.origin);
      } else {
        if (DEBUG) console.warn("GGAdviser Interceptor: Active Fetch Failed", res.status);
      }
    } catch (e) {
      if (DEBUG) console.error("GGAdviser Interceptor: Active Fetch Error", e);
    }
  });


})();
