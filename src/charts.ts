import { Category, labels } from "./types";
import data from "./data.json";
import { average, colourArray, titleCase } from "./utils";
import Chart from "chart.js/auto";
import ChartDataLabels from "chartjs-plugin-datalabels";

const cornsilk = "#FEFAE0";

Chart.defaults.color = cornsilk;

export function renderAveragePerCategory(element: HTMLCanvasElement) {
  const averages = labels.map((label: Category) =>
    average(data.map((datum) => datum.category_scores[label])),
  );

  const colours = colourArray(averages.length);

  new Chart(element, {
    type: "bar",
    data: {
      labels: labels.map(titleCase),
      datasets: [
        {
          label: "Average Score By Category",
          data: averages,
          borderColor: colours.map((x) => x.toString()),
          backgroundColor: colours.map((x) => {
            x.alpha = 0.8;
            return x.toString();
          }),
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        y: {
          border: {
            color: cornsilk,
          },
          min: 0,
          max: 5,
          grid: {
            display: true,
            color: cornsilk,
          },
          ticks: {
            maxTicksLimit: 6,
          },
        },
        x: {
          border: {
            color: cornsilk,
          },
          grid: {
            display: false,
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: false,
        },
        datalabels: {
          anchor: "end",
          align: "bottom",
          formatter: (x, _) => x.toFixed(2),
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}

export function renderPlacementAcrossRounds(element: HTMLCanvasElement) {
  const colours = colourArray(data.length);

  const placements = data.map((datum, i) => ({
    label: datum.date,
    data: datum.round_placement,
    backgroundColor: colours[i].toString(),
    borderColor: colours[i].toString(),
  }));

  new Chart(element, {
    type: "line",
    data: {
      labels: [
        labels[0] + " + " + labels[1],
        labels[2] + " + " + labels[3],
        labels[4] + " + " + labels[5],
        labels[6] + " + " + labels[7],
        labels[8] + " + " + labels[9],
      ].map(titleCase),
      datasets: placements,
    },
    options: {
      responsive: true,
    },
  });
}
