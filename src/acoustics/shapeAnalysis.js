import * as THREE from "three";
import { detectLopezRosChambers } from "./lopezRosChambers.js";

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _pc = new THREE.Vector3();

/**
 * Detect acoustic chambers as thick lumps (bulges) along the torus ring.
 * Chamber points sit inside the tube cavity; the network is a serial chain.
 */
export function analyzeShape(
  mesh,
  { sampleCount = 1024, noiseMix = 0, noiseEnabled = false, shape = null } = {}
) {
  if (!mesh?.geometry?.attributes?.position) {
    return emptyAnalysis();
  }

  const geometry = mesh.geometry;
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const count = pos.count;

  mesh.updateMatrixWorld(true);
  const matrix = mesh.matrixWorld;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);

  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const deformation = measureDeformation(geometry);
  const basePos = geometry.userData?.basePosition;
  const baseNormAttr = geometry.userData?.baseNormal;

  const uvAttr = geometry.attributes.uv;

  const step = Math.max(1, Math.floor(count / sampleCount));
  const rawSamples = [];

  for (let i = 0; i < count; i += step) {
    _v.fromBufferAttribute(pos, i);
    _v.applyMatrix4(matrix);

    _n.set(0, 0, 0);
    if (baseNormAttr) {
      const i3 = i * 3;
      _n.set(baseNormAttr[i3], baseNormAttr[i3 + 1], baseNormAttr[i3 + 2]);
      _n.applyMatrix3(normalMatrix).normalize();
    } else if (index) {
      accumulateVertexNormal(geometry, i, _n);
    } else {
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      _n.fromBufferAttribute(geometry.attributes.normal, i);
      _n.applyMatrix3(normalMatrix).normalize();
    }

    let bx = _v.x, by = _v.y, bz = _v.z;
    if (basePos) {
      const i3 = i * 3;
      _pb.set(basePos[i3], basePos[i3 + 1], basePos[i3 + 2]).applyMatrix4(matrix);
      bx = _pb.x;
      by = _pb.y;
      bz = _pb.z;
    }

    const displacement = deformation.perVertex ? deformation.perVertex[i] : 0;
    const ringT = uvAttr ? uvAttr.getX(i) : null;
    const axialT = uvAttr ? uvAttr.getY(i) : null;

    rawSamples.push({
      index: i,
      x: _v.x,
      y: _v.y,
      z: _v.z,
      bx,
      by,
      bz,
      nx: _n.x,
      ny: _n.y,
      nz: _n.z,
      displacement,
      ringT,
      axialT,
    });
  }

  const samples = rawSamples.map((s) => enrichSample(s));
  const meanMajor = computeMeanMajorRadius(samples);
  const acousticLayout = geometry.userData?.acousticLayout ?? null;

  const { chambers, assignments, mode } = detectChambers(samples, {
    deformation,
    meanMajor,
    acousticLayout,
    shape,
  });
  const network = buildChamberChain(chambers, meanMajor, acousticLayout);
  const timbre = estimateTimbre(chambers, {
    noiseMix: noiseEnabled ? noiseMix : 0,
    deformation,
    mode,
  });

  return {
    vertexCount: count,
    sampleCount: samples.length,
    samples,
    assignments,
    chambers,
    network,
    timbre,
    deformation,
    mode,
    meanMajor,
    bounds: computeBounds(samples),
  };
}

function emptyAnalysis() {
  return {
    vertexCount: 0,
    sampleCount: 0,
    samples: [],
    assignments: [],
    chambers: [],
    network: { nodes: [], edges: [], chain: [] },
    timbre: { purity: 1, modulation: 0, resonanceIndex: 0, harmonicStack: "perfect" },
    deformation: { rms: 0, max: 0, relativeRms: 0, relativeMax: 0 },
    mode: "empty",
    meanMajor: 1,
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
  };
}

function computeMeanMajorRadius(samples) {
  if (samples.length === 0) return 1;
  let sum = 0;
  for (const s of samples) {
    sum += Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
  }
  return sum / samples.length;
}

function enrichSample(s) {
  const ringAngle =
    s.ringT != null ? s.ringT * Math.PI * 2 - Math.PI : Math.atan2(s.y, s.x);
  const axialT = s.axialT != null ? s.axialT : null;

  const dx = s.x - s.bx;
  const dy = s.y - s.by;
  const dz = s.z - s.bz;
  const outward = dx * s.nx + dy * s.ny + dz * s.nz;
  const bulge = Math.max(0, outward);

  return {
    ...s,
    ringAngle,
    axialT,
    outward,
    bulge,
    thicknessDelta: bulge,
    lumpScore: bulge,
    thickness: bulge,
  };
}

