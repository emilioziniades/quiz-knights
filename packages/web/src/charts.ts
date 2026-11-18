import { Category, Data, labels, roundLabels } from "./types";
import { average, colourArray, sum, titleCase } from "./utils";
import Chart from "chart.js/auto";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { DateTime } from "luxon";

Chart.defaults.color = "#171614";

export function renderAveragePointsPerCategory(
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

export function renderPositionAcrossRounds(
  element: HTMLCanvasElement,
  data: Data,
) {
  const colours = colourArray(data.length);

  const positions = data.map((datum, i) => ({
    label: DateTime.fromISO(datum.date).toLocaleString(DateTime.DATE_MED),
    data: datum.round_position,
    backgroundColor: colours[i].toString(),
    borderColor: colours[i].toString(),
  }));

  new Chart(element, {
    type: "line",
    data: {
      labels: roundLabels,
      datasets: positions,
    },
    options: {
      scales: {
        y: {
          reverse: true,
          min: 1,
          title: {
            display: true,
            text: "Position",
          },
        },
      },
      plugins: {
        legend: {
          labels: {
            usePointStyle: true,
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
      label: DateTime.fromISO(datum.date).toLocaleString(DateTime.DATE_MED),
      data: accumulatedPoints,
      backgroundColor: colours[i].toString(),
      borderColor: colours[i].toString(),
    };
  });

  new Chart(element, {
    type: "line",
    data: {
      labels: roundLabels,
      datasets: points,
    },
    options: {
      scales: {
        y: {
          title: {
            display: true,
            text: "Points",
          },
        },
      },
      plugins: {
        legend: {
          labels: {
            usePointStyle: true,
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
  const xLabel = data
    .map((datum) => datum.date)
    .map((date) => DateTime.fromISO(date))
    .map((x) => x.toLocaleString(DateTime.DATE_MED));

  const totalPoints = data.map((datum) => {
    datum.category_scores[datum.double_up_category as Category] *= 2;
    return sum(Object.values(datum.category_scores));
  });

  new Chart(element, {
    type: "line",
    data: {
      labels: xLabel,
      datasets: [
        {
          data: totalPoints,
          borderColor: colourArray(3)[0].toString(),
        },
      ],
    },
    options: {
      scales: {
        y: {
          title: {
            display: true,
            text: "Points",
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

export function renderPositionOverTime(element: HTMLCanvasElement, data: Data) {
  const xLabel = data
    .map((datum) => datum.date)
    .map((date) => DateTime.fromISO(date))
    .map((x) => x.toLocaleString(DateTime.DATE_MED));

  const positions = data.map((x) => x.round_position.at(-1));

  new Chart(element, {
    type: "line",
    data: {
      labels: xLabel,
      datasets: [
        {
          data: positions,
          borderColor: colourArray(3)[1].toString(),
        },
      ],
    },
    options: {
      scales: {
        y: {
          reverse: true,
          min: 1,
          title: {
            display: true,
            text: "Position",
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
