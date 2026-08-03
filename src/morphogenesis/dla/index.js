import { simulateDla, DLA_SEED_MODES, DLA_LAUNCH_MODES, DLA_CONNECTIVITY } from "./simulate.js";
import { particlesToGeometry, DLA_ELEMENT_SHAPES, DLA_ELEMENT_SHAPE_LABELS } from "./geometry.js";
import {
  DLA_SEED_MODE_LABELS,
  DLA_LAUNCH_MODE_LABELS,
  DLA_CONNECTIVITY_LABELS,
} from "./constants.js";

export {
  DLA_SEED_MODES,
  DLA_LAUNCH_MODES,
  DLA_CONNECTIVITY,
  DLA_ELEMENT_SHAPES,
  DLA_ELEMENT_SHAPE_LABELS,
  DLA_SEED_MODE_LABELS,
  DLA_LAUNCH_MODE_LABELS,
  DLA_CONNECTIVITY_LABELS,
};

/** Cache last simulation so mesh-only params (radius / detail) can update cheaply under LFO. */
let simCache = { key: "", particles: null, gridSize: 0 };

function simulationKey(params) {
  return [
    params.dlaGridSize,
    params.dlaParticleCount,
    params.dlaStickiness,
    params.dlaMinNeighbors,
    params.dlaHitsRequired,
    params.dlaUpBias,
    params.dlaOutwardBias,
    params.dlaNoiseBias,
    params.dlaNoiseScale,
    params.dlaSeedMode,
    params.dlaLaunchMode,
    params.dlaConnectivity,
    params.dlaSeed,
  ].join("|");
}

/**
 * Morphogenesis entry: DLA simulation → clustered element mesh,
 * fitted to extent × envelopeRadius like other procedural shapes.
 */
export function createDlaGeometry(extent, params) {
  const key = simulationKey(params);
  if (simCache.key !== key || !simCache.particles) {
    const result = simulateDla({
      gridSize: params.dlaGridSize,
      particleCount: params.dlaParticleCount,
      stickiness: params.dlaStickiness,
      minNeighbors: params.dlaMinNeighbors,
      hitsRequired: params.dlaHitsRequired,
      upBias: params.dlaUpBias,
      outwardBias: params.dlaOutwardBias,
      noiseBias: params.dlaNoiseBias,
      noiseScale: params.dlaNoiseScale,
      seedMode: params.dlaSeedMode,
      launchMode: params.dlaLaunchMode,
      connectivity: params.dlaConnectivity,
      seed: params.dlaSeed,
    });
    simCache = {
      key,
      particles: result.particles,
      gridSize: result.gridSize,
    };
  }

  const targetSize = Math.max(0.1, extent * (params.envelopeRadius ?? 1));

  return particlesToGeometry(simCache.particles, {
    gridSize: simCache.gridSize,
    particleRadius: params.dlaParticleRadius ?? 0.85,
    meshDetail: params.dlaMeshDetail ?? 1,
    elementShape: params.dlaElementShape ?? "sphere",
    orientRandom: params.dlaOrientRandom ?? 1,
    orientSeed: params.dlaSeed ?? 42,
    targetSize,
  });
}
