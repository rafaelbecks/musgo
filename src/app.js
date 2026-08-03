import { params } from "./config.js";
import { createSceneSystem } from "./scene.js";
import { createInputSystem } from "./input.js";
import { createMorphSystem } from "./morphogenesis/morphSystem.js";
import { createAcousticPanel } from "./acoustics/acousticPanel.js";
import { createChamberPicker } from "./acoustics/chamberPicker.js";
import { createChamberGraph3d } from "./acoustics/chamberGraph3d.js";
import { createExternalBridge } from "./bridge/externalBridge.js";
import { toBridgePayload } from "./bridge/bridgePayload.js";
import { copyTextToClipboard } from "./bridge/copyJson.js";
import { createLoading } from "./ui/loading.js";
import { createAnalysisLoading } from "./ui/analysisLoading.js";
import { createToolsPanel } from "./ui/toolsPanel.js";
import { initPanelResize } from "./ui/panelResize.js";
import { createCameraFocus } from "./scene/cameraFocus.js";
import { morphParams } from "./morphogenesis/morphParams.js";
import { midiNoteToPitchMultiplier } from "./midi/notePitch.js";
import { updateMidiSmoothing } from "./midi/midiCamera.js";
import { createUnderwaterSystem } from "./underwater/underwaterSystem.js";
import { modulationSystem } from "./modulation/modulationSystem.js";
import { resolveModParam } from "./modulation/modulationTargets.js";

