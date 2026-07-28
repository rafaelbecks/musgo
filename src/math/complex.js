export function c(re, im = 0) {
  return { re, im };
}

export function cAdd(a, b) {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function cSub(a, b) {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function cMul(a, b) {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

export function cScale(a, s) {
  return { re: a.re * s, im: a.im * s };
}

export function cAbs2(a) {
  return a.re * a.re + a.im * a.im;
}

export function cAbs(a) {
  return Math.sqrt(cAbs2(a));
}
