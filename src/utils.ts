import Color from "colorjs.io";

export function titleCase(s: string): string {
  return s
    .replace("_", " ")
    .replace(/(^\w{1})|(\s{1}\w{1})/g, (match) => match.toUpperCase());
}

export function average(array: number[]): number {
  return array.reduce((x, y) => x + y) / array.length;
}

export function colourArray(steps: number): Color[] {
  const cStart = "rebeccapurple";
  const cEnd = "chocolate";
  return new Color(cStart).steps(cEnd, {
    space: "lch",
    outputSpace: "srgb",
    steps: steps,
    hue: "raw",
  });
}
