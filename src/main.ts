import "./style.css";
import data from "./data.json";
import { Category, labels } from "./types.ts";
import { average, titleCase } from "./utils.ts";
import Chart from "chart.js/auto";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div>
      <h1>The Quiz Knights</h1>
      <p>How did we do?</p>
      <h2>Average Score By Category</h2>
      <canvas id="averagePerCategory">
      <h2>Placement Across Rounds</h2>
      <h2>Score Across Rounds</h2>
  </div>
`;

const ctx = document.querySelector<HTMLCanvasElement>("#averagePerCategory")!;

const averages = labels.map((label: Category) =>
  average(data.map((datum) => datum.category_scores[label])),
);

new Chart(ctx, {
  type: "bar",
  data: {
    labels: labels.map(titleCase),
    datasets: [
      {
        label: "Average Score By Category",
        data: averages,
        backgroundColor: "rgba(255, 99, 132, 0.5)",
      },
    ],
  },
  options: {
    responsive: true,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
    },
  },
});
