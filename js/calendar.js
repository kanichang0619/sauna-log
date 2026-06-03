/**
 * calendar.js - カレンダーページの処理
 *
 * localStorage に保存されたサウナ記録を読み込み、
 * 月ごとのカレンダーに訪問日を表示します。
 * サウナに行った日はオレンジ色でハイライトされます。
 * 日付をクリックすると、その日の記録一覧が下に表示されます。
 */

// ============================================================
// 現在表示している年・月を管理する変数
// JavaScript の月は 0 始まり（0=1月、11=12月）なので注意
// ============================================================
let currentYear;
let currentMonth;

// ============================================================
// DOM 要素の参照（HTML の id と紐付ける）
// ============================================================
const calendarGrid     = document.getElementById("calendar-grid");
const calendarTitle    = document.getElementById("calendar-title");
const calendarEmpty    = document.getElementById("calendar-empty");
const prevMonthBtn     = document.getElementById("prev-month-btn");
const nextMonthBtn     = document.getElementById("next-month-btn");
const dayRecordsSection = document.getElementById("day-records-section");
const dayRecordsTitle  = document.getElementById("day-records-title");
const dayRecordsList   = document.getElementById("day-records-list");

// ============================================================
// カレンダー描画
// ============================================================

/**
 * 指定した年・月のカレンダーを画面に描画する
 *
 * @param {number} year  - 西暦年（例: 2024）
 * @param {number} month - 月（0始まり: 0=1月, 11=12月）
 */
function renderCalendar(year, month) {
  // タイトルを「2024年6月」の形式で更新
  calendarTitle.textContent = `${year}年${month + 1}月`;

  // この月のサウナ記録を「日付文字列 → 記録配列」の形にまとめる
  const visitMap = buildVisitMap(year, month);
  const hasAnyVisit = Object.keys(visitMap).length > 0;

  // 記録なしメッセージの表示切替
  calendarEmpty.classList.toggle("hidden", hasAnyVisit);

  // ---- グリッドをリセット（曜日ヘッダー7個だけ残して日付セルを全削除）----
  calendarGrid.querySelectorAll(".cal-day").forEach((cell) => cell.remove());

  // この月の1日が何曜日か（0=日曜、6=土曜）
  const firstWeekday = new Date(year, month, 1).getDay();

  // この月が何日まであるか（翌月0日 ＝ この月の最終日）
  const lastDate = new Date(year, month + 1, 0).getDate();

  // 今日の日付（「今日」を強調するために使う）
  const today = new Date();

  // ---- 月初の空白セルを追加（例: 水曜始まりなら3つ空白が必要）----
  for (let i = 0; i < firstWeekday; i++) {
    const blank = document.createElement("div");
    blank.className = "cal-day cal-day-blank";
    calendarGrid.appendChild(blank);
  }

  // ---- 日付セルを1日から最終日まで追加 ----
  for (let d = 1; d <= lastDate; d++) {
    // "YYYY-MM-DD" 形式の文字列を作る（visitMap のキーと合わせる）
    const dateStr = toDateStr(year, month + 1, d);

    // この日の記録一覧（なければ空配列）
    const records = visitMap[dateStr] || [];
    const hasVisit = records.length > 0;

    // この日が今日かどうか
    const isToday =
      today.getFullYear() === year &&
      today.getMonth()    === month &&
      today.getDate()     === d;

    // 曜日を計算（0=日曜、6=土曜）
    const weekday = (firstWeekday + d - 1) % 7;

    // セル要素を作成して CSS クラスを設定
    const cell = document.createElement("div");
    cell.className = "cal-day";
    if (hasVisit) cell.classList.add("cal-day-visited"); // サウナに行った日
    if (isToday)  cell.classList.add("cal-day-today");   // 今日
    if (weekday === 0) cell.classList.add("cal-sun");    // 日曜
    if (weekday === 6) cell.classList.add("cal-sat");    // 土曜

    // セルの中身：日付の数字 ＋ 訪問件数バッジ（2件以上のとき）
    cell.innerHTML = `
      <span class="cal-day-num">${d}</span>
      ${hasVisit ? `<span class="cal-visit-badge">${records.length}</span>` : ""}
    `;

    // サウナに行った日だけクリックできるようにする
    if (hasVisit) {
      cell.setAttribute("role", "button");
      cell.setAttribute("tabindex", "0");
      cell.setAttribute(
        "aria-label",
        `${month + 1}月${d}日 ${records.length}件の記録を表示`
      );
      // クリックでその日の記録を表示
      cell.addEventListener("click", () => showDayRecords(dateStr, records));
      // キーボード操作（Enter / Space）でも同じ動作をさせる
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          showDayRecords(dateStr, records);
        }
      });
    }

    calendarGrid.appendChild(cell);
  }

  // 月を切り替えたら選択中の日付記録を非表示にする
  hideDayRecords();
}

// ============================================================
// データ処理
// ============================================================

/**
 * 指定した年・月の記録を「日付文字列 → 記録の配列」の形にまとめて返す
 *
 * @param {number} year
 * @param {number} month - 0始まり
 * @returns {Object} 例: { "2024-06-15": [entry1, entry2], ... }
 */
