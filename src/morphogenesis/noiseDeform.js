import * as THREE from "three";
import { triangleLfo } from "../math/lfo.js";
import { createPerlin3D, sampleFbm3 } from "../math/perlin.js";
import { NOISE_TARGETS, NOISE_TARGET_LABELS } from "./dla/constants.js";

export { NOISE_TARGETS, NOISE_TARGET_LABELS };

const _point = new THREE.Vector3();
const _offset = new THREE.Vector3();
const noiseCache = new Map();

function getNoise3d(seed) {
  const key = Math.floor(seed);
  if (!noiseCache.has(key)) noiseCache.set(key, createPerlin3D(key));
  return noiseCache.get(key);
}

export function captureBaseGeometry(geometry) {
  const position = geometry.attributes.position;
  geometry.userData.basePosition = new Float32Array(position.array);
  geometry.computeVertexNormals();
  geometry.userData.baseNormal = new Float32Array(geometry.attributes.normal.array);
}

function getNoiseScale(params, timeSeconds) {
  const base = params.noiseScale;
  if (!params.noiseScaleModEnabled) return base;
  const amount = params.noiseScaleModAmount;
  const min = Math.max(0.1, base - amount);
  const max = base + amount;
  return triangleLfo(timeSeconds, params.noiseScaleModRate, min, max);
}

function applyWholeNoise(geometry, params, mix, timeSeconds) {
  const basePos = geometry.userData.basePosition;
  const baseNorm = geometry.userData.baseNormal;
  const position = geometry.attributes.position;

  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const displacementScale = geometry.boundingSphere.radius * params.noiseAmplitude;

  const noise3d = getNoise3d(params.noiseSeed);
  const freq = getNoiseScale(params, timeSeconds) * 0.08;
  const octaves = Math.max(1, Math.floor(params.noiseOctaves));

  for (let i = 0; i < position.count; i++) {
    const i3 = i * 3;
    _point.set(basePos[i3], basePos[i3 + 1], basePos[i3 + 2]);

    const n = sampleFbm3(noise3d, _point.x * freq, _point.y * freq, _point.z * freq, octaves);
    const offset = n * displacementScale * mix;

    position.array[i3] = basePos[i3] + baseNorm[i3] * offset;
    position.array[i3 + 1] = basePos[i3 + 1] + baseNorm[i3 + 1] * offset;
    position.array[i3 + 2] = basePos[i3 + 2] + baseNorm[i3 + 2] * offset;
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

/**
 * Rigid per-element deform: sample noise at each particle center, translate
 * (and lightly scale) the whole element so blobs jiggle independently.
 */
function applyElementNoise(geometry, params, mix, timeSeconds) {
  const basePos = geometry.userData.basePosition;
  const position = geometry.attributes.position;
  const vertsPer = geometry.userData.elementVertsPer | 0;
  const elementCount = geometry.userData.elementCount | 0;
  if (!vertsPer || !elementCount) {
    applyWholeNoise(geometry, params, mix, timeSeconds);
    return;
  }

  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const displacementScale = geometry.boundingSphere.radius * params.noiseAmplitude;

  const noise3d = getNoise3d(params.noiseSeed);
  const freq = getNoiseScale(params, timeSeconds) * 0.08;
  const octaves = Math.max(1, Math.floor(params.noiseOctaves));
  // Slightly different seeds for XYZ so motion isn't axis-locked.
  const seed = Math.floor(params.noiseSeed) || 1;

  for (let e = 0; e < elementCount; e++) {
    const vertStart = e * vertsPer;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < vertsPer; i++) {
      const i3 = (vertStart + i) * 3;
      cx += basePos[i3];
      cy += basePos[i3 + 1];
      cz += basePos[i3 + 2];
    }
    cx /= vertsPer;
    cy /= vertsPer;
    cz /= vertsPer;

    const nx = sampleFbm3(noise3d, cx * freq + seed * 0.17, cy * freq, cz * freq, octaves);
    const ny = sampleFbm3(noise3d, cx * freq, cy * freq + seed * 0.31, cz * freq, octaves);
    const nz = sampleFbm3(noise3d, cx * freq, cy * freq, cz * freq + seed * 0.47, octaves);
    const ns = sampleFbm3(
      noise3d,
      cx * freq + 19.1,
      cy * freq + 23.7,
      cz * freq + 29.3,
      octaves
    );

    _offset.set(nx, ny, nz).multiplyScalar(displacementScale * mix);
    const scale = 1 + ns * params.noiseAmplitude * mix * 0.45;

    for (let i = 0; i < vertsPer; i++) {
      const i3 = (vertStart + i) * 3;
      const bx = basePos[i3];
      const by = basePos[i3 + 1];
      const bz = basePos[i3 + 2];
      position.array[i3] = cx + (bx - cx) * scale + _offset.x;
      position.array[i3 + 1] = cy + (by - cy) * scale + _offset.y;
      position.array[i3 + 2] = cz + (bz - cz) * scale + _offset.z;
    }
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

export function applyNoiseDeform(geometry, params, mix, timeSeconds = 0) {
  const basePos = geometry.userData.basePosition;
  const baseNorm = geometry.userData.baseNormal;
  if (!basePos || !baseNorm) return;

  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;

  if (mix <= 0.0001) {
    position.array.set(basePos);
    normal.array.set(baseNorm);
    position.needsUpdate = true;
    normal.needsUpdate = true;
    return;
  }

  const target = params.noiseTarget === "element" ? "element" : "whole";
  if (target === "element") {
    applyElementNoise(geometry, params, mix, timeSeconds);
  } else {
    applyWholeNoise(geometry, params, mix, timeSeconds);
  }
}
