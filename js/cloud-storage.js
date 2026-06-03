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
// Firestore からデータを読み込んで localStorage と同期する
// ============================================================

/**
 * Firestore と localStorage のエントリを ID ごとにマージする
 * 同じ ID のエントリは updatedAt が新しい方を採用する
 *
 * @param {Array} local  - localStorage のエントリ配列
 * @param {Array} cloud  - Firestore のエントリ配列
 * @returns {Array} マージ済みのエントリ配列
 */
function mergeEntries(local, cloud) {
  const map = new Map();

  // まずローカルのエントリを登録
  local.forEach((e) => map.set(e.id, e));

  // Firestore のエントリを比較して新しい方を採用
  cloud.forEach((cloudEntry) => {
    const localEntry = map.get(cloudEntry.id);
    if (!localEntry) {
      // ローカルにないので追加
      map.set(cloudEntry.id, cloudEntry);
    } else {
      // 両方にある場合は updatedAt が新しい方を採用
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
 *
 * @param {Array}  items          - 書き込むオブジェクトの配列（idフィールドが必要）
 * @param {string} subCollection  - "entries" または "facilities"
 * @param {string} uid            - ユーザーID
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

/**
 * Firestore からデータを読み込み localStorage と双方向マージする
 * ・Firestore にしかないデータ → localStorage に追加
 * ・localStorage にしかないデータ → Firestore にアップロード
 * ・両方にある場合 → updatedAt が新しい方を採用
 *
 * @param {string} uid - ログイン中のユーザーID
 */
async function syncFromCloud(uid) {
  console.log("[SaunaCloud] Firestore と同期中...");

  // ---- エントリの同期 ----
  const localEntries = window.SaunaStorage.loadLogs();
  const entriesSnap  = await getDocs(collection(db, "users", uid, "entries"));
  const cloudEntries = entriesSnap.docs.map((d) => ({ ...d.data(), id: d.id }));

  const mergedEntries = mergeEntries(localEntries, cloudEntries);
  window.SaunaStorage.saveLogs(mergedEntries);

  // ローカルにしかないエントリを Firestore へアップロード
  const cloudEntryIds  = new Set(cloudEntries.map((e) => e.id));
  const toUploadEntries = mergedEntries.filter((e) => !cloudEntryIds.has(e.id));
  await batchSet(toUploadEntries, "entries", uid);

  // ---- 施設マスタの同期 ----
  const localFacilities = window.SaunaStorage.loadFacilities();
  const facilitiesSnap  = await getDocs(collection(db, "users", uid, "facilities"));
  const cloudFacilities = {};
  facilitiesSnap.docs.forEach((d) => {
    cloudFacilities[d.id] = { ...d.data(), id: d.id };
  });

  // マージ（Firestore 優先）
  const mergedFacilities = { ...localFacilities, ...cloudFacilities };
  window.SaunaStorage.saveFacilities(mergedFacilities);

  // ローカルにしかない施設を Firestore へアップロード
  const toUploadFacilities = Object.values(localFacilities).filter(
    (f) => !cloudFacilities[f.id]
  );
  await batchSet(toUploadFacilities, "facilities", uid);

  console.log(
    `[SaunaCloud] 同期完了 — エントリ ${mergedEntries.length} 件 / ` +
    `施設 ${Object.keys(mergedFacilities).length} 件`
  );
}

// ============================================================
// Firestore への書き込み（1件ずつ）
// ============================================================

/**
 * 訪問記録を1件 Firestore に保存する
 * @param {string} uid
 * @param {Object} entry
 */
async function saveEntryToCloud(uid, entry) {
  const ref = doc(db, "users", uid, "entries", entry.id);
  await setDoc(ref, entry);
}

/**
 * 施設情報を1件 Firestore に保存する
 * @param {string} uid
 * @param {Object} facility
 */
async function saveFacilityToCloud(uid, facility) {
  const ref = doc(db, "users", uid, "facilities", facility.id);
  await setDoc(ref, facility);
}

/**
 * 訪問記録を1件 Firestore から削除する
 * @param {string} uid
 * @param {string} entryId
 */
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
// ログイン状態の変化に応じて同期を実行する
// ============================================================

/**
 * auth.js が発火する "sauna-auth-changed" イベントを受け取って
 * ログイン時は Firestore と同期し、完了後に "sauna-data-updated" を発火する
 */
window.addEventListener("sauna-auth-changed", async (e) => {
  const user = e.detail && e.detail.user;
  if (!user) return; // ログアウト時は何もしない

  try {
    await syncFromCloud(user.uid);
    // 各ページに「データが更新された」ことを通知する
    window.dispatchEvent(new CustomEvent("sauna-data-updated"));
  } catch (err) {
    console.error("[SaunaCloud] 同期エラー:", err);
    // 同期に失敗しても既存の localStorage データでアプリは動作し続ける
  }
});
