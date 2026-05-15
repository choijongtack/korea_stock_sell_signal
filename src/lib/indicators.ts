export function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = [];
  let rollingSum = 0;

  for (let i = 0; i < values.length; i += 1) {
    rollingSum += values[i];
    if (i >= period) rollingSum -= values[i - period];
    out.push(i >= period - 1 ? rollingSum / period : null);
  }

  return out;
}