export async function bootApp({ pendingOrganismFile = null } = {}) {
  const loading = createLoading();
  const analysisLoading = createAnalysisLoading();
  const analysisLoadingEl = document.getElementById("analysis-loading");
  const mount = document.getElementById("viewer-mount");

  const sceneSystem = createSceneSystem({ mount, loading });
  const input = createInputSystem(sceneSystem.camera, sceneSystem.controls);

  const morphSystem = createMorphSystem({
    scene: sceneSystem.scene,
    params,
  });

  let analysisTimer = null;
  let analysisJob = 0;
  let analysisQueued = false;

  const cameraFocus = createCameraFocus({
    camera: sceneSystem.camera,
    controls: sceneSystem.controls,
  });

  let toolsPanel = null;
  let chamberPicker = null;
  let chamberGraph3d = null;

  function getActiveMesh() {
    return morphSystem.getAnalysisMesh();
  }

  function syncChamberGraph(model) {
    chamberGraph3d?.update(model ?? acousticPanel.getModel(), {
      enabled: params.showChamberGraph,
      selectedChamberId: acousticPanel.getSelectedChamberId(),
    });
  }

  function focusOnChamber(chamberId) {
    const analysis = acousticPanel.getAnalysis();
    const chamber = analysis?.chambers?.find((c) => c.id === chamberId);
    if (!chamber?.position) return;

    const mesh = getActiveMesh();
    let distance = params.chamberFocusDistance * 2;
    if (mesh?.geometry?.boundingSphere) {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      distance = Math.max(
        1,
        mesh.geometry.boundingSphere.radius * params.chamberFocusDistance
      );
    }

    cameraFocus.focusOnPoint(chamber.position, { distance });
  }

  const acousticPanel = createAcousticPanel({
    networkEl: document.getElementById("acoustics-network"),
    detailEl: document.getElementById("acoustics-chamber-detail"),
    summaryEl: document.getElementById("acoustics-summary"),
    statusEl: document.getElementById("acoustics-status"),
    onChamberSelect: (id, { skipPicker = false, skipFocus = false } = {}) => {
      if (!skipPicker) {
        chamberPicker?.highlightChamber(id, acousticPanel.getAnalysis());
      }
      syncChamberGraph();
      if (!skipFocus) focusOnChamber(id);
    },
    onChamberMixChange: (model) => {
      syncChamberGraph(model);
      sendModelIfConnected(model);
    },
  });

  chamberGraph3d = createChamberGraph3d({ scene: sceneSystem.scene });

  chamberPicker = createChamberPicker({
    camera: sceneSystem.camera,
    domElement: mount,
    scene: sceneSystem.scene,
    getMesh: getActiveMesh,
    getAnalysis: () => acousticPanel.getAnalysis(),
    onSelect: (id) => acousticPanel.selectChamber(id, { skipPicker: true }),
    isInteractive: () => params.showChamberGraph,
  });

  const underwaterSystem = createUnderwaterSystem({
    sceneSystem,
    morphSystem,
  });

  const panelResize = initPanelResize({
    onResize: () => {
      sceneSystem.resize();
      acousticPanel.onResize();
      underwaterSystem.onResize();
    },
  });

  window.addEventListener("keydown", (ev) => {
    const mod = ev.metaKey || ev.ctrlKey;
    if (!mod || (ev.key !== "k" && ev.key !== "K")) return;
    // Don't steal browser search when typing in fields
    const tag = ev.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || ev.target?.isContentEditable) {
      return;
    }
    ev.preventDefault();
    panelResize.toggleAcousticsPanel();
  });

  const externalBridge = createExternalBridge();

  function playbackOptions() {
    return {
      playMode: params.playMode,
      envAttack: params.envAttack,
      envDecay: params.envDecay,
      envSustain: params.envSustain,
      envRelease: params.envRelease,
    };
  }

  function sendModelIfConnected(model) {
    if (toolsPanel?.bridgeParams?.autoSend && externalBridge.isConnected() && model) {
      externalBridge.sendAcousticModel(model);
    }
  }

  function sendTriggerIfConnected(action, note, velocity) {
    if (!externalBridge.isConnected()) return;
    if (params.playMode !== "trigger") return;
    externalBridge.sendNoteTrigger({ action, note, velocity });
  }

  externalBridge.on((event) => {
    if (event !== "connected") return;
    if (!toolsPanel?.bridgeParams?.autoSend) return;
    const model = acousticPanel.getModel();
    if (model && externalBridge.isConnected()) {
      externalBridge.sendAcousticModel(model);
    }
  });

  function runAnalysisSync() {
    const mesh = getActiveMesh();
    if (!mesh) return null;

    const noiseMix = morphParams.noiseEnabled
      ? (morphSystem.getNoiseMix?.() ?? 1)
      : 0;
    const model = acousticPanel.analyze(mesh, {
      noiseMix,
      noiseEnabled: morphParams.noiseEnabled,
      shape: morphParams.shape,
      pitchMultiplier: params.pitchMultiplier,
      ...playbackOptions(),
    });

    chamberPicker.updateFromAnalysis(acousticPanel.getAnalysis());
    const selected = acousticPanel.getSelectedChamberId();
    if (selected != null) {
      chamberPicker.highlightChamber(selected, acousticPanel.getAnalysis());
    }
    syncChamberGraph(model);

    if (toolsPanel?.bridgeParams?.autoSend && externalBridge.isConnected()) {
      sendModelIfConnected(model);
    }

    return model;
  }

  async function runAnalysis() {
    analysisQueued = true;
    const job = ++analysisJob;

    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (job !== analysisJob) return null;

    analysisQueued = false;
    analysisLoading.show();
    analysisLoadingEl?.setAttribute("aria-busy", "true");

    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (job !== analysisJob) {
      analysisLoading.hide();
      analysisLoadingEl?.setAttribute("aria-busy", "false");
      return null;
    }

    try {
      return runAnalysisSync();
    } finally {
      analysisLoading.hide();
      analysisLoadingEl?.setAttribute("aria-busy", "false");
      if (analysisQueued) runAnalysis();
    }
  }

  function copyModelForSuperCollider() {
    console.log("[SC copy] --- Copy model JSON ---");

    let model = acousticPanel.getModel();
    if (!model) {
      console.log("[SC copy] no cached model, running analysis now...");
      model = runAnalysisSync();
    }

    if (!model) {
      console.warn("[SC copy] ABORT: no shape to analyze (is the torus loaded?)");
      return;
    }

    const payload = toBridgePayload(model);
    if (!payload?.superCollider) {
      console.warn("[SC copy] ABORT: payload missing superCollider block", payload);
      return;
    }

    const json = JSON.stringify(payload, null, 2);
    const chambers = payload.superCollider.chambers?.length ?? 0;
    const freq = payload.superCollider.freq;

    console.log(
      `[SC copy] model shape=${payload.shape} chambers=${chambers} f0=${freq}Hz bytes=${json.length}`
    );

    const copied = copyTextToClipboard(json);
    if (copied) {
      console.log("[SC copy] OK — JSON is on the clipboard. Paste in SC GUI -> Apply JSON.");
    } else {
      console.error("[SC copy] clipboard failed — copy manually from below:");
      console.log(json);
    }
  }

  function scheduleAnalysis() {
    if (!params.autoAnalyze) return;
    if (analysisTimer != null) clearTimeout(analysisTimer);
    analysisTimer = setTimeout(() => {
      analysisTimer = null;
      runAnalysis();
    }, 150);
  }

  function applyPitchMultiplier(pitchMultiplier = params.pitchMultiplier) {
    const model = acousticPanel.rebuildModel({
      pitchMultiplier,
      ...playbackOptions(),
    });
    syncChamberGraph(model);
    sendModelIfConnected(model);
    return model;
  }

  function applyPlaybackSettings() {
    return applyPitchMultiplier(params.pitchMultiplier);
  }

  function handleMidiNoteOn({ note, velocity }) {
    if (!toolsPanel?.midiParams?.enabled) return;

    const multiplier = midiNoteToPitchMultiplier(note);
    params.pitchMultiplier = multiplier;
    toolsPanel.refreshPitch?.();

    const model = applyPitchMultiplier(multiplier);
    sendTriggerIfConnected("noteOn", note, velocity);
    return model;
  }

  function handleMidiNoteOff({ note, velocity }) {
    if (!toolsPanel?.midiParams?.enabled) return;
    sendTriggerIfConnected("noteOff", note, velocity);
  }

  toolsPanel = createToolsPanel({
    container: document.getElementById("tools-scroll"),
    morphSystem,
    sceneSystem,
    externalBridge,
    onAnalyze: () => runAnalysis(),
    onPitchChange: () => applyPitchMultiplier(),
    onPlaybackChange: () => applyPlaybackSettings(),
    onMidiNoteOn: handleMidiNoteOn,
    onMidiNoteOff: handleMidiNoteOff,
    onCopyForSuperCollider: () => copyModelForSuperCollider(),
    onEnvironmentChange: async () => {
      await toolsPanel.applyEnvironment();
    },
    onRefresh: async () => {
      await morphSystem.sync();
      scheduleAnalysis();
      underwaterSystem?.refreshFromMorph();
    },
    onChamberGraphChange: () => {
      syncChamberGraph();
      chamberPicker?.setEnabled(params.showChamberGraph);
    },
    underwaterSystem,
  });

  await toolsPanel.ready;
  await toolsPanel.applyEnvironment();

  if (pendingOrganismFile) {
    try {
      await toolsPanel.loadOrganismFile(pendingOrganismFile);
    } catch (err) {
      console.error("[organism] splash load failed", err);
      window.alert(err?.message || "Failed to load organism file.");
    }
  }

  await morphSystem.sync();
  if (params.autoAnalyze) {
    await runAnalysis();
  }

  const clock = { elapsed: 0 };
  let lastShape = morphParams.shape;
  let wasModulating = false;

  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(0.05, clock.elapsed ? (performance.now() - clock.elapsed) / 1000 : 0.016);
    clock.elapsed = performance.now();

    if (morphParams.shape !== lastShape) {
      lastShape = morphParams.shape;
      toolsPanel.refreshModulation?.();
    }

    const restoreModulation = modulationSystem.applyToParams(
      morphParams,
      resolveModParam
    );
    const modulating = Boolean(restoreModulation);

    input.applyWalkMovement(delta);
    cameraFocus.update();
    // OrbitControls first, then MIDI zoom override (so damping doesn't fight us)
    sceneSystem.controls.update();
    const { rotated } = updateMidiSmoothing(delta, {
      camera: sceneSystem.camera,
      controls: sceneSystem.controls,
    });
    if (rotated || modulating || wasModulating) {
      morphSystem.applyTransform();
    }
    if (modulating || wasModulating) {
      morphSystem.applyLiveState();
    }
    morphSystem.update(delta);
    underwaterSystem.update(delta);

    sceneSystem.renderer.render(sceneSystem.scene, sceneSystem.camera);

    restoreModulation?.();
    wasModulating = modulating;
  }

  animate();
}
