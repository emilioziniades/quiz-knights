import "./style.css";
import { renderAveragePerCategory } from "./charts.ts";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div>
      <h1>The Quiz Knights</h1>
      <p>How did we do?</p>
      <h2>Average Score By Category</h2>
      <canvas id="averagePerCategory" class="chart"></canvas>
      <h2>Placement Across Rounds</h2>
      <h2>Score Across Rounds</h2>
  </div>
`;

renderAveragePerCategory(
  document.querySelector<HTMLCanvasElement>("#averagePerCategory")!,
);
