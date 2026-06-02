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
