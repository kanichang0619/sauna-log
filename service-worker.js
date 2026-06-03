/**
 * service-worker.js - PWA のキャッシュ管理
 *
 * 更新後に古いキャッシュが残り続けないよう、
 * 自作ファイルは「ネットワーク優先」で取得します。
 * Firestore や Firebase は絶対にキャッシュしません。
 *
 * ── デプロイ時の更新手順 ──────────────────────────────────
 * CACHE_VERSION の文字列を変えるだけで古いキャッシュが自動削除されます。
 * 例: "v1" → "v2"
 * ─────────────────────────────────────────────────────────
 */

const CACHE_VERSION = "v2";
const CACHE_NAME    = `sauna-log-${CACHE_VERSION}`;

// ============================================================
// キャッシュするファイル一覧（アプリシェル）
// ============================================================
const APP_SHELL = [
  "./",
  "./index.html",
  "./list.html",
  "./calendar.html",
  "./map.html",
  "./graph.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./js/storage.js",
  "./js/utils.js",
  "./js/list.js",
  "./js/calendar.js",
  "./js/graph.js",
  "./js/map.js",
  "./js/auth.js",
  "./js/firebase-config.js",
  "./js/cloud-storage.js",
];

// ============================================================
// URL の判定ヘルパー
// ============================================================

/**
 * Firebase・Firestore・Google認証のURLは絶対にキャッシュしない
 * キャッシュすると認証・同期が壊れる恐れがある
 */
function isFirebaseUrl(url) {
  return (
    url.includes("firebaseio.com")          ||
    url.includes("firestore.googleapis.com") ||
    url.includes("googleapis.com")           ||
    url.includes("gstatic.com/firebasejs")   ||
    url.includes("accounts.google.com")      ||
    url.includes("nominatim.openstreetmap.org")
  );
}

/**
 * Chart.js / Leaflet など、バージョンが固定された CDN リソースは
 * キャッシュ優先で取得する（外部から変更されないため安全）
 */
function isCdnResource(url) {
  return (
    url.includes("cdn.jsdelivr.net") ||
    url.includes("unpkg.com")
  );
}

// ============================================================
// インストール：アプリシェルをキャッシュに保存
// ============================================================
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()) // 古い SW を即座に置き換える
  );
});

// ============================================================
// アクティベート：古いバージョンのキャッシュを削除
// ============================================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME) // 現在のバージョン以外を削除
          .map((key) => {
            console.log(`[SW] 古いキャッシュを削除: ${key}`);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim()) // 全タブを即座に新 SW で制御する
  );
});

// ============================================================
// フェッチ：リクエストをインターセプトしてキャッシュ戦略を適用
// ============================================================
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // ---- ① Firebase / Firestore / 外部API → キャッシュしない（素通り）----
  if (isFirebaseUrl(url)) {
    return; // Service Worker を経由せず直接ネットワークへ
  }

  // ---- ② CDN リソース（Chart.js, Leaflet）→ キャッシュ優先 ----
  if (isCdnResource(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        // キャッシュになければネットワークから取得してキャッシュに保存
        return fetch(event.request).then((response) => {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
          });
          return response;
        });
      })
    );
    return;
  }

  // ---- ③ 自作ファイル（HTML/CSS/JS）→ ネットワーク優先 ----
  // 更新後に古いJSを読み続けないよう、常にネットワークを先に試みる
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // ネットワーク取得成功 → キャッシュを更新してレスポンスを返す
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, response.clone());
        });
        return response;
      })
      .catch(() => {
        // オフラインなどネットワーク失敗 → キャッシュから返す
        return caches.match(event.request);
      })
  );
});
