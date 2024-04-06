export function titleCase(s: string): string {
  return s
    .replace("_", " ")
    .replace(/(^\w{1})|(\s{1}\w{1})/g, (match) => match.toUpperCase());
}

export function average(array: number[]): number {
  return array.reduce((x, y) => x + y) / array.length;
}