function measureDeformation(geometry) {
  const basePos = geometry.userData?.basePosition;
  const pos = geometry.attributes.position;
  const radius = geometry.boundingSphere?.radius || 1;

  if (!basePos || !pos) {
    return { rms: 0, max: 0, relativeRms: 0, relativeMax: 0, perVertex: null, radius };
  }

  const perVertex = new Float32Array(pos.count);
  let sumSq = 0;
  let max = 0;

  for (let i = 0; i < pos.count; i++) {
    const i3 = i * 3;
    const dx = pos.array[i3] - basePos[i3];
    const dy = pos.array[i3 + 1] - basePos[i3 + 1];
    const dz = pos.array[i3 + 2] - basePos[i3 + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    perVertex[i] = d;
    sumSq += d * d;
    max = Math.max(max, d);
  }

  const rms = Math.sqrt(sumSq / pos.count);
  return { rms, max, relativeRms: rms / radius, relativeMax: max / radius, perVertex, radius };
}

function isUniformCavity({ deformation, samples }) {
  const maxBulge = Math.max(...samples.map((s) => s.bulge ?? 0), 0);
  if (deformation.relativeMax < 0.012 && maxBulge < deformation.radius * 0.012) {
    return true;
  }

  const { profile } = buildBulgeProfile(samples);
  const max = Math.max(...profile, 0);
  const min = Math.min(...profile);
  const range = max - min;
  if (max <= 0) return true;
  return range / max < 0.1 && deformation.relativeMax < 0.025;
}

function detectChambers(samples, { deformation, meanMajor, acousticLayout, shape }) {
  if (samples.length === 0) return { chambers: [], assignments: [], mode: "empty" };

  if (
    acousticLayout?.kind === "catenoids" ||
    acousticLayout?.kind === "lopezRos" ||
    shape === "catenoids" ||
    shape === "lopezros"
  ) {
    if (acousticLayout?.segments?.length) {
      return detectLopezRosChambers(samples, acousticLayout, { deformation, meanMajor });
    }
  }

  if (isUniformCavity({ deformation, samples })) {
    return { ...buildSingleChamber(samples, meanMajor), mode: "uniform" };
  }

  const lumps = detectLumps(samples, deformation, meanMajor);
  if (lumps.length === 0) {
    return { ...buildSingleChamber(samples, meanMajor), mode: "uniform" };
  }

  const chambers = lumps.map((lump, i) => {
    const { chambers: [chamber] } = lumpToChamber(lump, i, meanMajor, deformation);
    return chamber;
  });

  const assignments = assignSamplesToLumps(samples, lumps, chambers);
  return { chambers, assignments, mode: "deformed" };
}

const RING_BINS = 72;

function sampleToBin(s, bins = RING_BINS) {
  if (s.ringT != null) {
    const t = ((s.ringT % 1) + 1) % 1;
    return Math.min(bins - 1, Math.floor(t * bins));
  }
  return angleToBin(s.ringAngle, bins);
}

function buildBulgeProfile(samples, bins = RING_BINS) {
  const maxBulge = new Array(bins).fill(0);
  const segments = Array.from({ length: bins }, () => []);

  for (const s of samples) {
    const bin = sampleToBin(s, bins);
    const bulge = s.bulge ?? 0;
    maxBulge[bin] = Math.max(maxBulge[bin], bulge);
    segments[bin].push(s);
  }

  return { profile: smoothCircular(maxBulge, 5), peakProfile: maxBulge, segments, bins };
}

function detectLumps(samples, deformation, meanMajor) {
  const bins = RING_BINS;
  const { profile, peakProfile, segments } = buildBulgeProfile(samples, bins);
  const max = Math.max(...profile, 0);
  const min = Math.min(...profile);
  const range = max - min;

  if (max < 1e-6) return [];
  if (range / max < 0.08 && deformation.relativeMax < 0.02) return [];

  const minProminence = Math.max(
    max * 0.004,
    range * 0.006,
    deformation.radius * 0.001
  );
  const relaxedProminence = Math.max(minProminence * 0.25, range * 0.0015);
  let peaks = mergePeakLists(
    findLocalMaxima(peakProfile, minProminence, 2),
    findLocalMaxima(peakProfile, relaxedProminence, 3)
  );
  peaks = mergeNearbyPeaks(peaks, bins, 2);

  if (peaks.length === 0) return [];

  let lumps = segmentLumpsByValleys(profile, peaks, segments, bins, meanMajor);

  lumps = lumps.filter(
    (l) =>
      l.prominence >= max * 0.22 &&
      l.samples.length >= Math.max(3, samples.length * 0.006)
  );

  return lumps.sort((a, b) => a.ringAngle - b.ringAngle);
}

function findLocalMaxima(profile, minProminence, radius = 2) {
  const n = profile.length;
  const peaks = [];
  const globalMax = Math.max(...profile, 0);

  for (let i = 0; i < n; i++) {
    const v = profile[i];
    if (v <= 0) continue;

    let isPeak = true;
    for (let k = -radius; k <= radius; k++) {
      if (k === 0) continue;
      if (profile[(i + k + n) % n] > v) {
        isPeak = false;
        break;
      }
    }
    if (!isPeak) continue;

    const prominence = wideProminence(profile, i, 4);
    if (prominence >= minProminence || v >= globalMax * 0.32) {
      peaks.push({ bin: i, value: v, prominence });
    }
  }

  return peaks.sort((a, b) => b.value - a.value);
}

function wideProminence(profile, index, radius) {
  const n = profile.length;
  const v = profile[index];
  let leftMin = Infinity;
  let rightMin = Infinity;

  for (let k = 1; k <= radius; k++) {
    leftMin = Math.min(leftMin, profile[(index - k + n) % n]);
    rightMin = Math.min(rightMin, profile[(index + k) % n]);
  }

  return v - Math.max(leftMin, rightMin);
}

function mergePeakLists(a, b) {
  const byBin = new Map();
  for (const peak of [...a, ...b]) {
    const existing = byBin.get(peak.bin);
    if (!existing || peak.value > existing.value) byBin.set(peak.bin, peak);
  }
  return [...byBin.values()].sort((x, y) => x.bin - y.bin);
}

function mergeNearbyPeaks(peaks, bins, minSep) {
  const kept = [];
  for (const peak of peaks) {
    if (kept.every((k) => circularBinDistance(k.bin, peak.bin, bins) >= minSep)) {
      kept.push(peak);
    }
  }
  return kept.sort((a, b) => a.bin - b.bin);
}

function circularBinDistance(a, b, bins) {
  const d = Math.abs(a - b);
  return Math.min(d, bins - d);
}

function segmentLumpsByValleys(profile, peaks, segments, bins, meanMajor) {
  const peakBins = peaks.map((p) => p.bin).sort((a, b) => a - b);
  if (peakBins.length === 0) return [];

  const lumps = [];
  for (let i = 0; i < peakBins.length; i++) {
    const peakBin = peakBins[i];
    const leftPeak = peakBins[(i - 1 + peakBins.length) % peakBins.length];
    const rightPeak = peakBins[(i + 1) % peakBins.length];

    const leftValley = findValleyBetween(profile, leftPeak, peakBin, bins);
    const rightValley = findValleyBetween(profile, peakBin, rightPeak, bins);
    const regionBins = collectRegionBins(leftValley, rightValley, bins);

    if (regionBins.length < 2) continue;

    const peakValue = profile[peakBin];
    const lump = lumpFromRegion(
      { bins: regionBins, peakValue },
      segments,
      profile,
      bins,
      meanMajor
    );
    if (lump) lumps.push(lump);
  }

  return lumps;
}

function findValleyBetween(profile, fromBin, toBin, bins) {
  let min = Infinity;
  let minBin = fromBin;
  let b = (fromBin + 1) % bins;
  const steps = circularBinDistance(fromBin, toBin, bins);

  for (let s = 0; s < steps; s++) {
    if (profile[b] < min) {
      min = profile[b];
      minBin = b;
    }
    b = (b + 1) % bins;
  }

  return minBin;
}

function collectRegionBins(leftValley, rightValley, bins) {
  const regionBins = [];
  let b = (leftValley + 1) % bins;
  let guard = 0;
  while (b !== (rightValley + 1) % bins && guard <= bins) {
    regionBins.push(b);
    b = (b + 1) % bins;
    guard++;
  }
  return regionBins;
}

function lumpFromRegion(region, segments, profile, bins, meanMajor) {
  const lumpSamples = region.bins.flatMap((b) => segments[b]);
  if (lumpSamples.length === 0) return null;

  const meanThickness =
    lumpSamples.reduce((a, s) => a + estimateBaseTubeRadius(s, meanMajor), 0) /
    lumpSamples.length;
  const meanDelta =
    lumpSamples.reduce((a, s) => a + (s.bulge ?? 0), 0) / lumpSamples.length;
  const ringAngle = bulgeWeightedAngle(lumpSamples);

  return {
    ringAngle,
    samples: lumpSamples,
    meanThickness,
    meanLump: meanDelta,
    prominence: region.peakValue ?? meanDelta,
    bins: region.bins,
    binCount: bins,
  };
}

function estimateBaseTubeRadius(s, meanMajor) {
  const theta = Math.atan2(s.by, s.bx);
  const cx = meanMajor * Math.cos(theta);
  const cy = meanMajor * Math.sin(theta);
  return Math.hypot(s.bx - cx, s.by - cy, s.bz);
}

function bulgeWeightedAngle(samples) {
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (const s of samples) {
    const w = 0.02 + (s.bulge ?? 0);
    sx += Math.cos(s.ringAngle) * w;
    sy += Math.sin(s.ringAngle) * w;
    sw += w;
  }
  if (sw > 0) return Math.atan2(sy / sw, sx / sw);
  return meanAngle(samples.map((s) => s.ringAngle));
}

function findCircularRegions(values, threshold, minWidth) {
  const n = values.length;
  const active = values.map((v) => v >= threshold);
  const doubled = active.concat(active);
  const regions = [];
  let start = -1;

  for (let i = 0; i < doubled.length; i++) {
    if (doubled[i] && start === -1) start = i;
    if (!doubled[i] && start !== -1) {
      const width = i - start;
      if (width >= minWidth && width <= n) {
        const bins = [];
        for (let j = start; j < i; j++) bins.push(j % n);
        const peakValue = Math.max(...bins.map((b) => values[b]));
        regions.push({ bins, width, peakValue });
      }
      start = -1;
    }
  }

  return dedupeWrapRegions(regions, n);
}

function dedupeWrapRegions(regions, n) {
  if (regions.length < 2) return regions;
  const first = regions[0];
  const last = regions[regions.length - 1];
  if (first.bins[0] === 0 && last.bins[last.bins.length - 1] === n - 1) {
    const merged = {
      bins: [...last.bins, ...first.bins],
      width: last.width + first.width,
      peakValue: Math.max(last.peakValue, first.peakValue),
    };
    return [merged, ...regions.slice(1, -1)];
  }
  return regions;
}

function lumpToChamber(lump, id, meanMajor, deformation) {
  const interior = cavityCenterForLump(lump);
  const binCount = lump.binCount ?? RING_BINS;
  const angularSpan = lump.bins.length * ((2 * Math.PI) / binCount);
  const volumeProxy = lump.meanThickness * lump.meanThickness * angularSpan * meanMajor;
  const resonance = lump.meanLump / Math.max(1e-4, deformation.radius * 0.04);

  const chamber = {
    id,
    position: [interior.x, interior.y, interior.z],
    surfacePosition: computeCentroid(lump.samples),
    ringAngle: lump.ringAngle,
    thickness: lump.meanThickness,
    lumpScore: lump.meanLump,
    volume: volumeProxy,
    angularSpan,
    sampleCount: lump.samples.length,
    resonance: Math.max(0.05, resonance),
    concavity: lump.meanLump / Math.max(1e-4, lump.meanThickness),
    purity: Math.max(0.15, 1 - lump.meanLump / Math.max(1e-4, deformation.max * 0.8)),
    driftHz: lump.meanLump * 4,
    displacement: lump.meanLump,
    label: `lump ${id}`,
    chainIndex: id,
  };

  const assignments = lump.samples.map(() => id);
  return { chambers: [chamber], assignments };
}

function buildSingleChamber(samples, meanMajor) {
  const ringAngle = stableRingAngle(samples);
  const interior = cavityCenterOnRing(ringAngle, meanMajor);
  const meanThickness =
    samples.reduce((a, s) => a + estimateBaseTubeRadius(s, meanMajor), 0) / samples.length;

  const chamber = {
    id: 0,
    position: [interior.x, interior.y, interior.z],
    surfacePosition: computeCentroid(samples),
    ringAngle,
    thickness: meanThickness,
    lumpScore: 0,
    volume: meanThickness * meanMajor * Math.PI * 2,
    angularSpan: Math.PI * 2,
    sampleCount: samples.length,
    resonance: 0.02,
    concavity: 0,
    purity: 1,
    driftHz: 0,
    displacement: 0,
    label: "torus cavity",
    chainIndex: 0,
  };

  return {
    chambers: [chamber],
    assignments: samples.map(() => 0),
  };
}

/** Interior point at the bulge, weighted toward highest outward displacement. */
function cavityCenterForLump(lump) {
  let wx = 0, wy = 0, wz = 0, wSum = 0;
  for (const s of lump.samples) {
    const w = 0.05 + (s.bulge ?? 0) * 4;
    wx += s.x * w;
    wy += s.y * w;
    wz += s.z * w;
    wSum += w;
  }
  if (wSum <= 0) {
    const c = computeCentroid(lump.samples);
    return c;
  }
  return { x: wx / wSum, y: wy / wSum, z: wz / wSum };
}

/** Acoustic center on the torus tube medial axis (XY major ring). */
function cavityCenterOnRing(ringAngle, meanMajor) {
  return {
    x: meanMajor * Math.cos(ringAngle),
    y: meanMajor * Math.sin(ringAngle),
    z: 0,
  };
}

/** Symmetric torus → stable angle; avoids random cancellation around the ring. */
function stableRingAngle(samples) {
  let sx = 0;
  let sy = 0;
  for (const s of samples) {
    sx += Math.cos(s.ringAngle);
    sy += Math.sin(s.ringAngle);
  }
  const mag = Math.hypot(sx, sy) / Math.max(1, samples.length);
  if (mag < 0.2) return 0;
  return Math.atan2(sy, sx);
}

function buildChamberChain(chambers, meanMajor, acousticLayout = null) {
  const linear = acousticLayout?.linearChain === true;
  const axialLength = acousticLayout?.axialLength ?? meanMajor;

  const sorted = linear
    ? [...chambers].sort((a, b) => (a.axialPos ?? 0) - (b.axialPos ?? 0))
    : [...chambers].sort((a, b) => a.ringAngle - b.ringAngle);
  const chain = sorted.map((c, i) => ({ ...c, chainIndex: i, id: i }));

  const nodes = chain.map((c) => ({
    id: c.id,
    position: c.position,
    ringAngle: c.ringAngle,
    thickness: c.thickness,
    resonance: c.resonance,
    label: c.label,
  }));

  if (chain.length <= 1) {
    return { nodes, edges: [], chain };
  }

  const edges = [];
  const edgeCount = linear ? chain.length - 1 : chain.length;

  for (let i = 0; i < edgeCount; i++) {
    const a = chain[i];
    const b = chain[linear ? i + 1 : (i + 1) % chain.length];
    const throat = Math.min(a.thickness, b.thickness);

    let arcLength;
    if (linear) {
      arcLength = Math.abs((b.axialPos ?? 0) - (a.axialPos ?? 0)) * axialLength;
    } else {
      arcLength = angularDistance(a.ringAngle, b.ringAngle) * meanMajor;
    }

    const coupling = ((a.resonance + b.resonance) * throat) / (1 + arcLength * 0.35);

    edges.push({
      from: a.id,
      to: b.id,
      weight: coupling,
      distance: arcLength,
      delayMs: arcLength * 3.2,
      throat,
      chain: true,
    });
  }

  return { nodes, edges, chain };
}

function assignSamplesToLumps(samples, lumps, chambers) {
  return samples.map((s) => {
    let best = 0;
    let bestScore = Infinity;
    for (let i = 0; i < lumps.length; i++) {
      const angleDiff = angularDistance(s.ringAngle, lumps[i].ringAngle);
      const delta = s.bulge ?? 0;
      const score = angleDiff / (0.15 + delta * 2);
      if (score < bestScore) {
        bestScore = score;
        best = chambers[i]?.id ?? i;
      }
    }
    return best;
  });
}

function angleToBin(angle, bins) {
  return Math.min(bins - 1, Math.floor(((angle + Math.PI) / (2 * Math.PI)) * bins));
}

function smoothCircular(values, window) {
  const n = values.length;
  const half = Math.floor(window / 2);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let k = -half; k <= half; k++) {
      const idx = (i + k + n) % n;
      sum += values[idx];
      count++;
    }
    out[i] = sum / count;
  }
  return out;
}

