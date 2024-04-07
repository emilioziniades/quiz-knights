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

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div>
      <h1>The Quiz Knights</h1>
      <img id="roundTable" alt="The Round Table"/>
      <!-- <p>How did we do?</p> -->
      <h2>Average Points Per Category</h2>
      <canvas id="averagePointsPerCategory" class="chart"></canvas>
      <h2>Total Points Over Time</h2>
      <canvas id="totalPointsOverTime" class="chart"></canvas>
      <h2>Placement Across Rounds</h2>
      <canvas id="placementAcrossRounds" class="chart"></canvas>
      <h2>Score Across Rounds</h2>
      <canvas id="pointsAcrossRounds" class="chart"></canvas>
  </div>
`;

document.querySelector<HTMLImageElement>("#roundTable")!.src = roundTable;

renderAveragePointsPerCategory(
  document.querySelector<HTMLCanvasElement>("#averagePointsPerCategory")!,
  [...(data as Data)],
);

renderTotalPointsOverTime(
  document.querySelector<HTMLCanvasElement>("#totalPointsOverTime")!,
  [...(data as Data)],
);

renderPlacementAcrossRounds(
  document.querySelector<HTMLCanvasElement>("#placementAcrossRounds")!,
  [...(data as Data)],
);

renderPointsAcrossRounds(
  document.querySelector<HTMLCanvasElement>("#pointsAcrossRounds")!,
  [...(data as Data)],
);
