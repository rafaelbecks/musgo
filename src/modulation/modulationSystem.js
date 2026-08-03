/**
 * LFO modulation system (adapted from GLOW).
 * Drives morphogenesis / texture / noise / rotation params over time.
 */

export class ModulationSystem {
  constructor() {
    this.modulators = [];
    this.startTime = performance.now() / 1000;
  }

  addModulator(id = null) {
    const modulator = {
      id:
        id ||
        `modulator-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      enabled: true,
      targetCategory: null,
      targetConfigKey: null,
      shape: "sine",
      rate: 0.1,
      depth: 0.5,
      offset: 0,
      cubicBezier: [0.5, 0, 0.5, 1],
      threshold: 0.5,
    };
    this.modulators.push(modulator);
    return modulator.id;
  }

  removeModulator(modulatorId) {
    const index = this.modulators.findIndex((m) => m.id === modulatorId);
    if (index === -1) return false;
    this.modulators.splice(index, 1);
    return true;
  }

  updateModulator(modulatorId, updates) {
    const modulator = this.modulators.find((m) => m.id === modulatorId);
    if (!modulator) return false;
    Object.assign(modulator, updates);
    return true;
  }

  getModulators() {
    return this.modulators;
  }

  getModulator(modulatorId) {
    return this.modulators.find((m) => m.id === modulatorId);
  }

  generateWaveform(shape, phase, cubicBezier = [0.5, 0, 0.5, 1]) {
    const normalizedPhase =
      ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    switch (shape) {
      case "sine":
        return Math.sin(normalizedPhase);
      case "square":
        return normalizedPhase < Math.PI ? 1 : -1;
      case "triangle":
        if (normalizedPhase < Math.PI) {
          return (normalizedPhase / Math.PI) * 2 - 1;
        }
        return 1 - ((normalizedPhase - Math.PI) / Math.PI) * 2;
      case "saw":
        return (normalizedPhase / (Math.PI * 2)) * 2 - 1;
      case "cubicBezier": {
        const t = normalizedPhase / (Math.PI * 2);
        const [, y1, , y2] = cubicBezier;
        return this.cubicBezierEval(t, y1, y2) * 2 - 1;
      }
      default:
        return Math.sin(normalizedPhase);
    }
  }

  cubicBezierEval(t, y1, y2) {
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    return mt3 * 0 + 3 * mt2 * t * y1 + 3 * mt * t2 * y2 + t3 * 1;
  }

  getCurrentTime() {
    return performance.now() / 1000 - this.startTime;
  }

  getWaveformShapes() {
    return ["sine", "square", "triangle", "saw", "cubicBezier"];
  }

  getWaveformShapeNames() {
    return {
      sine: "Sine",
      square: "Square",
      triangle: "Triangle",
      saw: "Sawtooth",
      cubicBezier: "Cubic Bezier",
    };
  }

  /**
   * Sample bipolar LFO output (−1…1) including depth + offset (clamped).
   */
  sampleModulator(modulator, time = this.getCurrentTime()) {
    if (!modulator?.enabled) return 0;
    const phase = time * (modulator.rate || 0.1) * Math.PI * 2;
    const waveform = this.generateWaveform(
      modulator.shape || "sine",
      phase,
      modulator.cubicBezier
    );
    const depth = modulator.depth ?? 0.5;
    const offset = modulator.offset || 0;
    return Math.max(-1, Math.min(1, waveform * depth + offset));
  }

  getModulatedValue(baseValue, modulator, configParam) {
    if (!modulator.enabled || !modulator.targetConfigKey || !configParam) {
      return baseValue;
    }

    const time = this.getCurrentTime();
    const phase = time * (modulator.rate || 0.1) * Math.PI * 2;
    const waveform = this.generateWaveform(
      modulator.shape || "sine",
      phase,
      modulator.cubicBezier
    );

    if (configParam.type === "checkbox") {
      const normalizedValue = (waveform + 1) / 2;
      const threshold =
        modulator.threshold !== undefined ? modulator.threshold : 0.5;
      return normalizedValue >= threshold;
    }

    const min = configParam.min;
    const max = configParam.max;
    const range = max - min;
    const modulationAmount = waveform * (modulator.depth ?? 0.5);
    const offset = modulator.offset || 0;
    let modulatedValue = baseValue + modulationAmount * range + offset * range;
    modulatedValue = Math.max(min, Math.min(max, modulatedValue));

    if (configParam.type === "number" && configParam.step >= 1) {
      return Math.round(modulatedValue);
    }
    if (configParam.integer) {
      return Math.round(modulatedValue);
    }
    return modulatedValue;
  }

  /**
   * Apply all active modulators onto `params` in place.
   * Returns a restore() that writes original values back.
   */
  applyToParams(params, resolveParam) {
    const relevant = this.modulators.filter(
      (m) => m.enabled && m.targetCategory && m.targetConfigKey
    );
    if (relevant.length === 0) return null;

    const byKey = new Map();
    for (const modulator of relevant) {
      const key = `${modulator.targetCategory}:${modulator.targetConfigKey}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(modulator);
    }

    const originalValues = new Map();

    for (const [, mods] of byKey) {
      const first = mods[0];
      const configParam = resolveParam(first.targetCategory, first.targetConfigKey);
      if (!configParam) continue;
      const key = first.targetConfigKey;
      if (!(key in params)) continue;

      if (!originalValues.has(key)) {
        originalValues.set(key, params[key]);
      }

      let value = originalValues.get(key);
      for (const modulator of mods) {
        value = this.getModulatedValue(value, modulator, configParam);
      }

      if (
        configParam.type === "number" &&
        (configParam.integer || (configParam.step != null && configParam.step >= 1))
      ) {
        value = Math.round(value);
      }
      params[key] = value;
    }

    return () => {
      for (const [key, value] of originalValues) {
        params[key] = value;
      }
    };
  }