function angularDistance(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function meanAngle(angles) {
  let sx = 0, sz = 0;
  for (const a of angles) {
    sx += Math.cos(a);
    sz += Math.sin(a);
  }
  return Math.atan2(sz, sx);
}

function accumulateVertexNormal(geometry, vi, target) {
  const index = geometry.index.array;
  for (let f = 0; f < index.length; f += 3) {
    if (index[f] !== vi && index[f + 1] !== vi && index[f + 2] !== vi) continue;
    const a = index[f];
    const b = index[f + 1];
    const c = index[f + 2];
    const pa = _v.fromBufferAttribute(geometry.attributes.position, a);
    const pb = _pb.fromBufferAttribute(geometry.attributes.position, b);
    const pc = _pc.fromBufferAttribute(geometry.attributes.position, c);
    const fn = new THREE.Vector3()
      .subVectors(pb, pa)
      .cross(new THREE.Vector3().subVectors(pc, pa))
      .normalize();
    target.add(fn);
  }
  if (target.lengthSq() > 0) target.normalize();
}

function variance(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}

function computeCentroid(samples) {
  let sx = 0, sy = 0, sz = 0;
  for (const s of samples) {
    sx += s.x;
    sy += s.y;
    sz += s.z;
  }
  const n = samples.length || 1;
  return { x: sx / n, y: sy / n, z: sz / n };
}

function estimateTimbre(chambers, { noiseMix, deformation, mode }) {
  if (chambers.length === 0) {
    return { purity: 1, modulation: 0, resonanceIndex: 0, harmonicStack: "perfect" };
  }

  if (mode === "uniform") {
    const purity = Math.max(0.92, 1 - deformation.relativeRms * 20 - noiseMix * 0.3);
    return {
      purity,
      modulation: 1 - purity,
      resonanceIndex: chambers[0]?.resonance ?? 0,
      harmonicStack: purity > 0.9 ? "perfect" : "harmonic",
    };
  }

  if (mode === "lopezRos" || mode === "catenoids") {
    const chamberSpread = Math.min(1, (chambers.length - 1) / 6);
    const meanLump = chambers.reduce((s, c) => s + (c.lumpScore ?? 0), 0) / chambers.length;
    const modulation = Math.min(
      1,
      noiseMix * 0.45 + chamberSpread * 0.3 + (meanLump / Math.max(1e-4, deformation.max)) * 0.5
    );
    const purity = Math.max(0.1, 1 - modulation);
    const harmonicStack = purity > 0.7 ? "harmonic" : modulation > 0.4 ? "drifting" : "modulated";
    return {
      purity,
      modulation,
      resonanceIndex: chambers.reduce((s, c) => s + c.resonance, 0) / chambers.length,
      harmonicStack,
    };
  }

  const chamberSpread = Math.min(1, (chambers.length - 1) / 5);
  const meanLump = chambers.reduce((s, c) => s + (c.lumpScore ?? 0), 0) / chambers.length;

  const modulation = Math.min(
    1,
    noiseMix * 0.5 + chamberSpread * 0.35 + (meanLump / Math.max(1e-4, deformation.max)) * 0.55
  );
  const purity = Math.max(0, 1 - modulation);

  let harmonicStack = "modulated";
  if (purity > 0.75) harmonicStack = "harmonic";
  else if (modulation > 0.45) harmonicStack = "drifting";

  const resonanceIndex =
    chambers.reduce((s, c) => s + c.resonance, 0) / chambers.length;

  return { purity, modulation, resonanceIndex, harmonicStack };
}

function computeBounds(samples) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const s of samples) {
    min[0] = Math.min(min[0], s.x);
    min[1] = Math.min(min[1], s.y);
    min[2] = Math.min(min[2], s.z);
    max[0] = Math.max(max[0], s.x);
    max[1] = Math.max(max[1], s.y);
    max[2] = Math.max(max[2], s.z);
  }
  return { min, max };
}

export function findChamberAtPoint(point, analysis) {
  if (!analysis?.chambers?.length) return null;
  const p = point.isVector3 ? point : new THREE.Vector3(point.x, point.y, point.z);

  if (analysis.chambers.length === 1) return analysis.chambers[0].id;

  let best = analysis.chambers[0].id;
  let bestDist = Infinity;
  for (const c of analysis.chambers) {
    const dx = p.x - c.position[0];
    const dy = p.y - c.position[1];
    const dz = p.z - c.position[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      best = c.id;
    }
  }
  return best;
}
