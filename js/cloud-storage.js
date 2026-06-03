/**
 * cloud-storage.js - Firestore へのデータ読み書き
 *
 * ログイン中はデータを Firestore（クラウド）にも保存します。
 * ページ読み込み時にFirestoreとlocalStorageを同期して、
 * PCとスマホで同じデータが見られるようにします。
 *
 * このファイルは type="module" として読み込まれます。
 */
import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ============================================================
// 同期ステータス表示
// ============================================================

let syncStatusTimer = null;

/**
 * auth-bar の先頭にステータス表示要素を動的に挿入する（なければ作る）
 * @returns {HTMLElement|null}
 */
function getSyncStatusEl() {
  let el = document.getElementById("sync-status");
  if (el) return el;
  const authBar = document.querySelector(".auth-bar");
  if (!authBar) return null;
  el = document.createElement("span");
  el.id = "sync-status";
  el.className = "sync-status hidden";
  authBar.insertBefore(el, authBar.firstChild);
  return el;
}

/**
 * 同期ステータスを表示する
 * @param {string} text       - 表示するテキスト
 * @param {string} type       - "syncing" | "ok" | "migrated" | "error" | "offline"
 * @param {number} [autoHide] - ミリ秒後に自動で非表示（省略時は非表示しない）
 */
function showSyncStatus(text, type, autoHide) {
  const el = getSyncStatusEl();
  if (!el) return;

  if (syncStatusTimer) {
    clearTimeout(syncStatusTimer);
    syncStatusTimer = null;
  }

  el.textContent = text;
  el.className = `sync-status sync-status-${type}`;

  if (autoHide) {
    syncStatusTimer = setTimeout(() => {
      el.classList.add("sync-status-fade");
      setTimeout(() => {
        el.className = "sync-status hidden";
      }, 400);
    }, autoHide);
  }
}

/**
 * 同期ステータスを非表示にする
 */
function hideSyncStatus() {
  const el = getSyncStatusEl();
  if (el) el.className = "sync-status hidden";
}

// ============================================================
// オフライン検知
// ============================================================

/**
 * オンライン/オフライン状態に応じてステータスを更新する
 */
function updateOnlineStatus() {
  if (!navigator.onLine) {
    showSyncStatus("⚡ オフライン", "offline");
  } else {
    // オンラインに戻った場合はステータスを消す（ログイン時に再同期される）
    hideSyncStatus();
  }
}

window.addEventListener("online",  updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);

// ページ読み込み時点でオフラインなら即座に表示
if (!navigator.onLine) {
  // DOM 準備後に挿入するため少し遅延させる
  setTimeout(() => showSyncStatus("⚡ オフライン", "offline"), 500);
}

// ============================================================
// マージロジック
// ============================================================

/**
 * Firestore と localStorage のエントリを ID ごとにマージする
 * 同じ ID のエントリは updatedAt が新しい方を採用する
 */
function mergeEntries(local, cloud) {
  const map = new Map();

  local.forEach((e) => map.set(e.id, e));

  cloud.forEach((cloudEntry) => {
    const localEntry = map.get(cloudEntry.id);
    if (!localEntry) {
      map.set(cloudEntry.id, cloudEntry);
    } else {
      const localTime = new Date(localEntry.updatedAt || 0).getTime();
      const cloudTime = new Date(cloudEntry.updatedAt || 0).getTime();
      if (cloudTime > localTime) {
        map.set(cloudEntry.id, cloudEntry);
      }
    }
  });

  return Array.from(map.values());
}

/**
 * 500件ごとに分割して Firestore に一括書き込む（Firestoreの上限対応）
 */
async function batchSet(items, subCollection, uid) {
  if (items.length === 0) return;
  const LIMIT = 500;
  for (let i = 0; i < items.length; i += LIMIT) {
    const chunk = items.slice(i, i + LIMIT);
    const batch = writeBatch(db);
    chunk.forEach((item) => {
      const ref = doc(db, "users", uid, subCollection, item.id);
      batch.set(ref, item);
    });
    await batch.commit();
  }
}

// ============================================================
// Firestore との同期（双方向マージ）
// ============================================================