function buildVisitMap(year, month) {
  // localStorage から全記録を読み込む
  const allLogs = window.SaunaStorage.loadLogs();
  const map = {};

  allLogs.forEach((raw) => {
    // 古いデータ形式を最新形式に揃える
    const entry = window.SaunaStorage.normalizeEntry(raw);
    if (!entry.visitDate) return; // 訪問日がない記録はスキップ

    // この月の記録だけ処理する
    const [y, m] = entry.visitDate.split("-").map(Number);
    if (y !== year || m !== month + 1) return;

    // 同じ日に複数記録がある場合は配列に追加していく
    if (!map[entry.visitDate]) map[entry.visitDate] = [];
    map[entry.visitDate].push(entry);
  });

  return map;
}

/**
 * 年・月・日を "YYYY-MM-DD" 形式の文字列に変換する
 * （月・日は必ず2桁にゼロ埋めする）
 *
 * @param {number} year
 * @param {number} month - 1始まり
 * @param {number} day
 * @returns {string} 例: "2024-06-05"
 */
function toDateStr(year, month, day) {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

// ============================================================
// 記録一覧の表示・非表示
// ============================================================

/**
 * 選択した日の記録一覧を画面下に表示する
 *
 * @param {string} dateStr - "YYYY-MM-DD" 形式
 * @param {Array}  records - その日の記録オブジェクトの配列
 */
function showDayRecords(dateStr, records) {
  const [y, m, d] = dateStr.split("-").map(Number);
  dayRecordsTitle.textContent =
    `${y}年${m}月${d}日の記録（${records.length}件）`;

  // リストをリセットしてから追加
  dayRecordsList.innerHTML = "";
  records.forEach((entry) => {
    dayRecordsList.appendChild(createDayRecordItem(entry));
  });

  // セクションを表示してスクロール
  dayRecordsSection.classList.remove("hidden");
  dayRecordsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * 選択した日の記録一覧を非表示にする（月移動時などに呼ぶ）
 */
function hideDayRecords() {
  dayRecordsSection.classList.add("hidden");
  dayRecordsList.innerHTML = "";
}

// ============================================================
// 記録カードの生成
// ============================================================

/**
 * 1件の記録カード（li 要素）を作って返す
 * 記録ページの createLogItemElement を参考にした簡易版
 *
 * @param {Object} entry - normalizeEntry 済みの記録オブジェクト
 * @returns {HTMLLIElement}
 */
function createDayRecordItem(entry) {
  // utils.js の関数を使う（escapeHtml などは window.SaunaUtils 経由）
  const {
    escapeHtml,
    formatStayDuration,
    formatSeiriScore,
    formatSetLine,
    getEntryAddress,
  } = window.SaunaUtils;

  const address  = getEntryAddress(entry);
  const ratings  = entry.facilityRating;
  const sets     = entry.sets;

  const li = document.createElement("li");
  li.className = "log-item";

  li.innerHTML = `
    <div class="log-item-header">
      <h3>${escapeHtml(entry.facility)}</h3>
      <span class="log-visit-date">${escapeHtml(entry.visitTime || "")}</span>
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
          ${ratingRowHtml("サウナ",   ratings.sauna)}
          ${ratingRowHtml("水風呂",   ratings.water)}
          ${ratingRowHtml("外気浴",   ratings.outdoor)}
          ${ratingRowHtml("清潔感",   ratings.cleanliness)}
          ${ratingRowHtml("動線",     ratings.flow)}
        </div>
      </div>
    </details>
    ${entry.comment
      ? `<p class="log-comment">${escapeHtml(entry.comment)}</p>`
      : ""}
  `;

  return li;
}

/**
 * 施設評価の1行分の HTML を返す（ラベルと星評価を横並びにする）
 *
 * @param {string} label - 評価項目名（例: "サウナ"）
 * @param {number} value - 1〜5 の評価値
 * @returns {string} HTML 文字列
 */
function ratingRowHtml(label, value) {
  const { escapeHtml, toStars } = window.SaunaUtils;
  return `
    <div class="rating-row">
      <span>${escapeHtml(label)}</span>
      <span class="rate-stars" title="${value}/5">${toStars(value)}</span>
    </div>
  `;
}

// ============================================================
// 月移動ボタンのイベント
// ============================================================

/**
 * 「前月」ボタン：1月より前に戻ろうとしたら前年の12月に移動する
 */
prevMonthBtn.addEventListener("click", () => {
  currentMonth--;
  if (currentMonth < 0) {
    currentMonth = 11; // 12月
    currentYear--;
  }
  renderCalendar(currentYear, currentMonth);
});

/**
 * 「次月」ボタン：12月より後に進もうとしたら翌年の1月に移動する
 */
nextMonthBtn.addEventListener("click", () => {
  currentMonth++;
  if (currentMonth > 11) {
    currentMonth = 0; // 1月
    currentYear++;
  }
  renderCalendar(currentYear, currentMonth);
});

// ============================================================
// 初期表示：ページを開いたら今月のカレンダーを表示する
// ============================================================
const _now = new Date();
currentYear  = _now.getFullYear();
currentMonth = _now.getMonth(); // 0始まり
renderCalendar(currentYear, currentMonth);

// Firestore 同期完了後にカレンダーを再描画する
window.addEventListener("sauna-data-updated", () => {
  renderCalendar(currentYear, currentMonth);
});
