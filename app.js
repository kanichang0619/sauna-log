/**
 * app.js - 記録追加ページ（index.html）専用
 *
 * フォームへの入力・バリデーション・保存を担当します。
 * 記録一覧の表示は js/list.js が担当します。
 */
(function () {
"use strict";

// 施設評価のラジオボタン名一覧
const RATING_NAMES = [
  "rateSauna",
  "rateWater",
  "rateOutdoor",
  "rateClean",
  "rateFlow",
];

// ---- DOM 要素（initApp 内で代入） ----
let form;
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
let facilitySuggestions;
let saveMessage;

// ---- SaunaStorage から使う関数 ----
let loadLogs;
let saveLogs;
let findFacilityByName;
let getFacilityById;
let registerFacility;
let geocodeFacilityInBackground;
let normalizeEntry;
let migrateSeiriScore;
let migrateLegacyLogs;
let getLogsByFacilityId;

// ---- SaunaUtils から使う関数 ----
let escapeHtml;

// ============================================================
// 訪問日・時刻の初期値設定
// ============================================================

/** 訪問日・時刻が空のときだけ「今」の日時を入れる */
function setDefaultVisitDateTime() {
  if (!visitDateInput || !visitTimeInput) return;
  // すでに値が入っている場合は上書きしない（ユーザーが入力した日付を保持する）
  if (visitDateInput.value && visitTimeInput.value) return;
  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, "0");
  const d   = String(now.getDate()).padStart(2, "0");
  const h   = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  if (!visitDateInput.value) visitDateInput.value = `${y}-${m}-${d}`;
  if (!visitTimeInput.value) visitTimeInput.value = `${h}:${min}`;
}

// ============================================================
// 施設評価ラジオボタン
// ============================================================

/** 全評価項目に初期値（3）を入れる（未選択のものだけ） */
function setDefaultRatingValues() {
  RATING_NAMES.forEach((name) => {
    if (!form.querySelector(`input[name="${name}"]:checked`)) {
      setRadio(name, 3);
    }
  });
}

/** 指定した評価項目の指定値を選択状態にする */
function setRadio(name, value) {
  const radio = form.querySelector(`input[name="${name}"][value="${value}"]`);
  if (radio) radio.checked = true;
}

// ============================================================
// 施設名サジェストと住所ヒント
// ============================================================

/** datalist の候補を登録済み施設で更新する */
function updateFacilitySuggestions() {
  const facilities = Object.values(window.SaunaStorage.loadFacilities());
  facilitySuggestions.innerHTML = facilities
    .map((f) => `<option value="${escapeHtml(f.name)}"></option>`)
    .join("");
}

/** 施設名に応じて住所欄の案内文を更新 */
function updateAddressHint() {
  const name     = facilityInput.value.trim();
  const existing = findFacilityByName(name);

  if (!name) {
    facilityStatus.textContent = "";
    addressHint.textContent =
      "初めて訪問する施設は住所の入力が必須です。2回目以降は空欄で構いません。";
    return;
  }

  if (existing) {
    facilityStatus.textContent = `登録済みの施設です（${existing.address}）`;
    facilityStatus.className   = "hint";
    addressHint.textContent    = "この施設は登録済みのため、住所は空欄で構いません。";
    if (!addressInput.value.trim()) {
      addressInput.value = existing.address || "";
    }
  } else {
    facilityStatus.textContent = "初回訪問の施設です。住所を入力してください。";
    facilityStatus.className   = "hint hint-warn";
    addressHint.textContent    = "初めての施設のため、住所の入力が必須です。";
  }
}

/** 施設名が変わったときに住所ヒントと前回記録の自動入力を実行 */
function handleFacilityInput() {
  updateAddressHint();
  prefillFromLastVisit(facilityInput.value.trim());
}

// ============================================================
// 前回訪問記録の自動入力
// ============================================================

/**
 * 施設名が既登録施設と一致したとき、前回の記録内容を各フィールドに自動入力する
 * 編集モード中（editId が入っているとき）は何もしない
 */
function prefillFromLastVisit(facilityName) {
  if (!facilityName) return;
  if (editIdInput && editIdInput.value) return;

  const facility = findFacilityByName(facilityName);
  if (!facility) return;

  const logs = getLogsByFacilityId(facility.id);
  if (!logs.length) return;

  const last = normalizeEntry(logs[0]);

  document.getElementById("stay-hours").value   = last.stayHours;
  document.getElementById("stay-minutes").value = last.stayMinutes;
  document.getElementById("sauna-temp").value   = last.saunaTemp;
  document.getElementById("water-temp").value   = last.waterTemp;
  document.getElementById("lourou").value        = last.lourou   || "なし";
  document.getElementById("restType").value      = last.restType || "外気浴";
  document.getElementById("crowding").value      = last.crowding || "普通";
  document.getElementById("seiri").value         = last.seiri;

  const sets = last.sets;
  document.getElementById("sauna-set-minutes").value   = sets.sauna.minutesPerRound;
  document.getElementById("sauna-set-count").value     = sets.sauna.count;
  document.getElementById("water-set-minutes").value   = sets.water.minutesPerRound;
  document.getElementById("water-set-count").value     = sets.water.count;
  document.getElementById("outdoor-set-minutes").value = sets.outdoor.minutesPerRound;
  document.getElementById("outdoor-set-count").value   = sets.outdoor.count;

  const r = last.facilityRating;
  setRadio("rateSauna",  r.sauna);
  setRadio("rateWater",  r.water);
  setRadio("rateOutdoor", r.outdoor);
  setRadio("rateClean",  r.cleanliness);
  setRadio("rateFlow",   r.flow);
}

// ============================================================
// 保存メッセージ
// ============================================================

function showSaveMessage(text, isError = false) {
  saveMessage.textContent = text;
  saveMessage.classList.remove("hidden", "save-message-error", "save-message-success");
  saveMessage.classList.add(isError ? "save-message-error" : "save-message-success");
}

function hideSaveMessage() {
  saveMessage.classList.add("hidden");
}

// ============================================================
// 編集モード切替
// ============================================================

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

/** 編集をキャンセルしてフォームを初期状態に戻す */
function cancelEdit() {
  form.reset();
  setDefaultVisitDateTime();
  setDefaultRatingValues();
  setEditMode(false);
  updateAddressHint();
  hideSaveMessage();
}

// ============================================================
// フォームのデータ取得ヘルパー
// ============================================================

function getNumber(formData, name, defaultValue = 0) {
  const value = Number(formData.get(name));
  return Number.isFinite(value) ? value : defaultValue;
}

/** 施設を取得または新規登録する */
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

/** フォームの入力値から記録オブジェクトを組み立てる */
function buildEntryFromForm(formData, existingEntry = null) {
  return {
    id:           existingEntry ? existingEntry.id : String(Date.now()),
    facilityId:   existingEntry?.facilityId || "",
    facility:     formData.get("facility").trim(),
    visitDate:    formData.get("visitDate"),
    visitTime:    formData.get("visitTime"),
    stayHours:    getNumber(formData, "stayHours",   0),
    stayMinutes:  getNumber(formData, "stayMinutes", 0),
    saunaTemp:    getNumber(formData, "saunaTemp"),
    waterTemp:    getNumber(formData, "waterTemp"),
    lourou:       formData.get("lourou") || "なし",
    restType:     formData.get("restType") || "外気浴",
    crowding:     formData.get("crowding") || "普通",
    seiri:        migrateSeiriScore(getNumber(formData, "seiri")),
    sets: {
      sauna:   { minutesPerRound: getNumber(formData, "saunaSetMinutes"),   count: getNumber(formData, "saunaSetCount")   },
      water:   { minutesPerRound: getNumber(formData, "waterSetMinutes"),   count: getNumber(formData, "waterSetCount")   },
      outdoor: { minutesPerRound: getNumber(formData, "outdoorSetMinutes"), count: getNumber(formData, "outdoorSetCount") },
    },
    facilityRating: {
      sauna:       getNumber(formData, "rateSauna"),
      water:       getNumber(formData, "rateWater"),
      outdoor:     getNumber(formData, "rateOutdoor"),
      cleanliness: getNumber(formData, "rateClean"),
      flow:        getNumber(formData, "rateFlow"),
    },
    comment:   formData.get("comment").trim(),
    createdAt: existingEntry?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================
// バリデーション
// ============================================================

/** 保存前の入力チェック（日本語でまとめて表示） */
function validateForm() {
  const missing     = [];
  const facilityName = facilityInput.value.trim();

  if (!facilityName)           missing.push("施設名");
  if (!visitDateInput.value)   missing.push("訪問日");
  if (!visitTimeInput.value)   missing.push("訪問時刻");

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

// ============================================================
// フォームに既存記録を流し込む（編集時）
// ============================================================

function fillFormFromEntry(entry) {
  const normalized = normalizeEntry(entry);
  const facility   = getFacilityById(normalized.facilityId);

  editIdInput.value         = normalized.id;
  facilityInput.value       = normalized.facility;
  visitDateInput.value      = normalized.visitDate;
  visitTimeInput.value      = normalized.visitTime;
  document.getElementById("stay-hours").value            = normalized.stayHours;
  document.getElementById("stay-minutes").value          = normalized.stayMinutes;
  document.getElementById("sauna-temp").value            = normalized.saunaTemp;
  document.getElementById("water-temp").value            = normalized.waterTemp;
  document.getElementById("lourou").value                = normalized.lourou   || "なし";
  document.getElementById("restType").value              = normalized.restType || "外気浴";
  document.getElementById("crowding").value              = normalized.crowding || "普通";
  document.getElementById("seiri").value                 = normalized.seiri;

  const sets = normalized.sets;
  document.getElementById("sauna-set-minutes").value     = sets.sauna.minutesPerRound;
  document.getElementById("sauna-set-count").value       = sets.sauna.count;
  document.getElementById("water-set-minutes").value     = sets.water.minutesPerRound;
  document.getElementById("water-set-count").value       = sets.water.count;
  document.getElementById("outdoor-set-minutes").value   = sets.outdoor.minutesPerRound;
  document.getElementById("outdoor-set-count").value     = sets.outdoor.count;

  const r = normalized.facilityRating;
  setRadio("rateSauna",  r.sauna);
  setRadio("rateWater",  r.water);
  setRadio("rateOutdoor", r.outdoor);
  setRadio("rateClean",  r.cleanliness);
  setRadio("rateFlow",   r.flow);
  document.getElementById("comment").value = normalized.comment;

  if (facility) addressInput.value = facility.address || "";
  updateAddressHint();
  setEditMode(true);
}

// ============================================================
// 保存処理
// ============================================================

function saveEntryFromForm() {
  const formData      = new FormData(form);
  const editId        = editIdInput.value;
  const facilityName  = facilityInput.value.trim();
  const address       = addressInput.value || "";

  let logs = loadLogs();
  const existingIndex = editId ? logs.findIndex((e) => e.id === editId) : -1;
  const existingEntry = existingIndex >= 0 ? normalizeEntry(logs[existingIndex]) : null;

  const facility = ensureFacility(facilityName, address);
  const entry    = buildEntryFromForm(formData, existingEntry);
  entry.facilityId = facility.id;
  entry.facility   = facility.name;

  if (existingIndex >= 0) {
    logs[existingIndex] = entry;
  } else {
    logs.push(entry);
  }

  saveLogs(logs);
  cancelEdit();
  showSaveMessage("記録を保存しました。");
}

/** 保存ボタン押下時の処理 */
function handleSaveClick() {
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
    const msg = err && err.message ? err.message : "保存に失敗しました。";
    showSaveMessage(msg, true);
    alert(msg);
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = editIdInput.value ? "変更を保存" : originalText;
  }
}

// ============================================================
// 記録一覧ページから「編集」で来たときの処理
// ============================================================

/**
 * list.html の「編集」ボタンは sessionStorage に編集対象の ID を保存してから
 * index.html へ遷移する。ここでその ID を読み取ってフォームに流し込む。
 */
function checkEditFromStorage() {
  const editId = sessionStorage.getItem("sauna-edit-id");
  if (!editId) return;
  sessionStorage.removeItem("sauna-edit-id"); // 読み取ったら即削除

  const raw = loadLogs().find((e) => e.id === editId);
  if (raw) fillFormFromEntry(normalizeEntry(raw));
}

// ============================================================
// 起動ステータス表示
// ============================================================

function setBootStatus(text, isOk) {
  const el = document.getElementById("boot-status");
  if (!el) return;
  el.textContent = text;
  el.className   = "boot-status " + (isOk ? "boot-status-ok" : "boot-status-error");
}

// ============================================================
// 初期化
// ============================================================

function initApp() {
  if (!window.SaunaStorage || !window.SaunaUtils) {
    setBootStatus("読み込み失敗 — スクリプトの読み込みを確認してください", false);
    alert(
      "プログラムの読み込みに失敗しました。\n" +
        "sauna-log フォルダ内の index.html を開き直してください。"
    );
    return;
  }

  // SaunaStorage の関数を取り出す
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
    getLogsByFacilityId,
  } = window.SaunaStorage);

  // SaunaUtils の関数を取り出す（フォームページで必要なものだけ）
  ({ escapeHtml } = window.SaunaUtils);

  // DOM 要素の参照を取得
  form               = document.getElementById("sauna-form");
  visitDateInput     = document.getElementById("visit-date");
  visitTimeInput     = document.getElementById("visit-time");
  facilityInput      = document.getElementById("facility");
  addressInput       = document.getElementById("facility-address");
  addressHint        = document.getElementById("address-hint");
  facilityStatus     = document.getElementById("facility-status");
  editIdInput        = document.getElementById("edit-id");
  formTitle          = document.getElementById("form-title");
  submitBtn          = document.getElementById("submit-btn");
  cancelEditBtn      = document.getElementById("cancel-edit-btn");
  facilitySuggestions = document.getElementById("facility-suggestions");
  saveMessage        = document.getElementById("save-message");

  if (!form || !submitBtn) {
    alert("画面の読み込みに失敗しました。ページを再読み込みしてください。");
    return;
  }

  // イベントリスナーを登録
  submitBtn.addEventListener("click", handleSaveClick);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSaveClick();
  });
  cancelEditBtn.addEventListener("click", cancelEdit);
  facilityInput.addEventListener("input",  handleFacilityInput);
  facilityInput.addEventListener("change", handleFacilityInput);

  // 初期化処理
  migrateLegacyLogs();
  setDefaultVisitDateTime();
  setDefaultRatingValues();
  updateFacilitySuggestions();
  updateAddressHint();

  // 記録一覧ページから「編集」で来た場合はフォームに内容を入れる
  checkEditFromStorage();

  window.__saunaReady = true;
  setBootStatus("準備完了 — 記録を入力して「記録を保存」を押してください", true);
}

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
