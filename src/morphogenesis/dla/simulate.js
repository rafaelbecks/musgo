/**
 * 3D Diffusion-Limited Aggregation on a voxel grid.
 * Walkers launch around the growing cluster, diffuse with optional bias /
 * noise flow, and stick when neighbor / stickiness / hit rules are met.
 *
 * References:
 * - Witten & Sander (1981)
 * - Softology DLA notes (launch sphere, neighbor counts, stick rules)
 * - Arts 'n Science geo-nodes DLA (flow-field bias)
 */

import {
  DLA_SEED_MODES,
  DLA_LAUNCH_MODES,
  DLA_CONNECTIVITY,
} from "./constants.js";

export { DLA_SEED_MODES, DLA_LAUNCH_MODES, DLA_CONNECTIVITY };

const FACE_OFFSETS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const FULL_OFFSETS = (() => {
  const o = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        o.push([dx, dy, dz]);
      }
    }
  }
  return o;
})();

/** Mulberry32 — deterministic PRNG from integer seed. */
export function createRng(seed) {
  let t = (Math.floor(seed) >>> 0) || 1;
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function idx(x, y, z, n) {
  return (x * n + y) * n + z;
}

function inBounds(x, y, z, n) {
  return x >= 0 && y >= 0 && z >= 0 && x < n && y < n && z < n;
}

/**
 * Even distribution on a sphere (Softology / standard).
 * @returns {[number, number, number]} unit vector
 */
function randomOnSphere(rng, hemisphere = false) {
  const theta = 2 * Math.PI * rng();
  // Full sphere: cosφ uniform in [-1,1]; hemisphere (+Y): cosφ in [0,1]
  const cosPhi = hemisphere ? rng() : 1 - 2 * rng();
  const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
  return [sinPhi * Math.cos(theta), cosPhi, sinPhi * Math.sin(theta)];
}

function sampleNoise3(x, y, z, scale, seed) {
  // Cheap value-noise hash (no Perlin dependency in hot walker loop)
  const sx = x * scale;
  const sy = y * scale;
  const sz = z * scale;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const iz = Math.floor(sz);
  const fx = sx - ix;
  const fy = sy - iy;
  const fz = sz - iz;
  const hash = (a, b, c) => {
    let n = (a * 374761393 + b * 668265263 + c * 1274126177 + seed) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const n000 = hash(ix, iy, iz);
  const n100 = hash(ix + 1, iy, iz);
  const n010 = hash(ix, iy + 1, iz);
  const n110 = hash(ix + 1, iy + 1, iz);
  const n001 = hash(ix, iy, iz + 1);
  const n101 = hash(ix + 1, iy, iz + 1);
  const n011 = hash(ix, iy + 1, iz + 1);
  const n111 = hash(ix + 1, iy + 1, iz + 1);
  const sx1 = fx * fx * (3 - 2 * fx);
  const sy1 = fy * fy * (3 - 2 * fy);
  const sz1 = fz * fz * (3 - 2 * fz);
  const x00 = n000 + (n100 - n000) * sx1;
  const x10 = n010 + (n110 - n010) * sx1;
  const x01 = n001 + (n101 - n001) * sx1;
  const x11 = n011 + (n111 - n011) * sx1;
  const y0 = x00 + (x10 - x00) * sy1;
  const y1 = x01 + (x11 - x01) * sy1;
  return y0 + (y1 - y0) * sz1;
}

function noiseGradient(x, y, z, scale, seed) {
  const e = 0.75;
  const dx =
    sampleNoise3(x + e, y, z, scale, seed) - sampleNoise3(x - e, y, z, scale, seed);
  const dy =
    sampleNoise3(x, y + e, z, scale, seed) - sampleNoise3(x, y - e, z, scale, seed);
  const dz =
    sampleNoise3(x, y, z + e, scale, seed) - sampleNoise3(x, y, z - e, scale, seed);
  return [dx, dy, dz];
}

function placeSeed(occupied, neighborCount, particles, x, y, z, n, offsets) {
  if (!inBounds(x, y, z, n)) return false;
  const i = idx(x, y, z, n);
  if (occupied[i]) return false;
  occupied[i] = 1;
  particles.push({ x, y, z, generation: 0 });
  for (const [dx, dy, dz] of offsets) {
    const nx = x + dx;
    const ny = y + dy;
    const nz = z + dz;
    if (!inBounds(nx, ny, nz, n)) continue;
    neighborCount[idx(nx, ny, nz, n)]++;
  }
  return true;
}

function initSeeds(mode, occupied, neighborCount, particles, n, offsets, rng) {
  const c = (n / 2) | 0;

  if (mode === "plane") {
    const y = Math.max(1, (n * 0.15) | 0);
    const r = Math.max(2, (n * 0.12) | 0);
    for (let x = c - r; x <= c + r; x++) {
      for (let z = c - r; z <= c + r; z++) {
        if ((x - c) * (x - c) + (z - c) * (z - c) <= r * r) {
          placeSeed(occupied, neighborCount, particles, x, y, z, n, offsets);
        }
      }
    }
    return;
  }

  if (mode === "line") {
    const len = Math.max(3, (n * 0.25) | 0);
    for (let i = -len; i <= len; i++) {
      placeSeed(occupied, neighborCount, particles, c + i, c, c, n, offsets);
    }
    return;
  }

  if (mode === "ring") {
    const r = Math.max(3, (n * 0.18) | 0);
    const steps = Math.max(12, (r * 6) | 0);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(c + Math.cos(a) * r);
      const z = Math.round(c + Math.sin(a) * r);
      placeSeed(occupied, neighborCount, particles, x, c, z, n, offsets);
    }
    return;
  }

  if (mode === "sphere") {
    const r = Math.max(3, (n * 0.2) | 0);
    const count = Math.max(24, (r * r) | 0);
    for (let i = 0; i < count; i++) {
      const [ux, uy, uz] = randomOnSphere(rng, false);
      const x = Math.round(c + ux * r);
      const y = Math.round(c + uy * r);
      const z = Math.round(c + uz * r);
      placeSeed(occupied, neighborCount, particles, x, y, z, n, offsets);
    }
    return;
  }

  // point (default)
  placeSeed(occupied, neighborCount, particles, c, c, c, n, offsets);
}

function launchParticle(mode, cx, cy, cz, launchR, n, rng) {
  let x;
  let y;
  let z;

  if (mode === "top") {
    const theta = 2 * Math.PI * rng();
    const rr = launchR * Math.sqrt(rng());
    x = Math.round(cx + Math.cos(theta) * rr);
    z = Math.round(cz + Math.sin(theta) * rr);
    y = Math.round(cy + launchR);
  } else if (mode === "equator") {
    const theta = 2 * Math.PI * rng();
    const yJitter = (rng() - 0.5) * launchR * 0.35;
    x = Math.round(cx + Math.cos(theta) * launchR);
    y = Math.round(cy + yJitter);
    z = Math.round(cz + Math.sin(theta) * launchR);
  } else if (mode === "hemisphere") {
    const [ux, uy, uz] = randomOnSphere(rng, true);
    x = Math.round(cx + ux * launchR);
    y = Math.round(cy + uy * launchR);
    z = Math.round(cz + uz * launchR);
  } else {
    const [ux, uy, uz] = randomOnSphere(rng, false);
    x = Math.round(cx + ux * launchR);
    y = Math.round(cy + uy * launchR);
    z = Math.round(cz + uz * launchR);
  }

  x = Math.max(1, Math.min(n - 2, x));
  y = Math.max(1, Math.min(n - 2, y));
  z = Math.max(1, Math.min(n - 2, z));
  return [x, y, z];
}

function stickParticle(occupied, neighborCount, particles, x, y, z, n, offsets, generation) {
  const i = idx(x, y, z, n);
  if (occupied[i]) return false;
  occupied[i] = 1;
  particles.push({ x, y, z, generation });
  for (const [dx, dy, dz] of offsets) {
    const nx = x + dx;
    const ny = y + dy;
    const nz = z + dz;
    if (!inBounds(nx, ny, nz, n)) continue;
    neighborCount[idx(nx, ny, nz, n)]++;
  }
  return true;
}

/**
 * Run DLA and return stuck particle voxels (grid coords) plus metadata.
 * @param {object} opts
 */
export function simulateDla(opts) {
  const n = Math.max(24, Math.min(128, Math.round(opts.gridSize ?? 64)));
  const targetCount = Math.max(10, Math.min(8000, Math.round(opts.particleCount ?? 1200)));
  const stickiness = Math.max(0.01, Math.min(1, opts.stickiness ?? 1));
  const minNeighbors = Math.max(1, Math.min(12, Math.round(opts.minNeighbors ?? 1)));
  const hitsRequired = Math.max(1, Math.min(80, Math.round(opts.hitsRequired ?? 1)));
  const upBias = Math.max(-1, Math.min(1, opts.upBias ?? 0));
  const outwardBias = Math.max(-1, Math.min(1, opts.outwardBias ?? 0));
  const noiseBias = Math.max(0, Math.min(1, opts.noiseBias ?? 0));
  const noiseScale = Math.max(0.02, Math.min(2, opts.noiseScale ?? 0.15));
  const seedMode = DLA_SEED_MODES.includes(opts.seedMode) ? opts.seedMode : "point";
  const launchMode = DLA_LAUNCH_MODES.includes(opts.launchMode)
    ? opts.launchMode
    : "sphere";
  const connectivity = opts.connectivity === "face" ? "face" : "full";
  const offsets = connectivity === "face" ? FACE_OFFSETS : FULL_OFFSETS;
  const rng = createRng(opts.seed ?? 42);
  const noiseSeed = Math.floor(opts.seed ?? 42) ^ 0x9e3779b9;

  const cellCount = n * n * n;
  const occupied = new Uint8Array(cellCount);
  const neighborCount = new Uint8Array(cellCount);
  const particles = [];

  initSeeds(seedMode, occupied, neighborCount, particles, n, offsets, rng);

  // Launch / kill relative to the growing cluster (Softology tip), not grid center.
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  for (const p of particles) {
    sumX += p.x;
    sumY += p.y;
    sumZ += p.z;
  }
  let cx = sumX / particles.length;
  let cy = sumY / particles.length;
  let cz = sumZ / particles.length;

  let maxR2 = 1;
  for (const p of particles) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dz = p.z - cz;
    maxR2 = Math.max(maxR2, dx * dx + dy * dy + dz * dz);
  }

  const moveChoices = offsets;
  const attemptFactor = Math.max(40, Math.ceil(80 / stickiness) * Math.max(1, hitsRequired));
  const maxAttempts = targetCount * attemptFactor;
  // Softology: early growth uses 1 neighbor so denser rules can take over later.
  const warmupCount = Math.min(targetCount, Math.max(40, minNeighbors * 40));
  let attempts = 0;
  let generation = 0;

  while (particles.length < targetCount && attempts < maxAttempts) {
    attempts++;
    generation++;

    cx = sumX / particles.length;
    cy = sumY / particles.length;
    cz = sumZ / particles.length;

    const maxR = Math.sqrt(maxR2);
    const launchR = Math.min((n * 0.48) | 0, Math.max(4, Math.ceil(maxR + 3)));
    const killR = Math.min((n * 0.49) | 0, launchR + 4);
    const killR2 = killR * killR;
    const maxSteps = Math.max(200, (launchR * launchR * 4) | 0);
    const needNeighbors =
      particles.length < warmupCount ? 1 : minNeighbors;

    let [x, y, z] = launchParticle(launchMode, cx, cy, cz, launchR, n, rng);
    if (occupied[idx(x, y, z, n)]) continue;

    let hits = 0;

    for (let step = 0; step < maxSteps; step++) {
      // Mostly Brownian; biases gently tilt the random walk (Softology / flow-field).
      const biasMix = Math.min(
        0.75,
        Math.abs(upBias) * 0.45 + Math.abs(outwardBias) * 0.45 + noiseBias * 0.55
      );
      let nx = x;
      let ny = y;
      let nz = z;

      if (biasMix > 0.02 && rng() < biasMix) {
        let best = null;
        let bestScore = -Infinity;
        for (let c = 0; c < 3; c++) {
          const [dx, dy, dz] = moveChoices[(rng() * moveChoices.length) | 0];
          const tx = x + dx;
          const ty = y + dy;
          const tz = z + dz;
          if (!inBounds(tx, ty, tz, n)) continue;
          if (occupied[idx(tx, ty, tz, n)]) continue;

          let score = rng();
          if (upBias !== 0) score += upBias * dy * 0.8;
          if (outwardBias !== 0) {
            const rx = tx - cx;
            const ry = ty - cy;
            const rz = tz - cz;
            const len = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
            score += outwardBias * ((rx * dx + ry * dy + rz * dz) / len) * 0.8;
          }
          if (noiseBias > 0) {
            const [gx, gy, gz] = noiseGradient(tx, ty, tz, noiseScale, noiseSeed);
            score += noiseBias * (gx * dx + gy * dy + gz * dz);
          }
          if (score > bestScore) {
            bestScore = score;
            best = [tx, ty, tz];
          }
        }
        if (!best) break;
        nx = best[0];
        ny = best[1];
        nz = best[2];
      } else {
        const [dx, dy, dz] = moveChoices[(rng() * moveChoices.length) | 0];
        nx = x + dx;
        ny = y + dy;
        nz = z + dz;
        if (!inBounds(nx, ny, nz, n)) break;
        if (occupied[idx(nx, ny, nz, n)]) continue;
      }

      x = nx;
      y = ny;
      z = nz;

      const dx = x - cx;
      const dy = y - cy;
      const dz = z - cz;
      if (dx * dx + dy * dy + dz * dz > killR2) break;

      const nCount = neighborCount[idx(x, y, z, n)];
      if (nCount >= needNeighbors) {
        hits++;
        if (hits >= hitsRequired && rng() <= stickiness) {
          if (
            stickParticle(
              occupied,
              neighborCount,
              particles,
              x,
              y,
              z,
              n,
              offsets,
              generation
            )
          ) {
            sumX += x;
            sumY += y;
            sumZ += z;
            const ocx = sumX / particles.length;
            const ocy = sumY / particles.length;
            const ocz = sumZ / particles.length;
            if ((particles.length & 63) === 0) {
              maxR2 = 1;
              for (const p of particles) {
                const px = p.x - ocx;
                const py = p.y - ocy;
                const pz = p.z - ocz;
                maxR2 = Math.max(maxR2, px * px + py * py + pz * pz);
              }
            } else {
              const rdx = x - ocx;
              const rdy = y - ocy;
              const rdz = z - ocz;
              maxR2 = Math.max(maxR2, rdx * rdx + rdy * rdy + rdz * rdz);
            }
          }
          break;
        }
      }
    }
  }

  return {
    particles,
    gridSize: n,
    center: [cx, cy, cz],
  };
}
