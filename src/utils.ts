import Color from "colorjs.io";

export function titleCase(s: string): string {
  return s
    .replace("_", " ")
    .replace(/(^\w{1})|(\s{1}\w{1})/g, (match) => match.toUpperCase());
}

export function average(array: number[]): number {
  return sum(array) / array.length;
}

export function sum(array: number[]): number {
  return array.reduce((x, y) => x + y, 0);
}

export function colourArray(steps: number): Color[] {
  const cStart = "fuchsia";
  const cEnd = "gold";
  return new Color(cStart).steps(cEnd, {
    space: "lch",
    outputSpace: "srgb",
    steps: steps,
    hue: "raw",
  });
}

export function chunk<T>(array: T[], size: number): T[][] {
  var arrays = [];

  for (let i = 0; i < array.length; i += size) {
    arrays.push(array.slice(i, i + size));
  }

  return arrays;
}
