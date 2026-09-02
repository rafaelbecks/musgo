const AXIAL_BINS = 48;

/**
 * Chambers along the López–Ros axis: bells, necks, plus optional bulge splits from noise.
 */
export function detectLopezRosChambers(samples, acousticLayout, { deformation, meanMajor }) {
  if (!samples.length || !acousticLayout?.segments?.length) {
    return { chambers: [], assignments: [], mode: "catenoids" };
  }

  const segments = acousticLayout.segments;
  let bellIdx = 0;
  let neckIdx = 0;

  let chambers = segments
    .map((seg, id) => {
      const kind = seg.kind === "connector" ? "neck" : seg.kind;
      const label = kind === "neck" ? `neck ${neckIdx++}` : `bell ${bellIdx++}`;
      return segmentToChamber(seg, id, label, kind, samples, deformation, meanMajor);
    })
    .filter((c) => c.sampleCount > 0);

  if (deformation.relativeMax > 0.015) {
    chambers = refineWithBulgeLumps(chambers, samples, deformation, meanMajor);
  }

  chambers = chambers
    .sort((a, b) => a.axialPos - b.axialPos)
    .map((c, i) => ({ ...c, id: i, chainIndex: i }));

  const assignments = assignSamplesAxial(samples, chambers);

  return { chambers, assignments, mode: "catenoids" };
}

function segmentToChamber(seg, id, label, kind, samples, deformation, meanMajor) {
  const segSamples = collectSegmentSamples(samples, seg);
  const axialPos = (seg.a0 + seg.a1) * 0.5;
  const isBell = kind === "bell";

  const meanBulge =
    segSamples.reduce((a, s) => a + (s.bulge ?? 0), 0) / Math.max(1, segSamples.length);
  const meanRadius =
    segSamples.reduce((a, s) => a + crossSectionRadius(s), 0) / Math.max(1, segSamples.length);
  const interior = cavityCenterForSamples(segSamples);
  const axialSpan = seg.a1 - seg.a0;
  const volumeProxy = meanRadius * meanRadius * axialSpan * (meanMajor || 1);

  const baseResonance = isBell ? 0.55 : 0.28;
  const bulgeBoost = meanBulge / Math.max(1e-4, deformation.radius * 0.035);
  const resonance = Math.max(0.08, baseResonance + bulgeBoost * 0.35);

  return {
    id,
    kind,
    axialPos,
    axialA0: seg.a0,
    axialA1: seg.a1,
    position: [interior.x, interior.y, interior.z],
    surfacePosition: computeCentroid(segSamples),
    ringAngle: axialPos * Math.PI * 2 - Math.PI,
    thickness: meanRadius,
    lumpScore: meanBulge + (isBell ? meanRadius * 0.08 : meanRadius * 0.03),
    volume: volumeProxy,
    angularSpan: axialSpan * Math.PI * 2,
    sampleCount: segSamples.length,
    resonance,
    concavity: meanBulge / Math.max(1e-4, meanRadius),
    purity: Math.max(0.12, 1 - meanBulge / Math.max(1e-4, deformation.max * 0.75)),
    driftHz: meanBulge * (isBell ? 5 : 2.5),
    displacement: meanBulge,
    label,
    chainIndex: id,
  };
}

function collectSegmentSamples(samples, seg) {
  const last = seg.a1;
  return samples.filter((s) => {
    const t = s.axialT ?? 0;
    return t >= seg.a0 && (t < last || (last >= 1 && t <= last));
  });
}

function crossSectionRadius(s) {
  return Math.hypot(s.bx ?? s.x, s.by ?? s.y);
}

function cavityCenterForSamples(segSamples) {
  let wx = 0;
  let wy = 0;
  let wz = 0;
  let wSum = 0;
  for (const s of segSamples) {
    const w = 0.05 + (s.bulge ?? 0) * 4;
    wx += s.x * w;
    wy += s.y * w;
    wz += s.z * w;
    wSum += w;
  }
  if (wSum <= 0) return computeCentroid(segSamples);
  return { x: wx / wSum, y: wy / wSum, z: wz / wSum };
}

function computeCentroid(samples) {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const s of samples) {
    sx += s.x;
    sy += s.y;
    sz += s.z;
  }
  const n = samples.length || 1;
  return { x: sx / n, y: sy / n, z: sz / n };
}

