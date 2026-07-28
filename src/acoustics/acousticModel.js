import { morphParams } from "../morphogenesis/morphParams.js";

/**
 * Map shape analysis to acoustic parameters for external sound engines.
 * Pure torus → sine-like timbre; deformed → modulated with chamber network.
 */
export function buildAcousticModel(
  analysis,
  {
    noiseMix = 0,
    shape = morphParams.shape,
    pitchMultiplier = 1,
    chamberGates = null,
    bedsGate = 1,
    playMode = "drone",
    envAttack = 0.02,
    envDecay = 0.1,
    envSustain = 0.75,
    envRelease = 0.45,
  } = {}
) {
  const { timbre, chambers, network } = analysis;
  const isPureOscillator = chambers.length === 1 && timbre.harmonicStack === "perfect";

  const baseFundamentalHz = estimateFundamental(shape, analysis);
  const pitch = Math.max(0.25, Number(pitchMultiplier) || 1);
  const fundamentalHz = baseFundamentalHz * pitch;
  const partials = buildPartials(timbre, noiseMix, chambers.length, isPureOscillator);
  const chamberModes = chambers.map((c, i) => {
    const thicknessRatio = c.thickness / Math.max(1e-4, analysis.meanMajor ?? 1);
    const freq = isPureOscillator
      ? fundamentalHz
      : fundamentalHz * (0.85 + thicknessRatio * 0.4 + c.resonance * 0.25);
    const driftHz = isPureOscillator
      ? 0
      : timbre.modulation * (c.lumpScore ?? c.displacement ?? 0) * fundamentalHz * 0.15;

    return {
      id: c.id,
      label: c.label,
      chainIndex: c.chainIndex ?? i,
      ringAngle: c.ringAngle,
      frequency: freq,
      amplitude: isPureOscillator
        ? 1
        : Math.min(1, 0.15 + c.thickness * c.resonance * 2),
      decay: isPureOscillator ? 0.15 : 0.25 + c.thickness * 0.35,
      resonance: c.resonance,
      concavity: c.concavity,
      thickness: c.thickness,
      lumpScore: c.lumpScore ?? 0,
      volume: c.volume,
      sampleCount: c.sampleCount,
      purity: c.purity ?? timbre.purity,
      driftHz,
      displacement: c.lumpScore ?? c.displacement ?? 0,
      position: c.position,
    };
  });

  const routes = network.edges.map((e) => ({
    from: e.from,
    to: e.to,
    coupling: e.weight,
    delayMs: e.delayMs,
    throat: e.throat,
  }));

  return {
    timestamp: Date.now(),
    shape,
    noiseMix,
    pitchMultiplier: pitch,
    analysis,
    timbre: {
      purity: timbre.purity,
      modulation: timbre.modulation,
      resonanceIndex: timbre.resonanceIndex,
      harmonicStack: timbre.harmonicStack,
    },
    synthesis: {
      baseFundamentalHz,
      fundamentalHz,
      partials,
      noiseAmount: isPureOscillator ? 0 : noiseMix * timbre.modulation,
    },
    chambers: chamberModes,
    network: routes,
    superCollider: toSuperColliderPayload(
      fundamentalHz,
      partials,
      chamberModes,
      routes,
      noiseMix,
      chamberGates,
      bedsGate,
      { playMode, envAttack, envDecay, envSustain, envRelease }
    ),
  };
}

function estimateFundamental(shape, analysis) {
  const span = analysis.bounds
    ? Math.max(
        analysis.bounds.max[0] - analysis.bounds.min[0],
        analysis.bounds.max[1] - analysis.bounds.min[1],
        analysis.bounds.max[2] - analysis.bounds.min[2]
      )
    : 2;

  const bases = {
    torus: 65,
    torusknot: 55,
    chenGackstatter: 62,
    lopezros: 60,
    gielis: 58,
    baschetLeaf: 70,
    lsystem: 66,
    model: 58,
  };
  const base = bases[shape] ?? 60;
  return base / Math.max(0.5, span * 0.3);
}

function buildPartials(timbre, noiseMix, chamberCount, isPureOscillator) {
  const count = isPureOscillator ? 8 : chamberCount === 1 ? 8 : Math.min(12, 3 + chamberCount);
  const partials = [];

  for (let i = 1; i <= count; i++) {
    if (isPureOscillator) {
      partials.push({
        harmonic: i,
        amplitude: 1 / i,
        detune: 0,
        phase: 0,
      });
      continue;
    }

    const sineWeight = timbre.purity / i;
    const modWeight = (noiseMix * timbre.modulation) / Math.sqrt(i);
    partials.push({
      harmonic: i,
      amplitude: sineWeight + modWeight,
      detune: modWeight * 12,
      phase: (i * 0.17) % 1,
    });
  }

  return partials;
}

function toSuperColliderPayload(
  fundamental,
  partials,
  chambers,
  routes,
  noiseMix,
  chamberGates,
  bedsGate = 1,
  playback = {}
) {
  return {
    cmd: "resonant_torus_update",
    freq: fundamental,
    playMode: playback.playMode === "trigger" ? 1 : 0,
    envAttack: playback.envAttack ?? 0.02,
    envDecay: playback.envDecay ?? 0.1,
    envSustain: playback.envSustain ?? 0.75,
    envRelease: playback.envRelease ?? 0.45,
    partials: partials.map((p) => [p.harmonic, p.amplitude, p.detune]),
    bedsGate,
    chambers: chambers.map((c) => ({
      id: c.id,
      chainIndex: c.chainIndex,
      freq: c.frequency,
      amp: c.amplitude,
      decay: c.decay,
      thickness: c.thickness,
      drift: c.driftHz,
      ringAngle: c.ringAngle,
      gate: chamberGates?.[c.id] ?? 1,
    })),
    routes: routes.map((r) => ({
      from: r.from,
      to: r.to,
      coupling: r.coupling,
      delayMs: r.delayMs,
      throat: r.throat,
    })),
    noise: noiseMix,
  };
}
