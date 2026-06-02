/**
 * main.js - サウナログ（記録ページ）
 * index.html と同じフォルダに配置してください。
 */
(function () {
  "use strict";

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
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
  localStorage.setItem(FACILITIES_KEY, JSON.stringify(facilities));
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
};


/**
 * utils.js - 表示や検索・ソートの共通処理
 */

/**
 * XSS 対策：ユーザー入力を HTML に安全に表示
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

/**
 * 訪問日を表示用に整形
 * @param {string} dateString - YYYY-MM-DD
 * @returns {string}
 */
function formatVisitDate(dateString) {
  if (!dateString) {
    return "日付不明";
  }
  const [y, m, d] = dateString.split("-");
  return `${y}年${Number(m)}月${Number(d)}日`;
}

/**
 * 訪問日時を表示用に整形
 * @param {Object} entry
 * @returns {string}
 */
function formatVisitDateTime(entry) {
  const date = formatVisitDate(entry.visitDate);
  const time = entry.visitTime || "";
  return time ? `${date} ${time}` : date;
}

/**
 * 保存・更新日時
 * @param {string} isoString
 * @returns {string}
 */
function formatSavedAt(isoString) {
  if (!isoString) {
    return "";
  }
  const date = new Date(isoString);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${d} ${h}:${min}`;
}

/**
 * 滞在時間の表示
 */
function formatStayDuration(hours, minutes) {
  const h = Number(hours) || 0;
  const m = Number(minutes) || 0;
  if (h === 0 && m === 0) {
    return "0分";
  }
  if (h === 0) {
    return `${m}分`;
  }
  if (m === 0) {
    return `${h}時間`;
  }
  return `${h}時間${m}分`;
}

/**
 * 1〜5 の施設評価を星表示
 */
function toStars(level) {
  const n = Math.min(5, Math.max(0, Number(level) || 0));
  if (n === 0) {
    return "未入力";
  }
  return "★".repeat(n) + "☆".repeat(5 - n);
}

/**
 * 整い度（100点満点）の表示
 */
function formatSeiriScore(score) {
  const n = Math.min(100, Math.max(0, Number(score) || 0));
  return `${n}点`;
}

/**
 * セット記録の1行テキスト
 */
function formatSetLine(setData, label) {
  if (!setData) {
    return `${label}: 記録なし`;
  }
  const min = setData.minutesPerRound ?? 0;
  const count = setData.count ?? 0;
  return `${label}: ${min}分 × ${count}回（合計 ${min * count}分）`;
}

/**
 * 記録に紐づく施設の住所を取得
 */
function getEntryAddress(entry) {
  const facility = window.SaunaStorage.getFacilityById(entry.facilityId);
  return facility?.address || "";
}

/**
 * 検索キーワードで記録を絞り込む
 * 施設名・訪問日時・所在地（住所）のいずれかに含まれるか
 * @param {Array} logs
 * @param {string} keyword
 * @returns {Array}
 */
function filterLogs(logs, keyword) {
  const q = keyword.trim().toLowerCase();
  if (!q) {
    return logs;
  }

  return logs.filter((raw) => {
    const entry = window.SaunaStorage.normalizeEntry(raw);
    const address = getEntryAddress(entry).toLowerCase();
    const visitText = formatVisitDateTime(entry).toLowerCase();
    const facility = (entry.facility || "").toLowerCase();

    return (
      facility.includes(q) ||
      visitText.includes(q) ||
      address.includes(q) ||
      (entry.visitDate || "").includes(q)
    );
  });
}

/**
 * ソート
 * @param {Array} logs
 * @param {string} sortBy - facility | visitDateTime | seiri
 * @param {string} order - asc | desc
 */
function sortLogs(logs, sortBy, order) {
  const dir = order === "asc" ? 1 : -1;
  const { getVisitDateTime, normalizeEntry } = window.SaunaStorage;

  return [...logs].sort((a, b) => {
    const ea = normalizeEntry(a);
    const eb = normalizeEntry(b);
    let cmp = 0;

    if (sortBy === "facility") {
      cmp = ea.facility.localeCompare(eb.facility, "ja");
    } else if (sortBy === "seiri") {
      cmp = ea.seiri - eb.seiri;
    } else {
      // 訪問日時（デフォルト）
      cmp = getVisitDateTime(ea) - getVisitDateTime(eb);
    }

    return cmp * dir;
  });
}

window.SaunaUtils = {
  escapeHtml,
  formatVisitDate,
  formatVisitDateTime,
  formatSavedAt,
  formatStayDuration,
  toStars,
  formatSeiriScore,
  formatSetLine,
  getEntryAddress,
  filterLogs,
  sortLogs,
};


function runApp() {
/**
 * app.js - メインページ（記録の追加・編集・一覧）
 */

const RATING_NAMES = [
  "rateSauna",
  "rateWater",
  "rateOutdoor",
  "rateClean",
  "rateFlow",
];

// DOM 要素（initApp 内で代入）
let form;
let logList;
let emptyMessage;
let noResultMessage;
let totalVisitsEl;
let visitDateInput;
let visitTimeInput;
let facilityInput;
let addressInput;
let addressHint;
let facilityStatus;
let editIdInput;
let formTitle;
let submitBtn;
let cancelEditBtn;
let searchInput;
let sortBySelect;
let sortOrderSelect;
let facilitySuggestions;
let saveMessage;

let loadLogs;
let saveLogs;
let findFacilityByName;
let getFacilityById;
let registerFacility;
let geocodeFacilityInBackground;
let normalizeEntry;
let migrateSeiriScore;
let migrateLegacyLogs;

let escapeHtml;
let formatVisitDateTime;
let formatSavedAt;
let formatStayDuration;
let toStars;
let formatSeiriScore;
let formatSetLine;
let getEntryAddress;
let filterLogs;
let sortLogs;

/** 訪問日・時刻の初期値を「今」にする */
function setDefaultVisitDateTime() {
  if (!visitDateInput || !visitTimeInput) return;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  visitDateInput.value = `${y}-${m}-${d}`;
  visitTimeInput.value = `${h}:${min}`;
}

function setDefaultRatingValues() {
  RATING_NAMES.forEach((name) => {
    if (!form.querySelector(`input[name="${name}"]:checked`)) {
      setRadio(name, 3);
    }
  });
}

function setRadio(name, value) {
  const radio = form.querySelector(`input[name="${name}"][value="${value}"]`);
  if (radio) radio.checked = true;
}

function updateFacilitySuggestions() {
  const facilities = Object.values(window.SaunaStorage.loadFacilities());
  facilitySuggestions.innerHTML = facilities
    .map((f) => `<option value="${escapeHtml(f.name)}"></option>`)
    .join("");
}

/** 施設名に応じて住所欄の案内文を更新（住所欄は常に表示） */
function updateAddressHint() {
  const name = facilityInput.value.trim();
  const existing = findFacilityByName(name);

  if (!name) {
    facilityStatus.textContent = "";
    addressHint.textContent =
      "初めて訪問する施設は住所の入力が必須です。2回目以降は空欄で構いません。";
    return;
  }

  if (existing) {
    facilityStatus.textContent = `登録済みの施設です（${existing.address}）`;
    facilityStatus.className = "hint";
    addressHint.textContent = "この施設は登録済みのため、住所は空欄で構いません。";
    if (!addressInput.value.trim()) {
      addressInput.value = existing.address || "";
    }
  } else {
    facilityStatus.textContent = "初回訪問の施設です。住所を入力してください。";
    facilityStatus.className = "hint hint-warn";
    addressHint.textContent = "初めての施設のため、住所の入力が必須です。";
  }
}

function showSaveMessage(text, isError = false) {
  saveMessage.textContent = text;
  saveMessage.classList.remove("hidden", "save-message-error", "save-message-success");
  saveMessage.classList.add(isError ? "save-message-error" : "save-message-success");
}

function hideSaveMessage() {
  saveMessage.classList.add("hidden");
}

function updateTotalVisits() {
  totalVisitsEl.textContent = String(loadLogs().length);
}

function setEditMode(editing) {
  if (editing) {
    formTitle.textContent = "記録を編集";
    submitBtn.textContent = "変更を保存";
    cancelEditBtn.classList.remove("hidden");
    form.classList.add("form-editing");
  } else {
    formTitle.textContent = "新しい記録を追加";
    submitBtn.textContent = "記録を保存";
    cancelEditBtn.classList.add("hidden");
    form.classList.remove("form-editing");
    editIdInput.value = "";
  }
}

function cancelEdit() {
  form.reset();
  setDefaultVisitDateTime();
  setDefaultRatingValues();
  setEditMode(false);
  updateAddressHint();
  hideSaveMessage();
}

function getNumber(formData, name, defaultValue = 0) {
  const value = Number(formData.get(name));
  return Number.isFinite(value) ? value : defaultValue;
}

function ensureFacility(facilityName, addressFromForm) {
  let facility = findFacilityByName(facilityName);
  if (facility) return facility;

  const address = addressFromForm.trim();
  if (!address) {
    addressInput.focus();
    throw new Error(
      "初めて訪問する施設です。\n「施設の所在地（住所）」を入力してから保存してください。"
    );
  }

  facility = registerFacility(facilityName, address);
  updateFacilitySuggestions();
  geocodeFacilityInBackground(facility.id, address);
  return facility;
}

function buildEntryFromForm(formData, existingEntry = null) {
  return {
    id: existingEntry ? existingEntry.id : String(Date.now()),
    facilityId: existingEntry?.facilityId || "",
    facility: formData.get("facility").trim(),
    visitDate: formData.get("visitDate"),
    visitTime: formData.get("visitTime"),
    stayHours: getNumber(formData, "stayHours", 0),
    stayMinutes: getNumber(formData, "stayMinutes", 0),
    saunaTemp: getNumber(formData, "saunaTemp"),
    waterTemp: getNumber(formData, "waterTemp"),
    seiri: migrateSeiriScore(getNumber(formData, "seiri")),
    sets: {
      sauna: {
        minutesPerRound: getNumber(formData, "saunaSetMinutes"),
        count: getNumber(formData, "saunaSetCount"),
      },
      water: {
        minutesPerRound: getNumber(formData, "waterSetMinutes"),
        count: getNumber(formData, "waterSetCount"),
      },
      outdoor: {
        minutesPerRound: getNumber(formData, "outdoorSetMinutes"),
        count: getNumber(formData, "outdoorSetCount"),
      },
    },
    facilityRating: {
      sauna: getNumber(formData, "rateSauna"),
      water: getNumber(formData, "rateWater"),
      outdoor: getNumber(formData, "rateOutdoor"),
      cleanliness: getNumber(formData, "rateClean"),
      flow: getNumber(formData, "rateFlow"),
    },
    comment: formData.get("comment").trim(),
    createdAt: existingEntry?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 保存前の入力チェック（日本語でまとめて表示）
 */
function validateForm() {
  const missing = [];
  const facilityName = facilityInput.value.trim();

  if (!facilityName) missing.push("施設名");
  if (!visitDateInput.value) missing.push("訪問日");
  if (!visitTimeInput.value) missing.push("訪問時刻");

  const commentEl = document.getElementById("comment");
  if (!commentEl.value.trim()) missing.push("感想");

  RATING_NAMES.forEach((name) => {
    if (!form.querySelector(`input[name="${name}"]:checked`)) {
      missing.push("施設の評価（すべての項目）");
    }
  });

  if (facilityName && !findFacilityByName(facilityName) && !addressInput.value.trim()) {
    missing.push("施設の所在地（住所）※初めての施設");
  }

  if (missing.length > 0) {
    const unique = [...new Set(missing)];
    alert("次の項目を入力・選択してください：\n\n・" + unique.join("\n・"));
    return false;
  }
  return true;
}

function ratingRowHtml(label, value) {
  return `
    <div class="rating-row">
      <span>${escapeHtml(label)}</span>
      <span class="rate-stars" title="${value}/5">${toStars(value)}</span>
    </div>
  `;
}

function createLogItemElement(rawEntry) {
  const entry = normalizeEntry(rawEntry);
  const address = getEntryAddress(entry);
  const ratings = entry.facilityRating;
  const sets = entry.sets;

  const li = document.createElement("li");
  li.className = "log-item";
  li.dataset.id = entry.id;

  li.innerHTML = `
    <div class="log-item-header">
      <h3>${escapeHtml(entry.facility)}</h3>
      <span class="log-visit-date">${escapeHtml(formatVisitDateTime(entry))}</span>
    </div>
    ${address ? `<p class="log-address">📍 ${escapeHtml(address)}</p>` : ""}
    <div class="log-meta">
      <span class="meta-chip">滞在 ${escapeHtml(formatStayDuration(entry.stayHours, entry.stayMinutes))}</span>
      <span class="meta-chip">サウナ ${escapeHtml(String(entry.saunaTemp))}℃</span>
      <span class="meta-chip">水風呂 ${escapeHtml(String(entry.waterTemp))}℃</span>
      <span class="meta-chip seiri-score">整い ${escapeHtml(formatSeiriScore(entry.seiri))}</span>
    </div>
    <details class="log-details">
      <summary>セット・施設評価の詳細</summary>
      <div class="log-details-body">
        <div class="detail-section">
          <h4>セット記録</h4>
          <ul class="detail-list">
            <li>${escapeHtml(formatSetLine(sets.sauna, "サウナ"))}</li>
            <li>${escapeHtml(formatSetLine(sets.water, "水風呂"))}</li>
            <li>${escapeHtml(formatSetLine(sets.outdoor, "外気浴"))}</li>
          </ul>
        </div>
        <div class="detail-section">
          <h4>施設の評価</h4>
          ${ratingRowHtml("サウナ", ratings.sauna)}
          ${ratingRowHtml("水風呂", ratings.water)}
          ${ratingRowHtml("外気浴", ratings.outdoor)}
          ${ratingRowHtml("清潔感", ratings.cleanliness)}
          ${ratingRowHtml("動線", ratings.flow)}
        </div>
      </div>
    </details>
    <p class="log-comment">${escapeHtml(entry.comment)}</p>
    <p class="log-saved-at">登録: ${escapeHtml(formatSavedAt(entry.createdAt))}</p>
    <div class="log-actions">
      <button type="button" class="btn-edit">編集</button>
      <button type="button" class="btn-delete">削除</button>
    </div>
  `;

  li.querySelector(".btn-edit").addEventListener("click", () => fillFormFromEntry(entry));
  li.querySelector(".btn-delete").addEventListener("click", () => deleteLog(entry.id));
  return li;
}

function fillFormFromEntry(entry) {
  const normalized = normalizeEntry(entry);
  const facility = getFacilityById(normalized.facilityId);

  editIdInput.value = normalized.id;
  facilityInput.value = normalized.facility;
  visitDateInput.value = normalized.visitDate;
  visitTimeInput.value = normalized.visitTime;
  document.getElementById("stay-hours").value = normalized.stayHours;
  document.getElementById("stay-minutes").value = normalized.stayMinutes;
  document.getElementById("sauna-temp").value = normalized.saunaTemp;
  document.getElementById("water-temp").value = normalized.waterTemp;
  document.getElementById("seiri").value = normalized.seiri;

  const sets = normalized.sets;
  document.getElementById("sauna-set-minutes").value = sets.sauna.minutesPerRound;
  document.getElementById("sauna-set-count").value = sets.sauna.count;
  document.getElementById("water-set-minutes").value = sets.water.minutesPerRound;
  document.getElementById("water-set-count").value = sets.water.count;
  document.getElementById("outdoor-set-minutes").value = sets.outdoor.minutesPerRound;
  document.getElementById("outdoor-set-count").value = sets.outdoor.count;

  const r = normalized.facilityRating;
  setRadio("rateSauna", r.sauna);
  setRadio("rateWater", r.water);
  setRadio("rateOutdoor", r.outdoor);
  setRadio("rateClean", r.cleanliness);
  setRadio("rateFlow", r.flow);
  document.getElementById("comment").value = normalized.comment;

  if (facility) addressInput.value = facility.address || "";
  updateAddressHint();
  setEditMode(true);
}

function renderLogs() {
  const allLogs = loadLogs();
  updateTotalVisits();

  let logs = filterLogs(allLogs, searchInput.value);
  logs = sortLogs(logs, sortBySelect.value, sortOrderSelect.value);
  logList.innerHTML = "";

  if (allLogs.length === 0) {
    emptyMessage.classList.remove("hidden");
    noResultMessage.classList.add("hidden");
    return;
  }

  emptyMessage.classList.add("hidden");
  if (logs.length === 0) {
    noResultMessage.classList.remove("hidden");
    return;
  }

  noResultMessage.classList.add("hidden");
  logs.forEach((entry) => logList.appendChild(createLogItemElement(entry)));
}

function saveEntryFromForm() {
  const formData = new FormData(form);
  const editId = editIdInput.value;
  const facilityName = facilityInput.value.trim();
  const address = addressInput.value || "";

  let logs = loadLogs();
  const existingIndex = editId ? logs.findIndex((e) => e.id === editId) : -1;
  const existingEntry =
    existingIndex >= 0 ? normalizeEntry(logs[existingIndex]) : null;

  const facility = ensureFacility(facilityName, address);
  const entry = buildEntryFromForm(formData, existingEntry);
  entry.facilityId = facility.id;
  entry.facility = facility.name;

  if (existingIndex >= 0) {
    logs[existingIndex] = entry;
  } else {
    logs.push(entry);
  }

  saveLogs(logs);
  renderLogs();
  cancelEdit();
  showSaveMessage("記録を保存しました。");
}

function deleteLog(id) {
  if (!confirm("この記録を削除しますか？")) return;
  saveLogs(loadLogs().filter((e) => e.id !== id));
  renderLogs();
}

/** 保存ボタン押下時の処理 */
function handleSaveClick() {
  // ボタンが効いているかすぐ分かるよう表示
  showSaveMessage("保存を処理しています...", false);

  setDefaultVisitDateTime();
  setDefaultRatingValues();
  updateAddressHint();

  if (!validateForm()) {
    hideSaveMessage();
    return;
  }

  submitBtn.disabled = true;
  const originalText = "記録を保存";

  try {
    saveEntryFromForm();
  } catch (err) {
    const msg = (err && err.message) ? err.message : "保存に失敗しました。";
    showSaveMessage(msg, true);
    alert(msg);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editIdInput.value ? "変更を保存" : originalText;
  }
}

function setBootStatus(text, isOk) {
  const el = document.getElementById("boot-status");
  if (!el) return;
  el.textContent = text;
  el.className = "boot-status " + (isOk ? "boot-status-ok" : "boot-status-error");
}

function initApp() {
  if (!window.SaunaStorage || !window.SaunaUtils) {
    setBootStatus("読み込み失敗 — main.js を確認してください", false);
    alert(
      "プログラムの読み込みに失敗しました。\n" +
        "sauna-log フォルダ内の index.html を開き直してください。"
    );
    return;
  }

  ({
    loadLogs,
    saveLogs,
    findFacilityByName,
    getFacilityById,
    registerFacility,
    geocodeFacilityInBackground,
    normalizeEntry,
    migrateSeiriScore,
    migrateLegacyLogs,
  } = window.SaunaStorage);

  ({
    escapeHtml,
    formatVisitDateTime,
    formatSavedAt,
    formatStayDuration,
    toStars,
    formatSeiriScore,
    formatSetLine,
    getEntryAddress,
    filterLogs,
    sortLogs,
  } = window.SaunaUtils);

  form = document.getElementById("sauna-form");
  logList = document.getElementById("log-list");
  emptyMessage = document.getElementById("empty-message");
  noResultMessage = document.getElementById("no-result-message");
  totalVisitsEl = document.getElementById("total-visits");
  visitDateInput = document.getElementById("visit-date");
  visitTimeInput = document.getElementById("visit-time");
  facilityInput = document.getElementById("facility");
  addressInput = document.getElementById("facility-address");
  addressHint = document.getElementById("address-hint");
  facilityStatus = document.getElementById("facility-status");
  editIdInput = document.getElementById("edit-id");
  formTitle = document.getElementById("form-title");
  submitBtn = document.getElementById("submit-btn");
  cancelEditBtn = document.getElementById("cancel-edit-btn");
  searchInput = document.getElementById("search-input");
  sortBySelect = document.getElementById("sort-by");
  sortOrderSelect = document.getElementById("sort-order");
  facilitySuggestions = document.getElementById("facility-suggestions");
  saveMessage = document.getElementById("save-message");

  if (!form || !submitBtn) {
    alert("画面の読み込みに失敗しました。ページを再読み込みしてください。");
    return;
  }

  // 保存ボタン（通常のフォーム送信は使わない）
  submitBtn.addEventListener("click", handleSaveClick);

  // Enter キーで送信されないよう、フォームの submit も止める
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSaveClick();
  });

  cancelEditBtn.addEventListener("click", cancelEdit);
  facilityInput.addEventListener("input", updateAddressHint);
  facilityInput.addEventListener("change", updateAddressHint);
  searchInput.addEventListener("input", renderLogs);
  sortBySelect.addEventListener("change", renderLogs);
  sortOrderSelect.addEventListener("change", renderLogs);

  migrateLegacyLogs();
  setDefaultVisitDateTime();
  setDefaultRatingValues();
  updateFacilitySuggestions();
  updateAddressHint();
  renderLogs();

  window.__saunaReady = true;
  setBootStatus("準備完了 — 記録を入力して「記録を保存」を押してください", true);
}

window.saunaSaveRecord = function (event) {
  if (event) event.preventDefault();
  if (!window.__saunaReady) {
    const sm = document.getElementById("save-message");
    if (sm) {
      sm.textContent = "準備できていません。F5で再読み込みしてください。";
      sm.classList.remove("hidden");
      sm.classList.add("save-message-error");
    }
    return;
  }
  handleSaveClick();
};

function startApp() {
  try {
    initApp();
  } catch (err) {
    window.__saunaReady = false;
    setBootStatus("エラー: " + (err && err.message ? err.message : err), false);
    alert("起動エラー: " + (err && err.message ? err.message : err));
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  startApp();
}

}

runApp();
})();
