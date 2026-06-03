/**
 * list.js - 記録一覧ページ（list.html）専用
 *
 * localStorage から記録を読み込んで一覧表示します。
 * 「編集」ボタンは sessionStorage に ID を保存してから index.html へ移動します。
 * データの追加・編集は app.js（index.html）が担当します。
 */
(function () {
"use strict";

// ---- DOM 要素の参照 ----
let logList;
let emptyMessage;
let noResultMessage;
let totalVisitsEl;
let searchInput;
let sortBySelect;
let sortOrderSelect;
let exportBtn;
let importBtn;
let importFileInput;
let listMessage;

// ---- SaunaStorage から使う関数 ----
let loadLogs;
let saveLogs;
let normalizeEntry;
let migrateLegacyLogs;

// ---- SaunaUtils から使う関数 ----
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

// ============================================================
// 合計訪問回数の更新
// ============================================================

function updateTotalVisits() {
  if (totalVisitsEl) totalVisitsEl.textContent = String(loadLogs().length);
}

// ============================================================
// メッセージ表示（インポート結果など）
// ============================================================

function showListMessage(text, isError = false) {
  listMessage.textContent = text;
  listMessage.classList.remove("hidden", "save-message-error", "save-message-success");
  listMessage.classList.add(isError ? "save-message-error" : "save-message-success");
}

// ============================================================
// 記録カードの生成
// ============================================================

/**
 * 施設評価の1行分 HTML（ラベルと星評価を横並び）
 */
function ratingRowHtml(label, value) {
  return `
    <div class="rating-row">
      <span>${escapeHtml(label)}</span>
      <span class="rate-stars" title="${value}/5">${toStars(value)}</span>
    </div>
  `;
}

/**
 * 1件の記録カード（li 要素）を作って返す
 * 「編集」ボタンは sessionStorage に ID を保存して index.html へ移動する
 */
function createLogItemElement(rawEntry) {
  const entry   = normalizeEntry(rawEntry);
  const address = getEntryAddress(entry);
  const ratings = entry.facilityRating;
  const sets    = entry.sets;

  const li = document.createElement("li");
  li.className  = "log-item";
  li.dataset.id = entry.id;

  li.innerHTML = `
    <div class="log-item-header">
      <h3>${escapeHtml(entry.facility)}</h3>
      <span class="log-visit-date">${escapeHtml(formatVisitDateTime(entry))}</span>
    </div>
    ${address ? `<p class="log-address">📍 ${escapeHtml(address)}</p>` : ""}
    <div class="log-meta">
      <span class="meta-chip">滞在 ${escapeHtml(formatStayDuration(entry.stayHours, entry.stayMinutes))}</span>
      <span class="meta-chip">混雑 ${escapeHtml(entry.crowding || "普通")}</span>
      <span class="meta-chip">サウナ ${escapeHtml(String(entry.saunaTemp))}℃</span>
      <span class="meta-chip">水風呂 ${escapeHtml(String(entry.waterTemp))}℃</span>
      ${entry.lourou && entry.lourou !== "なし"
        ? `<span class="meta-chip">ロウリュ ${escapeHtml(entry.lourou)}</span>`
        : ""}
      <span class="meta-chip">${escapeHtml(entry.restType || "外気浴")}</span>
      <span class="meta-chip seiri-score">整い ${escapeHtml(formatSeiriScore(entry.seiri))}</span>
    </div>
    <details class="log-details">
      <summary>セット・施設評価の詳細</summary>
      <div class="log-details-body">
        <div class="detail-section">
          <h4>セット記録</h4>
          <ul class="detail-list">
            <li>${escapeHtml(formatSetLine(sets.sauna,   "サウナ"))}</li>
            <li>${escapeHtml(formatSetLine(sets.water,   "水風呂"))}</li>
            <li>${escapeHtml(formatSetLine(sets.outdoor, "休憩"))}</li>
          </ul>
        </div>
        <div class="detail-section">
          <h4>施設の評価</h4>
          ${ratingRowHtml("サウナ",  ratings.sauna)}
          ${ratingRowHtml("水風呂",  ratings.water)}
          ${ratingRowHtml("外気浴",  ratings.outdoor)}
          ${ratingRowHtml("清潔感",  ratings.cleanliness)}
          ${ratingRowHtml("動線",    ratings.flow)}
        </div>
      </div>
    </details>
    ${entry.comment ? `<p class="log-comment">${escapeHtml(entry.comment)}</p>` : ""}
    <p class="log-saved-at">登録: ${escapeHtml(formatSavedAt(entry.createdAt))}</p>
    <div class="log-actions">
      <button type="button" class="btn-edit">編集</button>
      <button type="button" class="btn-delete">削除</button>
    </div>
  `;

  // 「編集」ボタン：sessionStorage に ID を保存して記録追加ページへ移動
  li.querySelector(".btn-edit").addEventListener("click", () => {
    sessionStorage.setItem("sauna-edit-id", entry.id);
    window.location.href = "index.html";
  });

  // 「削除」ボタン
  li.querySelector(".btn-delete").addEventListener("click", () => deleteLog(entry.id));

  return li;
}

// ============================================================
// 記録の削除
// ============================================================

function deleteLog(id) {
  if (!confirm("この記録を削除しますか？")) return;
  saveLogs(loadLogs().filter((e) => e.id !== id));

  // ログイン中は Firestore からも削除する
  const uid = window.SaunaAuth && window.SaunaAuth.uid;
  if (uid && window.SaunaCloud) {
    window.SaunaCloud.deleteEntryFromCloud(uid, id)
      .catch((err) => console.error("[SaunaCloud] 削除エラー:", err));
  }

  renderLogs();
}

// ============================================================
// 記録一覧の描画
// ============================================================

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

// ============================================================
// エクスポート / インポート
// ============================================================

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
      renderLogs();
      showListMessage("インポートが完了しました。");
    } catch (err) {
      const msg = err && err.message ? err.message : "インポートに失敗しました。";
      showListMessage(msg, true);
      alert(msg);
    } finally {
      importFileInput.value = "";
    }
  };
  reader.readAsText(file, "utf-8");
}

