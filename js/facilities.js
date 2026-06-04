/**
 * facilities.js - 施設一覧ページ（facilities.html）専用
 *
 * 訪問記録に紐づく施設を一覧表示し、施設名・住所の編集を提供します。
 * 施設名を変更した場合は、紐づくすべての訪問記録にも反映されます。
 */
(function () {
"use strict";

// ---- DOM 要素 ----
let facilityList;
let emptyMessage;
let noResultMessage;
let facilityCountEl;
let searchInput;
let sortBySelect;
let sortOrderSelect;

// ---- モーダル ----
let modal;
let modalFacilityName;
let modalClose;
let detailView;
let detailAddress;
let detailVisits;
let detailLastVisit;
let modalEditBtn;
let editView;
let editFacilityName;
let editFacilityAddress;
let saveFacilityBtn;
let cancelEditBtn;
let editMessage;

// 現在モーダルで開いている施設 ID
let currentFacilityId = null;

// SaunaStorage の関数
let loadLogs;
let loadFacilities;
let normalizeEntry;
let updateFacility;
let migrateLegacyLogs;

// SaunaUtils の関数
let escapeHtml;

// ============================================================
// データ処理
// ============================================================

/**
 * 施設マスタに訪問回数・最終訪問日を付加して返す
 */
function getFacilitiesWithStats() {
  const facilities = loadFacilities();
  const logs = loadLogs().map(normalizeEntry);

  const statsById = {};
  logs.forEach((log) => {
    if (!log.facilityId) return;
    if (!statsById[log.facilityId]) {
      statsById[log.facilityId] = { count: 0, lastDate: "" };
    }
    statsById[log.facilityId].count++;
    if (!statsById[log.facilityId].lastDate || log.visitDate > statsById[log.facilityId].lastDate) {
      statsById[log.facilityId].lastDate = log.visitDate;
    }
  });

  return Object.values(facilities).map((f) => ({
    ...f,
    visitCount: statsById[f.id]?.count || 0,
    lastVisitDate: statsById[f.id]?.lastDate || "",
  }));
}

function filterFacilities(list, query) {
  if (!query.trim()) return list;
  const q = query.trim().toLowerCase();
  return list.filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      (f.address || "").toLowerCase().includes(q)
  );
}

function sortFacilities(list, by, order) {
  return [...list].sort((a, b) => {
    let av, bv;
    if (by === "address") {
      av = (a.address || "").toLowerCase();
      bv = (b.address || "").toLowerCase();
    } else if (by === "visits") {
      av = a.visitCount;
      bv = b.visitCount;
    } else if (by === "lastVisit") {
      av = a.lastVisitDate || "";
      bv = b.lastVisitDate || "";
    } else {
      av = a.name.toLowerCase();
      bv = b.name.toLowerCase();
    }
    if (av < bv) return order === "asc" ? -1 : 1;
    if (av > bv) return order === "asc" ? 1 : -1;
    return 0;
  });
}

// ============================================================
// 描画
// ============================================================

function renderFacilities() {
  const allFacilities = getFacilitiesWithStats();
  // 訪問記録が1件以上ある施設のみ表示
  const visited = allFacilities.filter((f) => f.visitCount > 0);

  if (facilityCountEl) facilityCountEl.textContent = String(visited.length);

  facilityList.innerHTML = "";

  if (visited.length === 0) {
    emptyMessage.classList.remove("hidden");
    noResultMessage.classList.add("hidden");
    return;
  }
  emptyMessage.classList.add("hidden");

  const filtered = filterFacilities(visited, searchInput.value);
  const sorted = sortFacilities(filtered, sortBySelect.value, sortOrderSelect.value);

  if (sorted.length === 0) {
    noResultMessage.classList.remove("hidden");
    return;
  }
  noResultMessage.classList.add("hidden");

  sorted.forEach((facility) => {
    facilityList.appendChild(createFacilityItemElement(facility));
  });
}

function formatLastVisit(dateStr) {
  if (!dateStr) return "";
  // "YYYY-MM-DD" → "YYYY年MM月DD日"
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr;
  return `${m[1]}年${parseInt(m[2], 10)}月${parseInt(m[3], 10)}日`;
}

function createFacilityItemElement(facility) {
  const li = document.createElement("li");
  li.className = "facility-item";

  const lastVisitText = facility.lastVisitDate
    ? `最終訪問: ${formatLastVisit(facility.lastVisitDate)}`
    : "";

  li.innerHTML = `
    <button type="button" class="facility-card-btn">
      <div class="facility-card-header">
        <span class="facility-card-name">${escapeHtml(facility.name)}</span>
        <span class="facility-visit-badge">${facility.visitCount}回</span>
      </div>
      ${facility.address
        ? `<p class="facility-card-address">📍 ${escapeHtml(facility.address)}</p>`
        : `<p class="facility-card-address facility-no-address">住所未登録</p>`}
      ${lastVisitText
        ? `<p class="facility-card-last">${escapeHtml(lastVisitText)}</p>`
        : ""}
    </button>
  `;

  li.querySelector(".facility-card-btn").addEventListener("click", () => {
    openModal(facility.id);
  });

  return li;
}

// ============================================================
// モーダル
// ============================================================

function openModal(facilityId) {
  const allFacilities = getFacilitiesWithStats();
  const facility = allFacilities.find((f) => f.id === facilityId);
  if (!facility) return;

  currentFacilityId = facilityId;
  showDetailView(facility);
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.classList.add("hidden");
  document.body.style.overflow = "";
  currentFacilityId = null;
}

function showDetailView(facility) {
  modalFacilityName.textContent = facility.name;

  if (facility.address) {
    detailAddress.textContent = `📍 ${facility.address}`;
    detailAddress.classList.remove("facility-no-address");
  } else {
    detailAddress.textContent = "住所未登録";
    detailAddress.classList.add("facility-no-address");
  }

  detailVisits.textContent = `訪問 ${facility.visitCount}回`;

  if (facility.lastVisitDate) {
    detailLastVisit.textContent = `最終訪問: ${formatLastVisit(facility.lastVisitDate)}`;
    detailLastVisit.classList.remove("hidden");
  } else {
    detailLastVisit.classList.add("hidden");
  }

  detailView.classList.remove("hidden");
  editView.classList.add("hidden");
  editMessage.classList.add("hidden");
}

function showEditView(facility) {
  editFacilityName.value = facility.name;
  editFacilityAddress.value = facility.address || "";
  editMessage.classList.add("hidden");
  detailView.classList.add("hidden");
  editView.classList.remove("hidden");
  editFacilityName.focus();
}

function handleSave() {
  if (!currentFacilityId) return;

  const newName = editFacilityName.value.trim();
  const newAddress = editFacilityAddress.value.trim();

  if (!newName) {
    showEditMessage("施設名は必須です。", true);
    return;
  }

  const updated = updateFacility(currentFacilityId, { name: newName, address: newAddress });
  if (!updated) {
    showEditMessage("施設情報の更新に失敗しました。", true);
    return;
  }

  // 一覧を再描画してモーダルを閉じる
  renderFacilities();
  closeModal();

  // Firestore 同期（ログイン中の場合）
  const uid = window.SaunaAuth && window.SaunaAuth.uid;
  if (uid && window.SaunaCloud && window.SaunaCloud.syncFacilitiesToCloud) {
    window.SaunaCloud.syncFacilitiesToCloud(uid).catch(() => {});
  }
}

function showEditMessage(text, isError) {
  editMessage.textContent = text;
  editMessage.classList.remove("hidden", "save-message-error", "save-message-success");
  editMessage.classList.add(isError ? "save-message-error" : "save-message-success");
}

// ============================================================
// 初期化
// ============================================================

function initFacilities() {
  if (!window.SaunaStorage || !window.SaunaUtils) {
    alert("プログラムの読み込みに失敗しました。ページを再読み込みしてください。");
    return;
  }

  ({
    loadLogs,
    loadFacilities,
    normalizeEntry,
    updateFacility,
    migrateLegacyLogs,
  } = window.SaunaStorage);

  ({ escapeHtml } = window.SaunaUtils);

  // DOM 参照
  facilityList     = document.getElementById("facility-list");
  emptyMessage     = document.getElementById("empty-message");
  noResultMessage  = document.getElementById("no-result-message");
  facilityCountEl  = document.getElementById("facility-count");
  searchInput      = document.getElementById("search-input");
  sortBySelect     = document.getElementById("sort-by");
  sortOrderSelect  = document.getElementById("sort-order");

  modal              = document.getElementById("facility-modal");
  modalFacilityName  = document.getElementById("modal-facility-name");
  modalClose         = document.getElementById("modal-close");
  detailView         = document.getElementById("modal-detail-view");
  detailAddress      = document.getElementById("detail-address");
  detailVisits       = document.getElementById("detail-visits");
  detailLastVisit    = document.getElementById("detail-last-visit");
  modalEditBtn       = document.getElementById("modal-edit-btn");
  editView           = document.getElementById("modal-edit-view");
  editFacilityName   = document.getElementById("edit-facility-name");
  editFacilityAddress = document.getElementById("edit-facility-address");
  saveFacilityBtn    = document.getElementById("save-facility-btn");
  cancelEditBtn      = document.getElementById("cancel-edit-btn");
  editMessage        = document.getElementById("edit-message");

  // イベントリスナー
  searchInput.addEventListener("input", renderFacilities);
  sortBySelect.addEventListener("change", renderFacilities);
  sortOrderSelect.addEventListener("change", renderFacilities);

  modalClose.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  modalEditBtn.addEventListener("click", () => {
    const allFacilities = getFacilitiesWithStats();
    const facility = allFacilities.find((f) => f.id === currentFacilityId);
    if (facility) showEditView(facility);
  });

  cancelEditBtn.addEventListener("click", () => {
    const allFacilities = getFacilitiesWithStats();
    const facility = allFacilities.find((f) => f.id === currentFacilityId);
    if (facility) showDetailView(facility);
  });

  saveFacilityBtn.addEventListener("click", handleSave);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });

  migrateLegacyLogs();
  renderFacilities();

  window.addEventListener("sauna-data-updated", renderFacilities);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFacilities);
} else {
  initFacilities();
}

})();
