/**
 * app.js - メインページ（記録の追加・編集・一覧）
 */
(function () {
"use strict";

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
let exportBtn;
let importBtn;
let importFileInput;

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

function handleExport() {
  try {
    window.SaunaStorage.exportAllData();
  } catch (err) {
    alert("エクスポートに失敗しました: " + (err && err.message ? err.message : err));
  }
}

function handleImportFile(file) {
  if (!file) return;
  if (!confirm("既存のデータをインポートした内容で上書きします。よろしいですか？")) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      window.SaunaStorage.importAllData(e.target.result);
      migrateLegacyLogs();
      updateFacilitySuggestions();
      renderLogs();
      showSaveMessage("インポートが完了しました。");
    } catch (err) {
      const msg = err && err.message ? err.message : "インポートに失敗しました。";
      showSaveMessage(msg, true);
      alert(msg);
    } finally {
      importFileInput.value = "";
    }
  };
  reader.readAsText(file, "utf-8");
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
    setBootStatus("読み込み失敗 — スクリプトの読み込みを確認してください", false);
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
  exportBtn = document.getElementById("export-btn");
  importBtn = document.getElementById("import-btn");
  importFileInput = document.getElementById("import-file");

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
  if (exportBtn) exportBtn.addEventListener("click", handleExport);
  if (importBtn) importBtn.addEventListener("click", () => importFileInput.click());
  if (importFileInput) importFileInput.addEventListener("change", (e) => handleImportFile(e.target.files[0]));
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

})();