// ============================================================
// 初期化
// ============================================================

function initList() {
  if (!window.SaunaStorage || !window.SaunaUtils) {
    alert("プログラムの読み込みに失敗しました。ページを再読み込みしてください。");
    return;
  }

  // SaunaStorage の関数を取り出す
  ({
    loadLogs,
    saveLogs,
    normalizeEntry,
    migrateLegacyLogs,
  } = window.SaunaStorage);

  // SaunaUtils の関数を取り出す
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

  // DOM 要素の参照を取得
  logList         = document.getElementById("log-list");
  emptyMessage    = document.getElementById("empty-message");
  noResultMessage = document.getElementById("no-result-message");
  totalVisitsEl   = document.getElementById("total-visits");
  searchInput     = document.getElementById("search-input");
  sortBySelect    = document.getElementById("sort-by");
  sortOrderSelect = document.getElementById("sort-order");
  exportBtn       = document.getElementById("export-btn");
  importBtn       = document.getElementById("import-btn");
  importFileInput = document.getElementById("import-file");
  listMessage     = document.getElementById("list-message");

  // イベントリスナーを登録
  if (exportBtn) exportBtn.addEventListener("click", handleExport);
  if (importBtn) importBtn.addEventListener("click", () => importFileInput.click());
  if (importFileInput) {
    importFileInput.addEventListener("change", (e) => handleImportFile(e.target.files[0]));
  }
  searchInput.addEventListener("input",  renderLogs);
  sortBySelect.addEventListener("change",  renderLogs);
  sortOrderSelect.addEventListener("change", renderLogs);

  // 初回描画
  migrateLegacyLogs();
  renderLogs();

  // Firestore 同期完了後に一覧を再描画する
  window.addEventListener("sauna-data-updated", () => {
    renderLogs();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initList);
} else {
  initList();
}

})();
