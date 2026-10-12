/**
 * Table-value helpers from Cartografías Imposibles / LENTES.
 * A slider v becomes the SVG discrete transfer "v (1 - v)".
 */

export function sliderToTableValues(sliderValue) {
  const value = Math.max(0, Math.min(1, sliderValue));
  return `${value} ${1 - value}`;
}

function randomNormal() {
  let u;
  let v;
  let s;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  return u * Math.sqrt((-2 * Math.log(s)) / s);
}

function randomInvertedGaussian01() {
  const z = Math.abs(randomNormal());
  const extreme = 1 - Math.exp(-z * z);
  return Math.random() < 0.5 ? extreme : 1 - extreme;
}

function sampleInBand(lo, hi) {
  return lo + randomInvertedGaussian01() * (hi - lo);
}

function shuffle(items) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const RGB_BANDS = [
  [0, 1 / 3],
  [1 / 3, 2 / 3],
  [2 / 3, 1],
];

/** R, G, B each occupy a different third of [0, 1], shuffled. */
export function randomDistinctDitherRgb() {
  const channels = shuffle(["tableValuesR", "tableValuesG", "tableValuesB"]);
  const result = {};
  for (let i = 0; i < 3; i++) {
    const [lo, hi] = RGB_BANDS[i];
    result[channels[i]] = sampleInBand(lo, hi);
  }
  return result;
}
