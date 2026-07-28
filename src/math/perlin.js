import * as THREE from "three";

function createPerm(seed = 0) {
  const perm = new Uint8Array(512);
  const src = new Uint8Array(256);
  for (let i = 0; i < 256; i++) src[i] = i;

  let s = Math.abs(Math.floor(seed)) || 1;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    const tmp = src[i];
    src[i] = src[j];
    src[j] = tmp;
  }

  for (let i = 0; i < 512; i++) perm[i] = src[i & 255];
  return perm;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function createPerlin3D(seed = 0) {
  const perm = createPerm(seed);

  function grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  return function noise(x, y, z) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const zi = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);
    const a = perm[xi] + yi;
    const aa = perm[a] + zi;
    const ab = perm[a + 1] + zi;
    const b = perm[xi + 1] + yi;
    const ba = perm[b] + zi;
    const bb = perm[b + 1] + zi;

    const x1 = THREE.MathUtils.lerp(
      grad(perm[aa], xf, yf, zf),
      grad(perm[ba], xf - 1, yf, zf),
      u
    );
    const x2 = THREE.MathUtils.lerp(
      grad(perm[ab], xf, yf - 1, zf),
      grad(perm[bb], xf - 1, yf - 1, zf),
      u
    );
    const y1 = THREE.MathUtils.lerp(x1, x2, v);

    const x3 = THREE.MathUtils.lerp(
      grad(perm[aa + 1], xf, yf, zf - 1),
      grad(perm[ba + 1], xf - 1, yf, zf - 1),
      u
    );
    const x4 = THREE.MathUtils.lerp(
      grad(perm[ab + 1], xf, yf - 1, zf - 1),
      grad(perm[bb + 1], xf - 1, yf - 1, zf - 1),
      u
    );
    const y2 = THREE.MathUtils.lerp(x3, x4, v);

    return THREE.MathUtils.lerp(y1, y2, w);
  };
}

export function sampleFbm3(noise3d, x, y, z, octaves = 3) {
  let value = 0;
  let amp = 1;
  let freq = 1;
  let totalAmp = 0;

  for (let o = 0; o < octaves; o++) {
    value += noise3d(x * freq, y * freq, z * freq) * amp;
    totalAmp += amp;
    amp *= 0.5;
    freq *= 2;
  }

  return value / totalAmp;
}
