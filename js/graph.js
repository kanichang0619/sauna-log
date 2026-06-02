/**
 * graph.js - 訪問数ページ（graph.html）
 *
 * 施設ごとの訪問回数を横棒グラフで表示します。
 * 訪問回数が多い施設を上に表示し、施設が増えてもスクロールで確認できます。
 */

const chartCanvas = document.getElementById("visit-chart");
const chartEmpty  = document.getElementById("chart-empty");

/** グラフの棒の色（施設が増えても見やすいよう複数用意） */
const BAR_COLORS = [
  "rgba(237, 137, 54, 0.85)",
  "rgba(144, 205, 244, 0.85)",
  "rgba(104, 211, 145, 0.85)",
  "rgba(246, 173, 85, 0.85)",
  "rgba(183, 148, 244, 0.85)",
  "rgba(252, 129, 129, 0.85)",
];

/**
 * 1バーあたりの高さ（px）。
 * スマホのタッチ操作を考慮して 48px 以上に設定。
 */
const BAR_HEIGHT = 52;

/**
 * グラフ上部のタイトルや余白に必要な高さ（px）
 */
const HEADER_HEIGHT = 70;

/**
 * 訪問回数データをもとに横棒グラフを描画する
 */
function renderVisitChart() {
  // ダーク背景に合わせた文字色をデフォルトに設定
  Chart.defaults.color = "#cbd5e0";

  // localStorage から施設ごとの訪問回数を取得（多い順にソート済み）
  const data = window.SaunaStorage.countVisitsByFacility();

  if (data.length === 0) {
    // 記録がない場合はメッセージを表示してグラフを隠す
    chartEmpty.classList.remove("hidden");
    chartCanvas.parentElement.classList.add("hidden");
    return;
  }

  chartEmpty.classList.add("hidden");
  chartCanvas.parentElement.classList.remove("hidden");

  // 施設名と訪問回数の配列を作る
  // countVisitsByFacility() は降順ソート済みなので、先頭が最多訪問施設
  const labels = data.map((d) => d.name);
  const counts = data.map((d) => d.count);
  const colors = labels.map((_, i) => BAR_COLORS[i % BAR_COLORS.length]);

  // ---- キャンバスの高さを施設数に応じて動的に設定 ----
  // 施設が増えるほど縦に伸ばし、1画面に収まらない場合はページスクロールで確認できるようにする
  const canvasHeight = Math.max(280, data.length * BAR_HEIGHT + HEADER_HEIGHT);
  chartCanvas.style.height             = canvasHeight + "px";
  chartCanvas.parentElement.style.height = canvasHeight + "px";

  // 既存のグラフインスタンスがあれば破棄してから再生成
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
          borderRadius: 4,
        },
      ],
    },
    options: {
      // indexAxis: "y" で横棒グラフ（縦軸=施設名、横軸=訪問回数）になる
      indexAxis: "y",

      // maintainAspectRatio: false にして、高さを JS で直接制御できるようにする
      responsive: true,
      maintainAspectRatio: false,

      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: "施設ごとの訪問回数",
          color: "#e2e8f0",
          font: { size: 16 },
          padding: { bottom: 16 },
        },
      },

      scales: {
        // 横軸（訪問回数）
        x: {
          beginAtZero: true,
          ticks: {
            color: "#cbd5e0",
            stepSize: 1,
            precision: 0, // 小数点を表示しない
          },
          grid: { color: "rgba(255,255,255,0.06)" },
          title: {
            display: true,
            text: "訪問回数（回）",
            color: "#a0aec0",
          },
        },
        // 縦軸（施設名）
        y: {
          ticks: {
            color: "#cbd5e0",
            font: { size: 13 },
            // 施設名が長い場合は末尾を省略して表示する
            callback: function (value) {
              const label = this.getLabelForValue(value);
              return label.length > 14 ? label.slice(0, 14) + "…" : label;
            },
          },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
      },
    },
  });
}

renderVisitChart();
