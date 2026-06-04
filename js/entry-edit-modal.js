/**
 * entry-edit-modal.js
 *
 * 記録一覧・カレンダーページで使う記録編集モーダルを提供します。
 * DOM に自動挿入し、window.SaunaEntryModal.open(entryId, onSaved) で開きます。
 */
(function () {
"use strict";

const MODAL_ID = "entry-edit-modal";

// DOM refs（init 後に代入）
let modal, emClose;
let emFacilityName, emFacilityAddress, emSaunaTempLabel, emWaterTempLabel, emLourouLabel, emRestTypeLabel;
let emVisitDate, emVisitTime, emStayHours, emStayMinutes, emCrowding, emSeiri;
let emSaunaSetMinutes, emSaunaSetCount, emWaterSetMinutes, emWaterSetCount;
let emOutdoorSetMinutes, emOutdoorSetCount;
let emComment, emSaveBtn, emCancelBtn, emSaveMessage, emForm;

// 状態
let currentEntryId  = null;
let onSavedCallback = null;

// ============================================================
// モーダル HTML の生成・挿入
// ============================================================

function ratingGroupHtml(name) {
  return [1, 2, 3, 4, 5]
    .map((v) => `<label class="rating-label"><input type="radio" name="${name}" value="${v}"${v === 3 ? " checked" : ""}> ${v}</label>`)
    .join("");
}

function buildModalHtml() {
  return `
<div id="${MODAL_ID}" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-label="記録を編集">
  <div class="modal-content">
    <div class="modal-header">
      <h3 class="modal-title">記録を編集</h3>
      <button type="button" id="em-close" class="btn-modal-close" aria-label="閉じる">✕</button>
    </div>

    <!-- 施設情報（読み取り専用） -->
    <dl class="facility-detail-list">
      <div class="facility-detail-row"><dt>施設名</dt><dd id="em-facility-name"></dd></div>
      <div class="facility-detail-row"><dt>住所</dt><dd id="em-facility-address"></dd></div>
      <div class="facility-detail-row"><dt>サウナ温度</dt><dd id="em-sauna-temp-label"></dd></div>
      <div class="facility-detail-row"><dt>水風呂温度</dt><dd id="em-water-temp-label"></dd></div>
      <div class="facility-detail-row"><dt>ロウリュ</dt><dd id="em-lourou-label"></dd></div>
      <div class="facility-detail-row"><dt>休憩タイプ</dt><dd id="em-rest-type-label"></dd></div>
    </dl>
    <p class="hint facility-lock-msg" style="margin-bottom:1rem">施設情報は「施設一覧」から変更できます。</p>

    <!-- 編集フォーム -->
    <form id="em-form" novalidate>

      <fieldset class="fieldset">
        <legend>訪問情報</legend>

        <div class="form-row">
          <div class="form-group">
            <label for="em-visit-date">訪問日</label>
            <input type="date" id="em-visit-date" name="visitDate" required>
          </div>
          <div class="form-group">
            <label for="em-visit-time">訪問時刻</label>
            <input type="time" id="em-visit-time" name="visitTime" required>
          </div>
        </div>

        <div class="form-group">
          <span class="label-text">滞在時間</span>
          <div class="inline-inputs">
            <div class="inline-field">
              <input type="number" id="em-stay-hours" name="stayHours" min="0" max="24" value="1">
              <span class="unit">時間</span>
            </div>
            <div class="inline-field">
              <input type="number" id="em-stay-minutes" name="stayMinutes" min="0" max="59" value="0">
              <span class="unit">分</span>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label for="em-crowding">混雑度</label>
          <select id="em-crowding" name="crowding">
            <option value="空いてる">空いてる</option>
            <option value="普通">普通</option>
            <option value="混んでる">混んでる</option>
          </select>
        </div>

        <div class="form-group">
          <label for="em-seiri">整い度（100点満点）</label>
          <input type="number" id="em-seiri" name="seiri" min="0" max="100" value="80">
          <p class="hint">0〜100の整数で入力（100が最高）</p>
        </div>
      </fieldset>

      <fieldset class="fieldset">
        <legend>セット記録</legend>
        <p class="fieldset-desc">各項目の「1回あたりの時間」と「回数」</p>

        <div class="set-block">
          <h3 class="set-title">🔥 サウナ</h3>
          <div class="set-inputs">
            <div class="form-group">
              <label for="em-sauna-set-minutes">1回の時間（分）</label>
              <input type="number" id="em-sauna-set-minutes" min="1" max="60" value="8">
            </div>
            <div class="form-group">
              <label for="em-sauna-set-count">回数</label>
              <input type="number" id="em-sauna-set-count" min="0" max="20" value="3">
            </div>
          </div>
        </div>

        <div class="set-block">
          <h3 class="set-title">💧 水風呂</h3>
          <div class="set-inputs">
            <div class="form-group">
              <label for="em-water-set-minutes">1回の時間（分）</label>
              <input type="number" id="em-water-set-minutes" min="1" max="30" value="1">
            </div>
            <div class="form-group">
              <label for="em-water-set-count">回数</label>
              <input type="number" id="em-water-set-count" min="0" max="20" value="3">
            </div>
          </div>
        </div>

        <div class="set-block">
          <h3 class="set-title">🌬️ 休憩</h3>
          <div class="set-inputs">
            <div class="form-group">
              <label for="em-outdoor-set-minutes">1回の時間（分）</label>
              <input type="number" id="em-outdoor-set-minutes" min="1" max="60" value="5">
            </div>
            <div class="form-group">
              <label for="em-outdoor-set-count">回数</label>
              <input type="number" id="em-outdoor-set-count" min="0" max="20" value="3">
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset class="fieldset">
        <legend>施設の評価（1〜5）</legend>
        <p class="fieldset-desc">5が最高評価です</p>

        <div class="form-group">
          <span class="label-text">サウナ</span>
          <div class="rating-group">${ratingGroupHtml("em-rateSauna")}</div>
        </div>
        <div class="form-group">
          <span class="label-text">水風呂</span>
          <div class="rating-group">${ratingGroupHtml("em-rateWater")}</div>
        </div>
        <div class="form-group">
          <span class="label-text">外気浴</span>
          <div class="rating-group">${ratingGroupHtml("em-rateOutdoor")}</div>
        </div>
        <div class="form-group">
          <span class="label-text">清潔感</span>
          <div class="rating-group">${ratingGroupHtml("em-rateClean")}</div>
        </div>
        <div class="form-group">
          <span class="label-text">動線</span>
          <div class="rating-group">${ratingGroupHtml("em-rateFlow")}</div>
        </div>
      </fieldset>

      <div class="form-group">
        <label for="em-comment">感想</label>
        <textarea id="em-comment" name="comment" rows="4" placeholder="今日のサウナの感想を書いてみよう（任意）"></textarea>
      </div>

      <p id="em-save-message" class="save-message hidden" role="status"></p>
      <div class="form-actions">
        <button type="button" id="em-save-btn" class="btn-primary">変更を保存</button>
        <button type="button" id="em-cancel-btn" class="btn-secondary">キャンセル</button>
      </div>
    </form>
  </div>
</div>`;
}

function injectModal() {
  if (document.getElementById(MODAL_ID)) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = buildModalHtml();
  document.body.appendChild(wrapper.firstElementChild);
}

// ============================================================
// DOM refs バインド
// ============================================================

function bindDomRefs() {
  modal                = document.getElementById(MODAL_ID);
  emClose              = document.getElementById("em-close");
  emForm               = document.getElementById("em-form");
  emFacilityName       = document.getElementById("em-facility-name");
  emFacilityAddress    = document.getElementById("em-facility-address");
  emSaunaTempLabel     = document.getElementById("em-sauna-temp-label");
  emWaterTempLabel     = document.getElementById("em-water-temp-label");
  emLourouLabel        = document.getElementById("em-lourou-label");
  emRestTypeLabel      = document.getElementById("em-rest-type-label");
  emVisitDate          = document.getElementById("em-visit-date");
  emVisitTime          = document.getElementById("em-visit-time");
  emStayHours          = document.getElementById("em-stay-hours");
  emStayMinutes        = document.getElementById("em-stay-minutes");
  emCrowding           = document.getElementById("em-crowding");
  emSeiri              = document.getElementById("em-seiri");
  emSaunaSetMinutes    = document.getElementById("em-sauna-set-minutes");
  emSaunaSetCount      = document.getElementById("em-sauna-set-count");
  emWaterSetMinutes    = document.getElementById("em-water-set-minutes");
  emWaterSetCount      = document.getElementById("em-water-set-count");
  emOutdoorSetMinutes  = document.getElementById("em-outdoor-set-minutes");
  emOutdoorSetCount    = document.getElementById("em-outdoor-set-count");
  emComment            = document.getElementById("em-comment");
  emSaveBtn            = document.getElementById("em-save-btn");
  emCancelBtn          = document.getElementById("em-cancel-btn");
  emSaveMessage        = document.getElementById("em-save-message");
}

// ============================================================
// モーダル操作
// ============================================================

function setRadio(name, value) {
  const radio = emForm.querySelector(`input[name="${name}"][value="${value}"]`);
  if (radio) radio.checked = true;
}

function getRadioValue(name) {
  const radio = emForm.querySelector(`input[name="${name}"]:checked`);
  return radio ? Number(radio.value) : 3;
}

function fillForm(entry) {
  const address = window.SaunaUtils.getEntryAddress(entry);

  emFacilityName.textContent    = entry.facility || "";
  emFacilityAddress.textContent = address        || "未登録";
  emSaunaTempLabel.textContent  = entry.saunaTemp != null ? `${entry.saunaTemp}℃` : "—";
  emWaterTempLabel.textContent  = entry.waterTemp != null ? `${entry.waterTemp}℃` : "—";
  emLourouLabel.textContent     = entry.lourou   || "なし";
  emRestTypeLabel.textContent   = entry.restType || "外気浴";

  emVisitDate.value   = entry.visitDate   || "";
  emVisitTime.value   = entry.visitTime   || "";
  emStayHours.value   = String(entry.stayHours  ?? 0);
  emStayMinutes.value = String(entry.stayMinutes ?? 0);
  emCrowding.value    = entry.crowding    || "普通";
  emSeiri.value       = String(entry.seiri ?? 80);

  const sets = entry.sets;
  emSaunaSetMinutes.value   = String(sets.sauna.minutesPerRound);
  emSaunaSetCount.value     = String(sets.sauna.count);
  emWaterSetMinutes.value   = String(sets.water.minutesPerRound);
  emWaterSetCount.value     = String(sets.water.count);
  emOutdoorSetMinutes.value = String(sets.outdoor.minutesPerRound);
  emOutdoorSetCount.value   = String(sets.outdoor.count);

  const r = entry.facilityRating;
  setRadio("em-rateSauna",   r.sauna);
  setRadio("em-rateWater",   r.water);
  setRadio("em-rateOutdoor", r.outdoor);
  setRadio("em-rateClean",   r.cleanliness);
  setRadio("em-rateFlow",    r.flow);

  emComment.value = entry.comment || "";
}

function openModal(entryId, onSaved) {
  const logs = window.SaunaStorage.loadLogs();
  const raw  = logs.find((e) => e.id === entryId);
  if (!raw) return;

  const entry = window.SaunaStorage.normalizeEntry(raw);
  currentEntryId  = entryId;
  onSavedCallback = onSaved || null;

  fillForm(entry);
  hideSaveMessage();
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.classList.add("hidden");
  document.body.style.overflow = "";
  currentEntryId  = null;
  onSavedCallback = null;
}

function showSaveMessage(text, isError) {
  emSaveMessage.textContent = text;
  emSaveMessage.classList.remove("hidden", "save-message-error", "save-message-success");
  emSaveMessage.classList.add(isError ? "save-message-error" : "save-message-success");
}

function hideSaveMessage() {
  emSaveMessage.classList.add("hidden");
}

// ============================================================
// 保存処理
// ============================================================

function handleSave() {
  if (!currentEntryId) return;

  const logs = window.SaunaStorage.loadLogs();
  const idx  = logs.findIndex((e) => e.id === currentEntryId);
  if (idx < 0) {
    showSaveMessage("記録が見つかりませんでした。", true);
    return;
  }

  const existing = window.SaunaStorage.normalizeEntry(logs[idx]);
  const n = (el) => Number(el.value) || 0;

  const updated = {
    ...existing,
    visitDate:   emVisitDate.value,
    visitTime:   emVisitTime.value,
    stayHours:   n(emStayHours),
    stayMinutes: n(emStayMinutes),
    crowding:    emCrowding.value || "普通",
    seiri:       window.SaunaStorage.migrateSeiriScore(n(emSeiri)),
    sets: {
      sauna:   { minutesPerRound: n(emSaunaSetMinutes),   count: n(emSaunaSetCount)   },
      water:   { minutesPerRound: n(emWaterSetMinutes),   count: n(emWaterSetCount)   },
      outdoor: { minutesPerRound: n(emOutdoorSetMinutes), count: n(emOutdoorSetCount) },
    },
    facilityRating: {
      sauna:       getRadioValue("em-rateSauna"),
      water:       getRadioValue("em-rateWater"),
      outdoor:     getRadioValue("em-rateOutdoor"),
      cleanliness: getRadioValue("em-rateClean"),
      flow:        getRadioValue("em-rateFlow"),
    },
    comment:   emComment.value.trim(),
    updatedAt: new Date().toISOString(),
  };

  logs[idx] = updated;
  window.SaunaStorage.saveLogs(logs);

  const uid = window.SaunaAuth && window.SaunaAuth.uid;
  if (uid && window.SaunaCloud) {
    window.SaunaCloud.saveEntryToCloud(uid, updated)
      .catch((err) => console.error("[SaunaCloud] 更新エラー:", err));
  }

  closeModal();
  if (onSavedCallback) onSavedCallback();
}

// ============================================================
// 初期化
// ============================================================

function init() {
  injectModal();
  bindDomRefs();

  emClose.addEventListener("click", closeModal);
  emCancelBtn.addEventListener("click", closeModal);
  emSaveBtn.addEventListener("click", handleSave);
  emForm.addEventListener("submit", (e) => { e.preventDefault(); handleSave(); });
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

window.SaunaEntryModal = { open: openModal };

})();
