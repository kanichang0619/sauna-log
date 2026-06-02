/**
 * storage.js - localStorage の読み書きをまとめたファイル
 *
 * 複数の HTML ページ（index / graph / map）から同じデータを使うため、
 * 共通処理をここに集めています。
 */

// 記録一覧を保存するキー
const STORAGE_KEY = "sauna-log-entries";
// 施設マスタ（住所・地図用の緯度経度）を保存するキー
const FACILITIES_KEY = "sauna-log-facilities";

/**
 * 施設名を比較用に正規化（前後の空白除去・小文字化）
 * @param {string} name
 * @returns {string}
 */
function normalizeFacilityName(name) {
  return String(name || "").trim().toLowerCase();
}

/**
 * 新しい施設 ID を発行（簡易的な一意ID）
 * @returns {string}
 */
function createFacilityId() {
  return `facility_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 記録一覧を読み込む
 * @returns {Array}
 */
function loadLogs() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return [];
  }
  try {
    const logs = JSON.parse(saved);
    return Array.isArray(logs) ? logs : [];
  } catch {
    return [];
  }
}

/**
 * 記録一覧を保存する
 * @param {Array} logs
 */
function saveLogs(logs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch (e) {
    if (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED") {
      throw new Error("ストレージの容量が不足しています。古い記録を削除してから再試行してください。");
    }
    throw e;
  }
}

/**
 * 施設マスタを読み込む
 * 形式: { [facilityId]: { id, name, address, lat, lng } }
 * @returns {Object}
 */
function loadFacilities() {
  const saved = localStorage.getItem(FACILITIES_KEY);
  if (!saved) {
    return {};
  }
  try {
    const data = JSON.parse(saved);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/**
 * 施設マスタを保存する
 * @param {Object} facilities
 */
function saveFacilities(facilities) {
  try {
    localStorage.setItem(FACILITIES_KEY, JSON.stringify(facilities));
  } catch (e) {
    if (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED") {
      throw new Error("ストレージの容量が不足しています。");
    }
    throw e;
  }
}

/**
 * 施設名から施設情報を探す（既に登録済みか判定に使う）
 * @param {string} name
 * @returns {Object|null}
 */
function findFacilityByName(name) {
  const key = normalizeFacilityName(name);
  const facilities = loadFacilities();
  return (
    Object.values(facilities).find(
      (f) => normalizeFacilityName(f.name) === key
    ) || null
  );
}

/**
 * 施設 ID から施設情報を取得
 * @param {string} facilityId
 * @returns {Object|null}
 */
function getFacilityById(facilityId) {
  if (!facilityId) {
    return null;
  }
  return loadFacilities()[facilityId] || null;
}

/**
 * 施設を新規登録（初回訪問時）
 * @param {string} name - 施設名
 * @param {string} address - 住所
 * @param {number|null} lat - 緯度（地図用。未取得なら null）
 * @param {number|null} lng - 経度
 * @returns {Object} 登録した施設オブジェクト
 */
function registerFacility(name, address, lat = null, lng = null) {
  const facilities = loadFacilities();
  const id = createFacilityId();
  const facility = {
    id,
    name: name.trim(),
    address: address.trim(),
    lat: lat != null ? Number(lat) : null,
    lng: lng != null ? Number(lng) : null,
  };
  facilities[id] = facility;
  saveFacilities(facilities);
  return facility;
}

/**
 * 施設の緯度経度を更新（住所から位置検索したあと）
 * @param {string} facilityId
 * @param {number} lat
 * @param {number} lng
 */
function updateFacilityLocation(facilityId, lat, lng) {
  const facilities = loadFacilities();
  if (!facilities[facilityId]) {
    return;
  }
  facilities[facilityId].lat = lat;
  facilities[facilityId].lng = lng;
  saveFacilities(facilities);
}

/**
 * OpenStreetMap の Nominatim API で住所から緯度経度を取得
 * ※ インターネット接続が必要です
 * @param {string} address
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
async function geocodeAddress(address) {
  const query = encodeURIComponent(address.trim());
  if (!query) {
    return null;
  }

  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`;

  // 応答が遅いときに保存処理全体が止まらないようタイムアウトを設定
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      return null;
    }
    const results = await response.json();
    if (!results.length) {
      return null;
    }
    return {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 施設の位置情報をバックグラウンドで取得（記録の保存を待たせない）
 * @param {string} facilityId
 * @param {string} address
 */
function geocodeFacilityInBackground(facilityId, address) {
  geocodeAddress(address).then((location) => {
    if (location) {
      updateFacilityLocation(facilityId, location.lat, location.lng);
    }
  });
}

/**
 * 旧データの整い度（1〜5）を 100 点満点に変換
 * @param {number} seiri
 * @returns {number}
 */
function migrateSeiriScore(seiri) {
  const n = Number(seiri);
  if (!Number.isFinite(n)) {
    return 0;
  }
  // 以前の 1〜5 形式なら 20 点刻みで換算（例: 5 → 100）
  if (n >= 1 && n <= 5 && Number.isInteger(n)) {
    return n * 20;
  }
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * 記録の訪問日時を Date オブジェクトで取得（ソート用）
 * @param {Object} entry
 * @returns {Date}
 */
function getVisitDateTime(entry) {
  const date = entry.visitDate || "1970-01-01";
  const time = entry.visitTime || "00:00";
  return new Date(`${date}T${time}`);
}

/**
 * 古い記録形式を最新形式に揃える
 * @param {Object} entry
 * @returns {Object}
 */
function normalizeEntry(entry) {
  const facility = getFacilityById(entry.facilityId);
  return {
    id: entry.id,
    facilityId: entry.facilityId || "",
    facility: entry.facility || facility?.name || "（施設名なし）",
    visitDate: entry.visitDate || "",
    visitTime: entry.visitTime || "12:00",
    stayHours: entry.stayHours ?? 0,
    stayMinutes: entry.stayMinutes ?? 0,
    saunaTemp: entry.saunaTemp,
    waterTemp: entry.waterTemp,
    seiri: migrateSeiriScore(entry.seiri),
    sets: entry.sets || {
      sauna: { minutesPerRound: 0, count: 0 },
      water: { minutesPerRound: 0, count: 0 },
      outdoor: { minutesPerRound: 0, count: 0 },
    },
    facilityRating: entry.facilityRating || {
      sauna: 0,
      water: 0,
      outdoor: 0,
      cleanliness: 0,
      flow: 0,
    },
    lourou: entry.lourou || "なし",
    comment: entry.comment || "",
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt || entry.createdAt,
  };
}

/**
 * 施設ごとの訪問回数を集計（グラフページ用）
 * @returns {Array<{name: string, count: number}>}
 */
function countVisitsByFacility() {
  const logs = loadLogs();
  const counts = {};

  logs.forEach((raw) => {
    const entry = normalizeEntry(raw);
    const name = entry.facility;
    counts[name] = (counts[name] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 地図に表示できる施設一覧（緯度経度があるもの）
 * @returns {Array}
 */
function getMappableFacilities() {
  const facilities = loadFacilities();
  return Object.values(facilities).filter(
    (f) => Number.isFinite(f.lat) && Number.isFinite(f.lng)
  );
}

/**
 * 施設 ID に紐づく記録一覧
 * @param {string} facilityId
 * @returns {Array}
 */
function getLogsByFacilityId(facilityId) {
  return loadLogs()
    .map(normalizeEntry)
    .filter((e) => e.facilityId === facilityId)
    .sort((a, b) => getVisitDateTime(b) - getVisitDateTime(a));
}

/**
 * 旧記録（facilityId なし）を施設名で施設マスタと紐づける
 */
function migrateLegacyLogs() {
  const logs = loadLogs();
  let changed = false;

  logs.forEach((log) => {
    if (!log.facilityId && log.facility) {
      const facility = findFacilityByName(log.facility);
      if (facility) {
        log.facilityId = facility.id;
        changed = true;
      }
    }
  });

  if (changed) {
    saveLogs(logs);
  }
}

/**
 * 全データを JSON ファイルとしてダウンロード
 */
function exportAllData() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: loadLogs(),
    facilities: loadFacilities(),
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sauna-log-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * JSON 文字列からデータを復元（既存データを上書き）
 * @param {string} jsonString
 */
function importAllData(jsonString) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error("ファイルの形式が正しくありません（JSON として読み込めませんでした）。");
  }
  if (!Array.isArray(data.entries) || !data.facilities || typeof data.facilities !== "object") {
    throw new Error("このファイルはサウナログのバックアップ形式ではありません。");
  }
  saveLogs(data.entries);
  saveFacilities(data.facilities);
}

// 他の JS ファイルから window 経由で使えるように公開
window.SaunaStorage = {
  STORAGE_KEY,
  FACILITIES_KEY,
  normalizeFacilityName,
  loadLogs,
  saveLogs,
  loadFacilities,
  saveFacilities,
  findFacilityByName,
  getFacilityById,
  registerFacility,
  updateFacilityLocation,
  geocodeAddress,
  geocodeFacilityInBackground,
  migrateSeiriScore,
  getVisitDateTime,
  normalizeEntry,
  countVisitsByFacility,
  getMappableFacilities,
  getLogsByFacilityId,
  migrateLegacyLogs,
  exportAllData,
  importAllData,
};
