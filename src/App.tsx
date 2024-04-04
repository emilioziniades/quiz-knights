import "./App.css";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import data_banana from "./data.json";
import { Category, Data, labels } from "./types";
import { average, titleCase } from "./utils";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

function AverageScoreByCategory({ data }: { data: Data }) {
  const averages = labels.map((label: Category) =>
    average(data.map((datum) => datum.category_scores[label])),
  );
  return (
    <Bar
      options={{
        responsive: true,
        plugins: {
          legend: {
            display: false,
          },
          title: {
            display: false,
          },
        },
      }}
      data={{
        labels: labels.map(titleCase),
        datasets: [
          {
            label: "Average Score By Category",
            data: averages,
            backgroundColor: "rgba(255, 99, 132, 0.5)",
          },
        ],
      }}
    />
  );
}

function App() {
  return (
    <>
      <h1>The Quiz Knights</h1>
      <p>How did we do?</p>
      <h2>Average Score By Category</h2>
      <AverageScoreByCategory data={data_banana as Data} />
      <h2>Placement Across Rounds</h2>
      <h2>Score Across Rounds</h2>
    </>
  );
}

export default App;
