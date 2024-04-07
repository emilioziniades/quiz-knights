import "./style.css";
import {
  renderAveragePerCategory as renderAveragePointsPerCategory,
  renderPlacementAcrossRounds,
  renderPointsAcrossRounds,
  renderTotalPointsOverTime,
} from "./charts.ts";
import roundTable from "./roundTable.png";
import data from "./data.json";
import { Data } from "./types.ts";
import { DateTime } from "luxon";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div>
      <h1>The Quiz Knights</h1>
      <img id="roundTable" alt="The Round Table"/>
      <p id="summaryMessage"> </p>
      <h2>Average Points Per Category</h2>
      <canvas id="averagePointsPerCategory" class="chart"></canvas>
      <h2>Total Points Over Time</h2>
      <canvas id="totalPointsOverTime" class="chart"></canvas>
      <h2>Placement Across Rounds</h2>
      <canvas id="placementAcrossRounds" class="chart"></canvas>
      <h2>Points Across Rounds</h2>
      <canvas id="pointsAcrossRounds" class="chart"></canvas>
  </div>
`;

document.querySelector<HTMLImageElement>("#roundTable")!.src = roundTable;

const quizDates = data
  .map((x) => x.date)
  .map((x) => DateTime.fromISO(x).toLocaleString(DateTime.DATE_MED));

document.querySelector<HTMLParagraphElement>("#summaryMessage")!.title =
  `These quizzes took place on ${quizDates.join(", ")}`;

document.querySelector<HTMLParagraphElement>("#summaryMessage")!.innerText =
  `After  ${data.length} quizzes... how did we do?`;

renderAveragePointsPerCategory(
  document.querySelector<HTMLCanvasElement>("#averagePointsPerCategory")!,
  structuredClone(data) as Data,
);

renderTotalPointsOverTime(
  document.querySelector<HTMLCanvasElement>("#totalPointsOverTime")!,
  structuredClone(data) as Data,
);

renderPlacementAcrossRounds(
  document.querySelector<HTMLCanvasElement>("#placementAcrossRounds")!,
  structuredClone(data) as Data,
);

renderPointsAcrossRounds(
  document.querySelector<HTMLCanvasElement>("#pointsAcrossRounds")!,
  structuredClone(data) as Data,
);