  reset() {
    this.modulators = [];
  }

  serialize() {
    return {
      version: 1,
      modulators: this.modulators.map((m) => ({
        id: m.id,
        enabled: Boolean(m.enabled),
        targetCategory: m.targetCategory ?? null,
        targetConfigKey: m.targetConfigKey ?? null,
        shape: m.shape || "sine",
        rate: Number.isFinite(m.rate) ? m.rate : 0.1,
        depth: Number.isFinite(m.depth) ? m.depth : 0.5,
        offset: Number.isFinite(m.offset) ? m.offset : 0,
        cubicBezier: Array.isArray(m.cubicBezier) && m.cubicBezier.length === 4
          ? [...m.cubicBezier]
          : [0.5, 0, 0.5, 1],
        threshold: Number.isFinite(m.threshold) ? m.threshold : 0.5,
      })),
    };
  }

  /**
   * Replace modulators from a saved .organism modulation block.
   * Pass null/undefined to clear (organism with no LFOs).
   */
  loadSerialized(data) {
    this.modulators = [];
    if (!data || typeof data !== "object") return;

    const list = Array.isArray(data.modulators) ? data.modulators : [];
    const shapes = new Set(this.getWaveformShapes());

    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const rate = Number(raw.rate);
      const depth = Number(raw.depth);
      const offset = Number(raw.offset);
      const threshold = Number(raw.threshold);
      const shape = shapes.has(raw.shape) ? raw.shape : "sine";
      const cubicBezier =
        Array.isArray(raw.cubicBezier) && raw.cubicBezier.length === 4
          ? raw.cubicBezier.map((v) => Number(v))
          : [0.5, 0, 0.5, 1];

      this.modulators.push({
        id:
          typeof raw.id === "string" && raw.id
            ? raw.id
            : `modulator-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        enabled: raw.enabled !== false,
        targetCategory: raw.targetCategory || null,
        targetConfigKey: raw.targetConfigKey || null,
        shape,
        rate: Number.isFinite(rate) ? Math.max(0.001, Math.min(0.6, rate)) : 0.1,
        depth: Number.isFinite(depth) ? Math.max(0, Math.min(1, depth)) : 0.5,
        offset: Number.isFinite(offset) ? Math.max(-1, Math.min(1, offset)) : 0,
        cubicBezier,
        threshold: Number.isFinite(threshold)
          ? Math.max(0, Math.min(1, threshold))
          : 0.5,
      });
    }
  }
}

export const modulationSystem = new ModulationSystem();
