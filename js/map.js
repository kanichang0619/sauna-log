/**
 * map.js - 訪問施設を地図に表示するページ
 *
 * Leaflet + OpenStreetMap タイルで地図を表示します。
 * 施設の緯度経度は storage.js の施設マスタに保存されています。
 */

(function () {

const {
  loadFacilities,
  getMappableFacilities,
  getLogsByFacilityId,
  geocodeAddress,
  updateFacilityLocation,
} = window.SaunaStorage;

const {
  escapeHtml,
  formatVisitDateTime,
  formatSeiriScore,
  formatStayDuration,
} = window.SaunaUtils;

const mapEmpty = document.getElementById("map-empty");
const mapHint = document.getElementById("map-hint");
const mapRecordsSection = document.getElementById("map-records-section");
const mapRecordsTitle = document.getElementById("map-records-title");
const mapRecordsList = document.getElementById("map-records-list");
const mapPendingSection = document.getElementById("map-pending-section");
const mapPendingList = document.getElementById("map-pending-list");

let map = null;
let markersLayer = null;

/**
 * 地図を初期化（1回だけ）
 */
function initMap() {
  if (map) {
    return;
  }

  // 日本全体が見える程度の初期位置（東京付近）
  map = L.map("map", {
    scrollWheelZoom: true,
    tap: true,
  }).setView([35.6812, 139.7671], 10);

  // OpenStreetMap のタイル（無料の地図画像）
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

/**
 * 施設の記録一覧を画面下部に表示
 * @param {Object} facility
 */
function showRecordsForFacility(facility) {
  const logs = getLogsByFacilityId(facility.id);

  mapRecordsTitle.textContent = `${facility.name} の記録（${logs.length}件）`;
  mapRecordsList.innerHTML = "";

  if (logs.length === 0) {
    mapRecordsList.innerHTML =
      '<li class="empty-message">この施設の記録はまだありません。</li>';
  } else {
    logs.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "log-item map-record-item";
      li.innerHTML = `
        <div class="log-item-header">
          <span class="log-visit-date">${escapeHtml(formatVisitDateTime(entry))}</span>
          <span class="seiri-score">${escapeHtml(formatSeiriScore(entry.seiri))}</span>
        </div>
        <p class="log-meta-inline">
          滞在 ${escapeHtml(formatStayDuration(entry.stayHours, entry.stayMinutes))}
          / サウナ ${escapeHtml(String(entry.saunaTemp))}℃
        </p>
        <p class="log-comment">${escapeHtml(entry.comment)}</p>
      `;
      mapRecordsList.appendChild(li);
    });
  }

  mapRecordsSection.classList.remove("hidden");
  mapRecordsSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/**
 * マーカーを地図に配置
 * @param {Array} facilities
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

  // すべてのピンが入るようにズーム調整
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

  // 座標未取得の施設をまとめて再検索（初回表示時）
  const all = Object.values(loadFacilities());
  for (const f of all) {
    if (f.address && (!f.lat || !f.lng)) {
      const loc = await geocodeAddress(f.address);
      if (loc) {
        updateFacilityLocation(f.id, loc.lat, loc.lng);
      }
      // API への負荷を抑えるため少し待つ
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
    // 地図サイズの再計算（モバイルで表示が崩れるときの対策）
    setTimeout(() => map.invalidateSize(), 200);
  }

  renderPendingFacilities();
}

refreshMap();

})();