/**
 * Firestore からデータを読み込み localStorage と双方向マージする
 * ・Firestore にしかないデータ → localStorage に追加
 * ・localStorage にしかないデータ → Firestore にアップロード（初回移行）
 * ・両方にある場合 → updatedAt が新しい方を採用
 *
 * @param {string} uid - ログイン中のユーザーID
 * @returns {{ migratedEntries: number, totalEntries: number }} 同期結果
 */
async function syncFromCloud(uid) {
  console.log("[SaunaCloud] Firestore と同期中...");

  // ---- エントリの同期 ----
  const localEntries = window.SaunaStorage.loadLogs();
  const entriesSnap  = await getDocs(collection(db, "users", uid, "entries"));
  const cloudEntries = entriesSnap.docs.map((d) => ({ ...d.data(), id: d.id }));

  const mergedEntries = mergeEntries(localEntries, cloudEntries);
  window.SaunaStorage.saveLogs(mergedEntries);

  // ローカルにしかないエントリを Firestore へアップロード（初回移行）
  const cloudEntryIds   = new Set(cloudEntries.map((e) => e.id));
  const toUploadEntries = mergedEntries.filter((e) => !cloudEntryIds.has(e.id));
  await batchSet(toUploadEntries, "entries", uid);

  // ---- 施設マスタの同期 ----
  const localFacilities = window.SaunaStorage.loadFacilities();
  const facilitiesSnap  = await getDocs(collection(db, "users", uid, "facilities"));
  const cloudFacilities = {};
  facilitiesSnap.docs.forEach((d) => {
    cloudFacilities[d.id] = { ...d.data(), id: d.id };
  });

  const mergedFacilities = { ...localFacilities, ...cloudFacilities };
  window.SaunaStorage.saveFacilities(mergedFacilities);

  const toUploadFacilities = Object.values(localFacilities).filter(
    (f) => !cloudFacilities[f.id]
  );
  await batchSet(toUploadFacilities, "facilities", uid);

  console.log(
    `[SaunaCloud] 同期完了 — エントリ ${mergedEntries.length} 件 / ` +
    `施設 ${Object.keys(mergedFacilities).length} 件` +
    (toUploadEntries.length > 0 ? ` / 新規移行 ${toUploadEntries.length} 件` : "")
  );

  return {
    migratedEntries: toUploadEntries.length,
    totalEntries:    mergedEntries.length,
  };
}

// ============================================================
// Firestore への書き込み（1件ずつ）
// ============================================================

async function saveEntryToCloud(uid, entry) {
  const ref = doc(db, "users", uid, "entries", entry.id);
  await setDoc(ref, entry);
}

async function saveFacilityToCloud(uid, facility) {
  const ref = doc(db, "users", uid, "facilities", facility.id);
  await setDoc(ref, facility);
}

async function deleteEntryFromCloud(uid, entryId) {
  const ref = doc(db, "users", uid, "entries", entryId);
  await deleteDoc(ref);
}

// ============================================================
// グローバルに公開（app.js / list.js など非モジュールから呼べるようにする）
// ============================================================

window.SaunaCloud = {
  syncFromCloud,
  saveEntryToCloud,
  saveFacilityToCloud,
  deleteEntryFromCloud,
};

// ============================================================
// ログイン時：同期実行 → ステータス表示 → 各ページに通知
// ============================================================

window.addEventListener("sauna-auth-changed", async (e) => {
  const user = e.detail && e.detail.user;

  if (!user) {
    // ログアウト時はステータスを消す
    hideSyncStatus();
    return;
  }

  if (!navigator.onLine) {
    showSyncStatus("⚡ オフライン", "offline");
    return;
  }

  showSyncStatus("🔄 同期中...", "syncing");

  try {
    const result = await syncFromCloud(user.uid);

    if (result.migratedEntries > 0) {
      // 初回ログイン時：ローカルデータをクラウドに移行した場合
      showSyncStatus(
        `☁ ${result.migratedEntries}件をクラウドに移行しました`,
        "migrated",
        6000
      );
    } else {
      // 通常の同期完了
      showSyncStatus("✓ 同期済み", "ok", 3000);
    }

    // 各ページに「データが更新された」ことを通知する
    window.dispatchEvent(new CustomEvent("sauna-data-updated"));

  } catch (err) {
    console.error("[SaunaCloud] 同期エラー:", err);
    showSyncStatus("⚠ 同期エラー", "error", 6000);
    // 同期に失敗しても既存の localStorage データでアプリは動作し続ける
  }
});
