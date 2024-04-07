import { Category, Data, labels } from "./types";
// import data from "./data.json";
import { average, chunk, colourArray, sum, titleCase } from "./utils";
import Chart from "chart.js/auto";
import "chartjs-adapter-luxon";
import ChartDataLabels from "chartjs-plugin-datalabels";

export function renderAveragePerCategory(
  element: HTMLCanvasElement,
  data: Data,
) {
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
          label: "Average Points Per Category",
          data: averages,
          backgroundColor: colours.map((x) => x.toString()),
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        y: {
          min: 0,
          max: 5,
          ticks: {
            maxTicksLimit: 6,
          },
          title: {
            display: true,
            text: "Points",
          },
        },
        x: {
          grid: {
            display: false,
          },
        },
      },
      plugins: {
        legend: {
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

export function renderPlacementAcrossRounds(
  element: HTMLCanvasElement,
  data: Data,
) {
  const xLabel = chunk(labels, 2).map((l) => l.map(titleCase).join(" + "));

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
      labels: xLabel,
      datasets: placements,
    },
    options: {
      responsive: true,
      scales: {
        y: {
          title: {
            display: true,
            text: "Position",
          },
        },
      },
    },
  });
}

export function renderPointsAcrossRounds(
  element: HTMLCanvasElement,
  data: Data,
) {
  const colours = colourArray(data.length);

  const xLabel = chunk(labels, 2).map((l) => l.map(titleCase).join(" + "));

  const points = data.map((datum, i) => {
    datum.category_scores[datum.double_up_category as Category] *= 2;

    const pointsPerRound = [
      datum.category_scores.history + datum.category_scores.geography,
      datum.category_scores.science + datum.category_scores.sport,
      datum.category_scores.music + datum.category_scores.art,
      datum.category_scores.guest + datum.category_scores.current_affairs,
      datum.category_scores.general_knowledge + datum.category_scores.film,
    ];

    const accumulatedPoints: number[] = pointsPerRound.reduce((a, n) => {
      const last = a.at(-1) ?? 0;
      a.push(last + n);
      return a;
    }, [] as number[]);

    return {
      label: datum.date,
      data: accumulatedPoints,
      backgroundColor: colours[i].toString(),
      borderColor: colours[i].toString(),
    };
  });

  new Chart(element, {
    type: "line",
    data: {
      labels: xLabel,
      datasets: points,
    },
    options: {
      responsive: true,
      scales: {
        y: {
          title: {
            display: true,
            text: "Points",
          },
        },
      },
    },
  });
}

export function renderTotalPointsOverTime(
  element: HTMLCanvasElement,
  data: Data,
) {
  const totalPoints = data.map((datum) => {
    datum.category_scores[datum.double_up_category as Category] *= 2;
    return sum(Object.values(datum.category_scores));
  });

  new Chart(element, {
    type: "line",
    data: {
      labels: data.map((x) => x.date),
      datasets: [{ data: totalPoints }],
    },
    options: {
      responsive: true,
      scales: {
        y: {
          title: {
            display: true,
            text: "Points",
          },
        },
        x: {
          title: {
            display: true,
            text: "Date",
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        datalabels: {
          anchor: "end",
          align: "bottom",
          padding: {
            top: 10,
          },
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}