function assignSamplesAxial(samples, chambers) {
  if (chambers.length === 0) return samples.map(() => 0);
  if (chambers.length === 1) return samples.map(() => 0);

  return samples.map((s) => {
    const t = s.axialT ?? 0;
    let best = 0;
    let bestDist = Infinity;
    for (const c of chambers) {
      const mid = c.axialPos;
      const dist = Math.abs(t - mid);
      const bulgeBias = (s.bulge ?? 0) * 0.15;
      const score = dist - bulgeBias;
      if (score < bestDist) {
        bestDist = score;
        best = c.id;
      }
    }
    return best;
  });
}

/** Split bell chambers when noise bulge shows distinct axial peaks inside the segment. */
function refineWithBulgeLumps(chambers, samples, deformation, meanMajor) {
  const refined = [];

  for (const chamber of chambers) {
    if (chamber.kind !== "bell") {
      refined.push(chamber);
      continue;
    }

    const segSamples = samples.filter(
      (s) => (s.axialT ?? 0) >= chamber.axialA0 && (s.axialT ?? 0) <= chamber.axialA1
    );
    if (segSamples.length < 12) {
      refined.push(chamber);
      continue;
    }

    const lumps = findAxialBulgePeaks(segSamples, chamber, deformation);
    if (lumps.length <= 1) {
      refined.push(chamber);
      continue;
    }

    for (let i = 0; i < lumps.length; i++) {
      const lump = lumps[i];
      const subSeg = { a0: lump.a0, a1: lump.a1, kind: "bell" };
      refined.push(
        segmentToChamber(
          subSeg,
          chamber.id,
          `${chamber.label} · lump ${i}`,
          "bell",
          samples,
          deformation,
          meanMajor
        )
      );
    }
  }

  return refined;
}

function findAxialBulgePeaks(segSamples, chamber, deformation) {
  const bins = Math.max(8, Math.floor(AXIAL_BINS * (chamber.axialA1 - chamber.axialA0)));
  const profile = new Array(bins).fill(0);
  const counts = new Array(bins).fill(0);

  for (const s of segSamples) {
    const t = ((s.axialT ?? 0) - chamber.axialA0) / Math.max(1e-6, chamber.axialA1 - chamber.axialA0);
    const bin = Math.min(bins - 1, Math.max(0, Math.floor(t * bins)));
    profile[bin] += s.bulge ?? 0;
    counts[bin]++;
  }

  for (let i = 0; i < bins; i++) {
    if (counts[i] > 0) profile[i] /= counts[i];
  }

  const smooth = smoothLinear(profile, 3);
  const max = Math.max(...smooth, 0);
  if (max < deformation.radius * 0.008) return [];

  const prominence = Math.max(max * 0.2, deformation.radius * 0.004);
  const peaks = [];

  for (let i = 1; i < bins - 1; i++) {
    if (smooth[i] > smooth[i - 1] && smooth[i] >= smooth[i + 1] && smooth[i] >= prominence) {
      peaks.push({ bin: i, value: smooth[i] });
    }
  }

  if (peaks.length < 2) return [];

  peaks.sort((a, b) => a.bin - b.bin);
  const regions = [];
  let regionStart = 0;

  for (let p = 1; p < peaks.length; p++) {
    let valley = Infinity;
    let valleyBin = peaks[p - 1].bin;
    for (let b = peaks[p - 1].bin; b <= peaks[p].bin; b++) {
      if (smooth[b] < valley) {
        valley = smooth[b];
        valleyBin = b;
      }
    }
    const a0 = chamber.axialA0 + (regionStart / bins) * (chamber.axialA1 - chamber.axialA0);
    const a1 = chamber.axialA0 + (valleyBin / bins) * (chamber.axialA1 - chamber.axialA0);
    if (a1 - a0 > 0.04) regions.push({ a0, a1 });
    regionStart = valleyBin;
  }

  const a0 = chamber.axialA0 + (regionStart / bins) * (chamber.axialA1 - chamber.axialA0);
  regions.push({ a0, a1: chamber.axialA1 });

  return regions.filter((r) => r.a1 - r.a0 > 0.04);
}

function smoothLinear(values, window) {
  const n = values.length;
  const half = Math.floor(window / 2);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let k = -half; k <= half; k++) {
      const idx = i + k;
      if (idx < 0 || idx >= n) continue;
      sum += values[idx];
      count++;
    }
    out[i] = count ? sum / count : 0;
  }
  return out;
}
