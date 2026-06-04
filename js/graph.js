/**
 * graph.js - ランキングページ（graph.html）
 *
 * 施設ごとの訪問回数・整い度の上位5件をランキング形式で表示します。
 */

const MEDALS = ["🥇", "🥈", "🥉", "4位", "5位"];

function rankingItemHtml(rank, name, score, unit) {
  const pos = MEDALS[rank] !== undefined ? MEDALS[rank] : `${rank + 1}位`;
  const escapedName = name
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `
    <li class="ranking-item">
      <span class="ranking-pos">${pos}</span>
      <span class="ranking-name">${escapedName}</span>
      <span class="ranking-score">${score}${unit}</span>
    </li>`;
}

function renderRanking(listId, emptyId, data, unit) {
  const list  = document.getElementById(listId);
  const empty = document.getElementById(emptyId);
  if (!list || !empty) return;

  if (data.length === 0) {
    empty.classList.remove("hidden");
    list.classList.add("hidden");
    return;
  }

  empty.classList.add("hidden");
  list.classList.remove("hidden");
  list.innerHTML = data.map((d, i) => rankingItemHtml(i, d.name, d.score, unit)).join("");
}

function render() {
  const visits = window.SaunaStorage.countVisitsByFacility()
    .slice(0, 5)
    .map((d) => ({ name: d.name, score: d.count }));

  const seiris = window.SaunaStorage.getTopSeiriByFacility(5);

  renderRanking("visit-ranking",  "visit-ranking-empty",  visits, "回");
  renderRanking("seiri-ranking",  "seiri-ranking-empty",  seiris, "点");
}

render();

window.addEventListener("sauna-data-updated", render);
