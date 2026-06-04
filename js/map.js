/**
 * map.js - 訪問施設を地図に表示するページ
 *
 * Leaflet + OpenStreetMap タイルで地図を表示します。
 * 施設の緯度経度は storage.js の施設マスタに保存されています。
 */

(function () {

const {
  loadFacilities,
  loadLogs,
  saveLogs,
  getMappableFacilities,
  getLogsByFacilityId,
  geocodeAddress,
  updateFacilityLocation,
} = window.SaunaStorage;

const {
  escapeHtml,
  formatStayDuration,
  formatSeiriScore,
  formatSetLine,
  getEntryAddress,
  toStars,
} = window.SaunaUtils;

const mapEmpty          = document.getElementById("map-empty");
const mapHint           = document.getElementById("map-hint");
const mapRecordsSection = document.getElementById("map-records-section");
const mapRecordsTitle   = document.getElementById("map-records-title");
const mapRecordsList    = document.getElementById("map-records-list");
const mapPendingSection = document.getElementById("map-pending-section");
const mapPendingList    = document.getElementById("map-pending-list");

let map = null;
let markersLayer = null;
let currentFacility = null;

/**
 * 地図を初期化（1回だけ）
 */
function initMap() {
  if (map) {
    return;
  }

  map = L.map("map", {
    scrollWheelZoom: true,
    tap: true,
  }).setView([35.6812, 139.7671], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

/**
 * 施設評価の1行分のHTMLを返す
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
 * 1件の記録カード（li要素）を作って返す
 */
function createMapRecordItem(entry) {
  const address = getEntryAddress(entry);
  const ratings = entry.facilityRating;
  const sets    = entry.sets;

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
          ${ratingRowHtml("サウナ",  ratings.sauna)}
          ${ratingRowHtml("水風呂",  ratings.water)}
          ${ratingRowHtml("外気浴",  ratings.outdoor)}
          ${ratingRowHtml("清潔感",  ratings.cleanliness)}
          ${ratingRowHtml("動線",    ratings.flow)}
        </div>
      </div>
    </details>
    ${entry.comment ? `<p class="log-comment">${escapeHtml(entry.comment)}</p>` : ""}
    <div class="log-actions">
      <button type="button" class="btn-edit">編集</button>
      <button type="button" class="btn-delete">削除</button>
    </div>
  `;

  li.querySelector(".btn-edit").addEventListener("click", () => {
    sessionStorage.setItem("sauna-edit-id", entry.id);
    window.location.href = "index.html";
  });

  li.querySelector(".btn-delete").addEventListener("click", () => {
    deleteFromMap(entry.id);
  });

  return li;
}

/**
 * 地図ページから記録を削除する
 */
function deleteFromMap(id) {
  if (!confirm("この記録を削除しますか？")) return;

  saveLogs(loadLogs().filter((e) => e.id !== id));

  const uid = window.SaunaAuth && window.SaunaAuth.uid;
  if (uid && window.SaunaCloud) {
    window.SaunaCloud.deleteEntryFromCloud(uid, id)
      .catch((err) => console.error("[SaunaCloud] 削除エラー:", err));
  }

  if (currentFacility) {
    const remaining = getLogsByFacilityId(currentFacility.id);
    if (remaining.length > 0) {
      showRecordsForFacility(currentFacility);
    } else {
      mapRecordsSection.classList.add("hidden");
    }
  }
}

/**
 * 施設の記録一覧を画面下部に表示
 */
function showRecordsForFacility(facility) {
  currentFacility = facility;
  const logs = getLogsByFacilityId(facility.id);

  mapRecordsTitle.textContent = `${facility.name} の記録（${logs.length}件）`;
  mapRecordsList.innerHTML = "";

  if (logs.length === 0) {
    mapRecordsList.innerHTML =
      '<li class="empty-message">この施設の記録はまだありません。</li>';
  } else {
    logs.forEach((entry) => {
      mapRecordsList.appendChild(createMapRecordItem(entry));
    });
  }

  mapRecordsSection.classList.remove("hidden");
  mapRecordsSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/**
 * マーカーを地図に配置
 */
function renderMarkers(facilities) {
  markersLayer.clearLayers();

  if (facilities.length === 0) {
    return;
  }

  const bounds = [];

  facilities.forEach((facility) => {
    const marker = L.marker([facility.lat, facility.lng]);
    marker.bindPopup(
      `<strong>${escapeHtml(facility.name)}</strong><br>${escapeHtml(facility.address)}`
    );

    marker.on("click", () => {
      showRecordsForFacility(facility);
    });

    marker.addTo(markersLayer);
    bounds.push([facility.lat, facility.lng]);
  });

  if (bounds.length === 1) {
    map.setView(bounds[0], 14);
  } else {
    map.fitBounds(bounds, { padding: [40, 40] });
  }
}

/**
 * 住所はあるが座標がない施設を一覧表示
 */
function renderPendingFacilities() {
  const all = Object.values(loadFacilities());
  const pending = all.filter(
    (f) => f.address && (!Number.isFinite(f.lat) || !Number.isFinite(f.lng))
  );

  if (pending.length === 0) {
    mapPendingSection.classList.add("hidden");
    return;
  }

  mapPendingSection.classList.remove("hidden");
  mapPendingList.innerHTML = "";

  pending.forEach((facility) => {
    const li = document.createElement("li");
    li.className = "pending-item";
    li.innerHTML = `
      <div>
        <strong>${escapeHtml(facility.name)}</strong>
        <p class="hint">${escapeHtml(facility.address)}</p>
      </div>
      <button type="button" class="btn-secondary btn-small" data-id="${escapeHtml(facility.id)}">
        位置を再取得
      </button>
    `;

    li.querySelector("button").addEventListener("click", async () => {
      const btn = li.querySelector("button");
      btn.disabled = true;
      btn.textContent = "取得中...";

      const loc = await geocodeAddress(facility.address);
      if (loc) {
        updateFacilityLocation(facility.id, loc.lat, loc.lng);
        alert("位置情報を取得しました。地図を更新します。");
        refreshMap();
      } else {
        alert("位置情報を取得できませんでした。住所を見直してください。");
        btn.disabled = false;
        btn.textContent = "位置を再取得";
      }
    });

    mapPendingList.appendChild(li);
  });
}

/**
 * 地図全体を再描画
 */
async function refreshMap() {
  initMap();

  const all = Object.values(loadFacilities());
  for (const f of all) {
    if (f.address && (!f.lat || !f.lng)) {
      const loc = await geocodeAddress(f.address);
      if (loc) {
        updateFacilityLocation(f.id, loc.lat, loc.lng);
      }
      await new Promise((r) => setTimeout(r, 1100));
    }
  }

  const mappable = getMappableFacilities();

  if (mappable.length === 0) {
    mapEmpty.classList.remove("hidden");
    mapHint.classList.add("hidden");
    document.getElementById("map").classList.add("hidden");
  } else {
    mapEmpty.classList.add("hidden");
    mapHint.classList.remove("hidden");
    document.getElementById("map").classList.remove("hidden");
    renderMarkers(mappable);
    setTimeout(() => map.invalidateSize(), 200);
  }

  renderPendingFacilities();
}

refreshMap();

})();
