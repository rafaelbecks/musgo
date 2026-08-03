/**
 * Modulation tab UI — addable LFOs targeting morphogenesis params (GLOW-inspired).
 */
import * as EssentialsPlugin from "../lib/tweakpane-plugin-essentials.min.js";
import * as WaveformPlugin from "../lib/tweakpane-plugin-waveform.min.js";
import { modulationSystem } from "./modulationSystem.js";
import {
  getCategoryOptions,
  getParamOptions,
  findModParam,
} from "./modulationTargets.js";
import { syncOrganismDirty } from "../morphogenesis/organismState.js";

export function setupModulationUI(parentFolder, { pane } = {}) {
  if (pane) {
    pane.registerPlugin(EssentialsPlugin);
    pane.registerPlugin(WaveformPlugin);
  }

  const folder = parentFolder.addFolder({ title: "LFOs", expanded: true });
  const modulatorPanes = new Map();
  let monitorRaf = null;
  const monitorSampleCount = 64;
  let listFolder = null;

  folder.addButton({ title: "Add LFO" }).on("click", () => {
    modulationSystem.addModulator();
    renderModulators();
    syncOrganismDirty();
  });

  function stopMonitor() {
    if (monitorRaf != null) {
      cancelAnimationFrame(monitorRaf);
      monitorRaf = null;
    }
  }

  function createMonitorSamples(modulator, sampleCount = monitorSampleCount) {
    const values = new Array(sampleCount).fill(0);
    if (!modulator?.enabled) return values;

    const now = modulationSystem.getCurrentTime();
    const windowSeconds = 2;
    const rate = Math.max(0.001, modulator.rate || 0.1);
    const depth = modulator.depth || 0;
    const offset = modulator.offset || 0;
    const sampleStep = windowSeconds / Math.max(1, sampleCount - 1);

    for (let i = 0; i < sampleCount; i++) {
      const sampleTime = now - (windowSeconds - i * sampleStep);
      const phase = sampleTime * rate * Math.PI * 2;
      const waveform = modulationSystem.generateWaveform(
        modulator.shape || "sine",
        phase,
        modulator.cubicBezier
      );
      values[i] = Math.max(-1, Math.min(1, waveform * depth + offset));
    }
    return values;
  }

  function startMonitor() {
    stopMonitor();
    const tick = () => {
      for (const [id, paneData] of modulatorPanes) {
        const modulator = modulationSystem.getModulator(id);
        if (!modulator || !paneData.waveformMonitorData) continue;
        paneData.waveformMonitorData.values = createMonitorSamples(modulator);
      }
      monitorRaf = requestAnimationFrame(tick);
    };
    monitorRaf = requestAnimationFrame(tick);
  }

  function renderModulators() {
    stopMonitor();
    modulatorPanes.clear();

    if (listFolder) {
      listFolder.dispose();
      listFolder = null;
    }

    const modulators = modulationSystem.getModulators();
    listFolder = folder.addFolder({
      title: modulators.length ? `Modulators (${modulators.length})` : "Modulators",
      expanded: true,
    });

    if (modulators.length === 0) {
      return;
    }

    modulators.forEach((modulator, index) => {
      createModulatorFolder(modulator, index + 1);
    });
    startMonitor();
  }

  function createModulatorFolder(modulator, index) {
    const waveformShapes = modulationSystem.getWaveformShapes();
    const waveformNames = modulationSystem.getWaveformShapeNames();

    const data = {
      enabled: modulator.enabled,
      shape: modulator.shape || "sine",
      targetCategory: modulator.targetCategory || "",
      targetConfigKey: modulator.targetConfigKey || "",
      rate: modulator.rate ?? 0.1,
      depth: modulator.depth ?? 0.5,
      offset: modulator.offset || 0,
      cubicBezier: modulator.cubicBezier || [0.5, 0, 0.5, 1],
      threshold: modulator.threshold ?? 0.5,
    };

    const modFolder = listFolder.addFolder({
      title: `LFO ${index}`,
      expanded: true,
    });

    modFolder
      .addBinding(data, "enabled", { label: "enabled" })
      .on("change", (ev) => {
        modulationSystem.updateModulator(modulator.id, { enabled: ev.value });
        syncOrganismDirty();
      });

    const waveformOptions = {};
    for (const shape of waveformShapes) {
      waveformOptions[waveformNames[shape]] = shape;
    }
    modFolder
      .addBinding(data, "shape", { options: waveformOptions, label: "waveform" })
      .on("change", (ev) => {
        modulationSystem.updateModulator(modulator.id, { shape: ev.value });
        renderModulators();
        syncOrganismDirty();
      });

    const categoryOptions = { "Select category": "", ...getCategoryOptions() };
    modFolder
      .addBinding(data, "targetCategory", {
        options: categoryOptions,
        label: "category",
      })
      .on("change", (ev) => {
        modulationSystem.updateModulator(modulator.id, {
          targetCategory: ev.value || null,
          targetConfigKey: null,
        });
        renderModulators();
        syncOrganismDirty();
      });

    if (data.targetCategory) {
      const paramOptions = getParamOptions(data.targetCategory);
      modFolder
        .addBinding(data, "targetConfigKey", {
          options: paramOptions,
          label: "parameter",
        })
        .on("change", (ev) => {
          modulationSystem.updateModulator(modulator.id, {
            targetConfigKey: ev.value || null,
          });
          renderModulators();
          syncOrganismDirty();
        });
    }

    modFolder
      .addBinding(data, "rate", {
        label: "rate",
        min: 0.001,
        max: 0.6,
        step: 0.001,
      })
      .on("change", (ev) => {
        modulationSystem.updateModulator(modulator.id, { rate: ev.value });
        syncOrganismDirty();
      });

    modFolder
      .addBinding(data, "depth", {
        label: "depth",
        min: 0,
        max: 1,
        step: 0.01,
      })
      .on("change", (ev) => {
        modulationSystem.updateModulator(modulator.id, { depth: ev.value });
        syncOrganismDirty();
      });

    modFolder
      .addBinding(data, "offset", {
        label: "offset",
        min: -1,
        max: 1,
        step: 0.01,
      })
      .on("change", (ev) => {
        modulationSystem.updateModulator(modulator.id, { offset: ev.value });
        syncOrganismDirty();
      });

    const waveformMonitorData = {
      values: createMonitorSamples(modulator, monitorSampleCount),
    };
    modFolder.addBinding(waveformMonitorData, "values", {
      view: "waveform",
      label: "monitor",
      min: -1,
      max: 1,
      interval: 50,
      style: "bezier",
    });

    let cubicBezierBinding = null;
    if (data.shape === "cubicBezier") {
      cubicBezierBinding = modFolder
        .addBlade({
          view: "cubicbezier",
          value: data.cubicBezier,
          expanded: true,
          label: "cubic bezier",
          picker: "inline",
        })
        .on("change", (ev) => {
          const bezier =
            Array.isArray(ev.value) && ev.value.length === 4
              ? ev.value
              : [0.5, 0, 0.5, 1];
          data.cubicBezier = bezier;
          modulationSystem.updateModulator(modulator.id, { cubicBezier: bezier });
          syncOrganismDirty();
        });
    }

    let thresholdBinding = null;
    if (data.targetCategory && data.targetConfigKey) {
      const param = findModParam(data.targetCategory, data.targetConfigKey);
      if (param?.type === "checkbox") {
        thresholdBinding = modFolder
          .addBinding(data, "threshold", {
            label: "threshold",
            min: 0,
            max: 1,
            step: 0.01,
          })
          .on("change", (ev) => {
            modulationSystem.updateModulator(modulator.id, {
              threshold: ev.value,
            });
            syncOrganismDirty();
          });
      }
    }

    modFolder
      .addButton({ title: "Remove LFO" })
      .on("click", () => {
        modulationSystem.removeModulator(modulator.id);
        renderModulators();
        syncOrganismDirty();
      });

    modulatorPanes.set(modulator.id, {
      folder: modFolder,
      data,
      waveformMonitorData,
      cubicBezierBinding,
      thresholdBinding,
    });
  }

  renderModulators();

  return {
    refresh: () => renderModulators(),
    dispose: () => {
      stopMonitor();
      modulatorPanes.clear();
    },
  };
}
