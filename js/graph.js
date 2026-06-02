/**
 * graph.js - 施設ごとの訪問回数グラフページ
 *
 * Chart.js という外部ライブラリを使い、棒グラフを表示します。
 * データは localStorage から storage.js 経由で読み込みます。
 */

const chartCanvas = document.getElementById("visit-chart");
const chartEmpty = document.getElementById("chart-empty");

/** グラフの色（施設が増えても見やすいよう配列で用意） */
const BAR_COLORS = [
  "rgba(237, 137, 54, 0.85)",
  "rgba(144, 205, 244, 0.85)",
  "rgba(104, 211, 145, 0.85)",
  "rgba(246, 173, 85, 0.85)",
  "rgba(183, 148, 244, 0.85)",
  "rgba(252, 129, 129, 0.85)",
];

/**
 * 訪問回数データから Chart.js 用の設定を作って描画
 */
function renderVisitChart() {
  // ダーク背景に合わせた文字色
  Chart.defaults.color = "#cbd5e0";

  const data = window.SaunaStorage.countVisitsByFacility();

  if (data.length === 0) {
    chartEmpty.classList.remove("hidden");
    chartCanvas.parentElement.classList.add("hidden");
    return;
  }

  chartEmpty.classList.add("hidden");
  chartCanvas.parentElement.classList.remove("hidden");

  const labels = data.map((d) => d.name);
  const counts = data.map((d) => d.count);
  const colors = labels.map((_, i) => BAR_COLORS[i % BAR_COLORS.length]);

  // 既存のグラフがあれば破棄（ページ再読み込み対策）
  if (window.visitChartInstance) {
    window.visitChartInstance.destroy();
  }

  window.visitChartInstance = new Chart(chartCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "訪問回数",
          data: counts,
          backgroundColor: colors,
          borderColor: colors.map((c) => c.replace("0.85", "1")),
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: "施設ごとの訪問回数",
          color: "#e2e8f0",
          font: { size: 16 },
        },
      },
      scales: {
        x: {
          ticks: { color: "#cbd5e0", maxRotation: 45, minRotation: 0 },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#cbd5e0",
            stepSize: 1,
          },
          grid: { color: "rgba(255,255,255,0.06)" },
          title: {
            display: true,
            text: "回",
            color: "#a0aec0",
          },
        },
      },
    },
  });
}

renderVisitChart();
