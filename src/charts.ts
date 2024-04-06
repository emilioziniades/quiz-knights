import { Category, labels } from "./types";
import data from "./data.json";
import { average, titleCase } from "./utils";
import Chart from "chart.js/auto";

export function renderAveragePerCategory(element: HTMLCanvasElement) {
  const averages = labels.map((label: Category) =>
    average(data.map((datum) => datum.category_scores[label])),
  );

  new Chart(element, {
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
}
