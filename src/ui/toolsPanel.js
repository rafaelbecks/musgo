import { Pane } from "tweakpane";
import { params, getEnvOptions, getEnvPath, getEnvFormat, pickRandomHdrEnvironment } from "../config.js";
import { morphParams } from "../morphogenesis/morphParams.js";
import { setupMorphUI } from "../morphogenesis/morphUI.js";
import { setupModulationUI } from "../modulation/modulationUI.js";
import { createWebMidiController } from "../midi/webMidi.js";
import { midiNoteName } from "../midi/notePitch.js";
import { MidiCCMapper, loadMidiMapping } from "../midi/midiCCMapper.js";
import { MIDI_CAMERA_ZOOM, MIDI_SMOOTHING, getMidiXyzMode, setMidiXyzMode } from "../midi/midiCamera.js";
import { createMidiLegend } from "../midi/midiLegend.js";
import {
  MIDI_SECTION_LABELS,
  getMaxShapeParamCount,
} from "../midi/morphMidiParams.js";
import { setOrganismMidiHooks, syncOrganismDirty } from "../morphogenesis/organismState.js";

const MIDI_MAPPING_PRESETS = {
  "Arturia KeyLab Essential 49 mk3":
    "./midi-mappings/arturia-keylab-essential-49-mk3.json",
  "Example (generic)": "./midi-mappings/example-mapping.json",
};

export function createToolsPanel({
  container,
  morphSystem,
  sceneSystem,
  externalBridge,
  onAnalyze,
  onPitchChange,
  onPlaybackChange,
  onMidiNoteOn,
  onMidiNoteOff,
  onCopyForSuperCollider,
  onRefresh,
  onEnvironmentChange,
  onChamberGraphChange,
  underwaterSystem,
}) {
  const pane = new Pane({ title: "Resonant Organisms", container });

  const tab = pane.addTab({
    pages: [
      { title: "Morphogenesis" },
      { title: "Modulation" },
      { title: "Settings" },
    ],
  });

  const morphTab = tab.pages[0];
  const soundTab = tab.pages[1];
  const settingsTab = tab.pages[2];
  const viewTab = settingsTab;

  const modulationUi = setupModulationUI(soundTab, { pane });


  const viewFolder = viewTab.addFolder({ title: "Viewer", expanded: true });

  viewFolder.addBinding(params, "showGrid", { label: "grid" }).on("change", () => {
    sceneSystem.rebuildGrid();
  });
  viewFolder.addBinding(params, "showAxes", { label: "axes" }).on("change", () => {
    sceneSystem.rebuildAxes();
  });
  viewFolder.addBinding(params, "gridSize", {
    label: "grid size",
    min: 5,
    max: 100,
    step: 1,
  }).on("change", () => sceneSystem.rebuildGrid());

  viewFolder.addBinding(params, "chamberFocusDistance", {
    label: "chamber zoom",
    min: 0.4,
    max: 3,
    step: 0.05,
  });

  viewFolder.addBinding(params, "autoRotate", { label: "auto rotate" }).on("change", (ev) => {
    sceneSystem.controls.autoRotate = ev.value;
  });
  viewFolder.addBinding(params, "rotateSpeed", {
    label: "rotate speed",
    min: 0.1,
    max: 3,
    step: 0.1,
  }).on("change", (ev) => {
    sceneSystem.controls.autoRotateSpeed = ev.value;
  });

  viewFolder.addBinding(params, "fpMove", { label: "WASD walk" });
  viewFolder.addBinding(params, "moveSpeed", {
    label: "WASD sensitivity",
    min: 0.05,
    max: 40,
    step: 0.05,
  });

  const wireframeBinding = viewFolder
    .addBinding(params, "wireframe", { label: "wireframe" })
    .on("change", (ev) => {
      if (ev.value && morphParams.glassEnabled) {
        if (morphUi) morphUi.setGlassEnabled(false);
        else morphParams.glassEnabled = false;
      }
      onRefresh?.();
    });

  viewFolder.addBinding(params, "roughness", {
    label: "roughness",
    min: 0,
    max: 1,
    step: 0.01,
  }).on("change", () => onRefresh?.());
  viewFolder.addBinding(params, "metalness", {
    label: "metalness",
    min: 0,
    max: 1,
    step: 0.01,
  }).on("change", () => onRefresh?.());
  viewFolder.addBinding(params, "exposure", {
    label: "exposure",
    min: 0.2,
    max: 2,
    step: 0.05,
  }).on("change", (ev) => {
    sceneSystem.renderer.toneMappingExposure = ev.value;
  });

  let morphUi = null;
  let envBinding = null;
  const morphUiReady = setupMorphUI(morphTab, morphSystem, () => {
    onRefresh?.();
  }, {
    pane,
    onGlassEnable: () => {
      if (params.wireframe) {
        params.wireframe = false;
        wireframeBinding.refresh();
      }
      // Only pick a random HDR if nothing is selected yet
      if (!params.environment || params.environment === "none") {
        params.environment = pickRandomHdrEnvironment();
        envBinding?.refresh();
        onEnvironmentChange?.();
      }
    },
    refreshPane: () => pane.refresh(),
    onOrganismLoaded: async () => {
      wireframeBinding.refresh();
      envBinding?.refresh();
      sceneSystem.renderer.toneMappingExposure = params.exposure;
      sceneSystem.light.intensity = params.lightIntensity;
      sceneSystem.ambient.intensity = params.ambient;
      sceneSystem.scene.backgroundBlurriness = params.bgBlur;
      await onEnvironmentChange?.();
      underwaterSystem?.applyParams();
      modulationUi.refresh();
      pane.refresh();
    },
  }).then((api) => {
    morphUi = api;
    return api;
  });
  const envFolder = viewTab.addFolder({ title: "Environment", expanded: true });
  envBinding = envFolder.addBinding(params, "environment", {
    label: "HDR",
    options: getEnvOptions(),
  });
  envBinding.on("change", () => {
    if (getEnvFormat(params.environment) === "exr") {
      params.bgBlur = 0.15;
      bgBlurBinding.refresh();
    }
    onEnvironmentChange?.();
  });
  const bgBlurBinding = envFolder
    .addBinding(params, "bgBlur", {
      label: "bg blur",
      min: 0,
      max: 1,
      step: 0.01,
    })
    .on("change", (ev) => {
      sceneSystem.scene.backgroundBlurriness = ev.value;
    });
  envFolder.addBinding(params, "lightIntensity", {
    label: "direct light",
    min: 0,
    max: 5,
    step: 0.1,
  }).on("change", (ev) => {
    sceneSystem.light.intensity = ev.value;
  });
  envFolder.addBinding(params, "ambient", {
    label: "ambient",
    min: 0,
    max: 3,
    step: 0.05,
  }).on("change", (ev) => {
    sceneSystem.ambient.intensity = ev.value;
  });

  const uwFolder = viewTab.addFolder({ title: "Underwater", expanded: false });
  const onUwChange = () => {
    underwaterSystem?.applyParams();
    syncOrganismDirty();
  };
  uwFolder
    .addBinding(params, "uwEnabled", { label: "enable" })
    .on("change", (ev) => {
      underwaterSystem?.setEnabled(ev.value);
      syncOrganismDirty();
    });
  uwFolder
    .addBinding(params, "uwShape", {
      label: "volume",
      options: underwaterSystem?.SHAPE_OPTIONS ?? { Sphere: "sphere", Cube: "box" },
    })
    .on("change", onUwChange);
  uwFolder
    .addBinding(params, "uwPadding", {
      label: "padding",
      min: 1.05,
      max: 10,
      step: 0.05,
    })
    .on("change", onUwChange);
  uwFolder
    .addBinding(params, "uwSide", {
      label: "faces",
      options: { Outside: "outside", Inside: "inside", Double: "double" },
    })
    .on("change", onUwChange);
  uwFolder
    .addBinding(params, "uwWaterColor", { label: "water color" })
    .on("change", onUwChange);
  uwFolder
    .addBinding(params, "uwSunColor", { label: "sun color" })
    .on("change", onUwChange);
  uwFolder
    .addBinding(params, "uwDistortion", {
      label: "distortion",
      min: 0.5,
      max: 8,
      step: 0.1,
    })
    .on("change", onUwChange);
  uwFolder
    .addBinding(params, "uwWaveSize", {
      label: "wave size",
      min: 0.2,
      max: 4,
      step: 0.05,
    })
    .on("change", onUwChange);
  uwFolder
    .addBinding(params, "uwWaveSpeed", {
      label: "wave speed",
      min: 0,
      max: 2,
      step: 0.05,
    })
    .on("change", onUwChange);
  uwFolder
    .addBinding(params, "uwAlpha", {
      label: "opacity",
      min: 0.15,
      max: 1,
      step: 0.01,
    })
    .on("change", onUwChange);
  uwFolder
    .addBinding(params, "uwCaustics", { label: "caustics" })
    .on("change", onUwChange);
  uwFolder
    .addBinding(params, "uwCausticStrength", {
      label: "caustic strength",
      min: 0,
      max: 2,
      step: 0.05,
    })
    .on("change", onUwChange);
  uwFolder
    .addBinding(params, "uwCausticScale", {
      label: "caustic scale",
      min: 0.05,
      max: 1.5,
      step: 0.01,
    })
    .on("change", onUwChange);
  uwFolder
    .addBinding(params, "uwCausticSpeed", {
      label: "caustic speed",
      min: 0,
      max: 3,
      step: 0.05,
    })
    .on("change", onUwChange);
  uwFolder
    .addBinding(params, "uwLightFollow", { label: "light follows cam" })
    .on("change", onUwChange);
  uwFolder
    .addButton({ title: "Set light from camera (L)" })
    .on("click", () => underwaterSystem?.setLightFromCamera());

  const acousticFolder = soundTab.addFolder({ title: "Acoustics", expanded: false });
  acousticFolder.addBinding(params, "autoAnalyze", { label: "auto analyze" });
  const pitchBinding = acousticFolder.addBinding(params, "pitchMultiplier", {
    label: "pitch mult",
    min: 0.25,
    max: 8,
    step: 0.25,
  });
  pitchBinding.on("change", () => onPitchChange?.());
  acousticFolder
    .addBinding(params, "showChamberGraph", { label: "3d chamber graph" })
    .on("change", () => onChamberGraphChange?.());
  acousticFolder.addButton({ title: "Analyze shape" }).on("click", () => onAnalyze?.());

  const playbackFolder = soundTab.addFolder({ title: "Playback", expanded: false });
  playbackFolder
    .addBinding(params, "playMode", {
      label: "mode",
      options: { drone: "drone", trigger: "trigger (ADSR)" },
    })
    .on("change", () => {
      syncEnvelopeFolder();
      onPlaybackChange?.();
    });

  const envControlsFolder = playbackFolder.addFolder({ title: "Envelope (trigger)", expanded: false });
  envControlsFolder.addBinding(params, "envAttack", {
    label: "attack",
    min: 0.001,
    max: 2,
    step: 0.01,
  }).on("change", () => onPlaybackChange?.());
  envControlsFolder.addBinding(params, "envDecay", {
    label: "decay",
    min: 0.001,
    max: 2,
    step: 0.01,
  }).on("change", () => onPlaybackChange?.());
  envControlsFolder.addBinding(params, "envSustain", {
    label: "sustain",
    min: 0,
    max: 1,
    step: 0.01,
  }).on("change", () => onPlaybackChange?.());
  envControlsFolder.addBinding(params, "envRelease", {
    label: "release",
    min: 0.001,
    max: 4,
    step: 0.01,
  }).on("change", () => onPlaybackChange?.());

  function syncEnvelopeFolder() {
    const trigger = params.playMode === "trigger";
    envControlsFolder.hidden = !trigger;
  }
  syncEnvelopeFolder();

  const scFolder = soundTab.addFolder({ title: "SuperCollider", expanded: false });
  scFolder.addButton({ title: "Copy model JSON" }).on("click", () => {
    onCopyForSuperCollider?.();
  });

  const bridgeFolder = soundTab.addFolder({ title: "External bridge", expanded: false });
  const bridgeParams = {
    enabled: false,
    url: "ws://localhost:57120",
    autoSend: false,
  };

  bridgeFolder.addBinding(bridgeParams, "enabled", { label: "connect" }).on("change", (ev) => {
    externalBridge.setEnabled(ev.value);
  });
  bridgeFolder.addBinding(bridgeParams, "url", { label: "WebSocket URL" }).on("change", (ev) => {
    externalBridge.setUrl(ev.value);
  });
  bridgeFolder.addBinding(bridgeParams, "autoSend", { label: "auto send" });

  // --- Settings: WebMIDI + CC mapping ---
  const midiFolder = settingsTab.addFolder({ title: "WebMIDI", expanded: true });
  const midiParams = {
    enabled: false,
    deviceId: "",
    lastNote: "—",
    status: "requesting access…",
  };

  const mappingFolder = settingsTab.addFolder({ title: "MIDI CC mapping", expanded: true });
  const mappingUi = {
    enabled: true,
    showLegend: true,
    xyzMode: "model",
    preset: Object.keys(MIDI_MAPPING_PRESETS)[0],
    section: "—",
    lastCc: "—",
    status: "loading mapping…",
  };

  const viewerMount = document.getElementById("viewer-mount");
  const midiLegend = createMidiLegend(viewerMount ?? document.body);
  let showLegendBinding = null;

  function applyLegendEnabled() {
    midiLegend.setEnabled(mappingUi.showLegend && mappingUi.enabled);
  }

  /** Turn legend on by default when WebMIDI + mapping become active. */
  function enableLegendForWiredMidi() {
    if (!midiParams.enabled || !mappingUi.enabled) {
      applyLegendEnabled();
      return;
    }
    mappingUi.showLegend = true;
    showLegendBinding?.refresh();
    applyLegendEnabled();
  }

  const ccMapper = new MidiCCMapper({
    getCamera: () => sceneSystem.camera,
    getControls: () => sceneSystem.controls,
    onParamChange: (detail) => {
      // Smoothed rotation/zoom/orbit advance in the app render loop
      if (detail?.smoothed) {
        if (detail.kind === "xyzMode") {
          mappingUi.xyzMode = detail.value;
          xyzModeBinding?.refresh();
        }
        return;
      }

      if (detail?.key === "glassEnabled" && morphParams.glassEnabled) {
        if (params.wireframe) {
          params.wireframe = false;
          wireframeBinding.refresh();
        }
        // Mirror morph UI glass-enable side effects
        if (!params.environment || params.environment === "none") {
          params.environment = pickRandomHdrEnvironment();
          envBinding?.refresh();
          onEnvironmentChange?.();
        }
      }
      morphUi?.refreshLocal?.();
      pane.refresh();
      onRefresh?.();
      syncMappingSectionDisplay();
    },
    onStatus: (message) => {
      mappingUi.status = message;
      mappingStatusBinding?.refresh();
      syncMappingSectionDisplay();
      midiLegend.show(message);
    },
  });

  function syncMappingSectionDisplay() {
    const section = ccMapper.currentSection;
    mappingUi.section = section
      ? MIDI_SECTION_LABELS[section] ?? section
      : "— none —";
    mappingSectionBinding?.refresh();
  }

  async function applyMappingPreset(presetName) {
    const url = MIDI_MAPPING_PRESETS[presetName];
    if (!url) {
      mappingUi.status = "unknown preset";
      mappingStatusBinding?.refresh();
      return;
    }
    try {
      const mapping = await loadMidiMapping(url);
      // Keep UI toggle in sync with file, then apply current toggle
      if (typeof mapping.enabled === "boolean") {
        mappingUi.enabled = mapping.enabled;
        mappingEnabledBinding?.refresh();
      }
      ccMapper.loadMapping(mapping);
      ccMapper.setEnabled(mappingUi.enabled);
      const maxParams = getMaxShapeParamCount();
      const range = mapping.sectionParameters;
      const span =
        range != null ? `${range.start}–${range.max}` : "—";
      const toggleCc = ccMapper.mapping?.xyzModeToggle?.cc;
      mappingUi.status = `loaded · params CC ${span} · xyz toggle CC ${toggleCc}`;
      syncMappingSectionDisplay();
      mappingUi.xyzMode = getMidiXyzMode();
      xyzModeBinding?.refresh();
    } catch (err) {
      console.warn("[MIDI CC] load failed:", err);
      mappingUi.status = err.message || "mapping load failed";
    }
    mappingStatusBinding?.refresh();
  }

  const webMidi = createWebMidiController({
    onNoteOn: (ev) => {
      midiParams.lastNote = `${midiNoteName(ev.note)} (${ev.note})`;
      midiParams.status = `note on · vel ${ev.velocity}`;
      midiStatusBinding.refresh();
      midiNoteBinding.refresh();
      onMidiNoteOn?.(ev);
    },
    onNoteOff: (ev) => {
      midiParams.status = `note off · ${midiNoteName(ev.note)}`;
      midiStatusBinding.refresh();
      onMidiNoteOff?.(ev);
    },
    onCC: (ev) => {
      mappingUi.lastCc = `CC ${ev.cc} = ${ev.value}`;
      mappingLastCcBinding?.refresh();
      const device = webMidi.getSelectedDevice();
      ccMapper.handleCC(
        ev.cc,
        ev.value,
        device?.id ?? ev.deviceId,
        device?.name ?? ""
      );
    },
    onStateChange: (devices) => {
      refreshMidiDevices(devices);
    },
  });

  let midiDeviceBinding = null;
  let midiStatusBinding = null;
  let midiNoteBinding = null;
  let mappingEnabledBinding = null;
  let mappingSectionBinding = null;
  let mappingLastCcBinding = null;
  let mappingStatusBinding = null;
  let xyzModeBinding = null;
  let midiDevices = [];

  function buildDeviceOptions(devices) {
    const options = { "— select device —": "" };
    devices.forEach((d, i) => {
      const label =
        devices.filter((x) => x.name === d.name).length > 1
          ? `${d.name} (${i + 1})`
          : d.name;
      options[label] = d.id;
    });
    return options;
  }

  function onMidiDeviceChange() {
    if (midiParams.enabled) {
      connectMidiInput();
    } else {
      const dev = midiDevices.find((d) => d.id === midiParams.deviceId);
      midiParams.status = dev ? `ready · ${dev.name}` : "ready";
    }
    midiStatusBinding?.refresh();
  }

  function rebuildMidiDeviceBinding() {
    if (midiDeviceBinding) {
      midiDeviceBinding.dispose();
      midiDeviceBinding = null;
    }
    const options = buildDeviceOptions(midiDevices);
    if (!midiParams.deviceId || !midiDevices.some((d) => d.id === midiParams.deviceId)) {
      midiParams.deviceId = midiDevices.length === 1 ? midiDevices[0].id : "";
    }
    midiDeviceBinding = midiFolder.addBinding(midiParams, "deviceId", {
      label: "input",
      options,
    });
    midiDeviceBinding.on("change", onMidiDeviceChange);
  }

  function refreshMidiDevices(devices = webMidi.listInputs()) {
    midiDevices = devices;
    rebuildMidiDeviceBinding();
  }

  function connectMidiInput() {
    if (!midiParams.enabled || !midiParams.deviceId) {
      webMidi.disconnect();
      return false;
    }
    if (!webMidi.selectDevice(midiParams.deviceId)) {
      midiParams.status = "device unavailable";
      return false;
    }
    const dev = midiDevices.find((d) => d.id === midiParams.deviceId);
    midiParams.status = dev ? `listening · ${dev.name}` : "listening";
    return true;
  }

  async function initMidiDevices() {
    if (!webMidi.isSupported()) {
      midiParams.status = "WebMIDI not supported";
      midiStatusBinding?.refresh();
      return;
    }
    try {
      const devices = await webMidi.requestAccess();
      refreshMidiDevices(devices);
      if (midiParams.enabled) {
        connectMidiInput();
      } else {
        midiParams.status = devices.length
          ? devices.length === 1
            ? `ready · ${devices[0].name}`
            : "ready · select a device"
          : "no MIDI inputs found";
      }
    } catch (err) {
      console.warn("[WebMIDI] access failed:", err);
      midiParams.status =
        err?.name === "SecurityError"
          ? "click Refresh to allow MIDI access"
          : err.message || "MIDI access denied";
    }
    midiStatusBinding?.refresh();
  }

  midiFolder.addBinding(midiParams, "enabled", { label: "enable" }).on("change", (ev) => {
    if (!ev.value) {
      webMidi.disconnect();
      const dev = midiDevices.find((d) => d.id === midiParams.deviceId);
      midiParams.status = dev ? `ready · ${dev.name}` : "ready";
      applyLegendEnabled();
    } else {
      connectMidiInput();
      enableLegendForWiredMidi();
    }
    midiStatusBinding?.refresh();
  });

  midiFolder.addButton({ title: "Refresh MIDI devices" }).on("click", async () => {
    if (!webMidi.isSupported()) {
      midiParams.status = "WebMIDI not supported";
      midiStatusBinding?.refresh();
      return;
    }
    midiParams.status = "requesting access…";
    midiStatusBinding?.refresh();
    try {
      const devices = await webMidi.requestAccess();
      refreshMidiDevices(devices);
      if (midiParams.enabled) {
        connectMidiInput();
      } else {
        midiParams.status = devices.length
          ? `${devices.length} device(s) found`
          : "no MIDI inputs found";
      }
    } catch (err) {
      console.warn("[WebMIDI] refresh failed:", err);
      refreshMidiDevices([]);
      midiParams.status = err.message || "MIDI access denied";
    }
    midiStatusBinding?.refresh();
  });

  midiNoteBinding = midiFolder.addBinding(midiParams, "lastNote", {
    label: "last note",
    readonly: true,
  });
  midiStatusBinding = midiFolder.addBinding(midiParams, "status", {
    label: "status",
    readonly: true,
  });

  mappingEnabledBinding = mappingFolder
    .addBinding(mappingUi, "enabled", { label: "enable mapping" })
    .on("change", (ev) => {
      ccMapper.setEnabled(ev.value);
      mappingUi.status = ev.value ? "mapping on" : "mapping off";
      mappingStatusBinding?.refresh();
      if (ev.value) enableLegendForWiredMidi();
      else applyLegendEnabled();
    });

  showLegendBinding = mappingFolder
    .addBinding(mappingUi, "showLegend", { label: "show legend" })
    .on("change", () => {
      applyLegendEnabled();
    });

  xyzModeBinding = mappingFolder
    .addBinding(mappingUi, "xyzMode", {
      label: "xyz target",
      options: {
        "model rotation": "model",
        "orbit camera": "orbit",
      },
    })
    .on("change", (ev) => {
      setMidiXyzMode(ev.value);
      mappingUi.status =
        ev.value === "orbit" ? "xyz: orbit camera" : "xyz: model rotation";
      mappingStatusBinding?.refresh();
    });

  mappingFolder
    .addBinding(MIDI_CAMERA_ZOOM, "minDistance", {
      label: "zoom min (close)",
      min: 0.01,
      max: 20,
      step: 0.01,
    })
    .on("change", () => {
      if (MIDI_CAMERA_ZOOM.minDistance >= MIDI_CAMERA_ZOOM.maxDistance) {
        MIDI_CAMERA_ZOOM.minDistance = Math.max(
          0.01,
          MIDI_CAMERA_ZOOM.maxDistance - 0.01
        );
      }
    });
  mappingFolder
    .addBinding(MIDI_CAMERA_ZOOM, "maxDistance", {
      label: "zoom max (far)",
      min: 0.5,
      max: 120,
      step: 0.5,
    })
    .on("change", () => {
      if (MIDI_CAMERA_ZOOM.maxDistance <= MIDI_CAMERA_ZOOM.minDistance) {
        MIDI_CAMERA_ZOOM.maxDistance = MIDI_CAMERA_ZOOM.minDistance + 0.5;
      }
    });

  mappingFolder.addBinding(MIDI_SMOOTHING, "rotationLambda", {
    label: "rotation smooth",
    min: 1,
    max: 40,
    step: 0.5,
  });
  mappingFolder.addBinding(MIDI_SMOOTHING, "orbitLambda", {
    label: "orbit smooth",
    min: 1,
    max: 40,
    step: 0.5,
  });
  mappingFolder.addBinding(MIDI_SMOOTHING, "zoomLambda", {
    label: "zoom smooth",
    min: 1,
    max: 40,
    step: 0.5,
  });

  mappingFolder
    .addBinding(mappingUi, "preset", {
      label: "preset",
      options: Object.fromEntries(
        Object.keys(MIDI_MAPPING_PRESETS).map((name) => [name, name])
      ),
    })
    .on("change", (ev) => {
      applyMappingPreset(ev.value);
    });

  mappingFolder.addButton({ title: "Reload mapping" }).on("click", () => {
    applyMappingPreset(mappingUi.preset);
  });

  mappingSectionBinding = mappingFolder.addBinding(mappingUi, "section", {
    label: "active section",
    readonly: true,
  });
  mappingLastCcBinding = mappingFolder.addBinding(mappingUi, "lastCc", {
    label: "last CC",
    readonly: true,
  });
  mappingStatusBinding = mappingFolder.addBinding(mappingUi, "status", {
    label: "status",
    readonly: true,
  });

  rebuildMidiDeviceBinding();
  initMidiDevices();
  applyMappingPreset(mappingUi.preset);
  applyLegendEnabled();

  function resolveMidiDeviceName() {
    return (
      webMidi.getSelectedDevice()?.name ??
      midiDevices.find((d) => d.id === midiParams.deviceId)?.name ??
      ccMapper.deviceName ??
      null
    );
  }

  function findMidiDeviceByName(name) {
    if (!name || !midiDevices.length) return null;
    const want = name.toLowerCase();
    return (
      midiDevices.find((d) => d.name.toLowerCase() === want) ??
      midiDevices.find(
        (d) => d.name.toLowerCase().includes(want) || want.includes(d.name.toLowerCase())
      ) ??
      null
    );
  }

  function serializeMidiForOrganism() {
    const mapping = ccMapper.mapping
      ? JSON.parse(JSON.stringify(ccMapper.mapping))
      : null;
    return {
      version: 1,
      webMidiEnabled: Boolean(midiParams.enabled),
      deviceName: resolveMidiDeviceName(),
      mappingEnabled: Boolean(mappingUi.enabled),
      showLegend: Boolean(mappingUi.showLegend),
      xyzMode: getMidiXyzMode(),
      preset: mappingUi.preset || null,
      zoom: {
        minDistance: MIDI_CAMERA_ZOOM.minDistance,
        maxDistance: MIDI_CAMERA_ZOOM.maxDistance,
      },
      smoothing: {
        rotationLambda: MIDI_SMOOTHING.rotationLambda,
        zoomLambda: MIDI_SMOOTHING.zoomLambda,
        orbitLambda: MIDI_SMOOTHING.orbitLambda,
      },
      mapping,
    };
  }

  async function applyMidiFromOrganism(midi) {
    if (!midi || typeof midi !== "object") return;

    if (midi.zoom && typeof midi.zoom === "object") {
      if (Number.isFinite(midi.zoom.minDistance)) {
        MIDI_CAMERA_ZOOM.minDistance = midi.zoom.minDistance;
      }
      if (Number.isFinite(midi.zoom.maxDistance)) {
        MIDI_CAMERA_ZOOM.maxDistance = midi.zoom.maxDistance;
      }
      if (MIDI_CAMERA_ZOOM.minDistance >= MIDI_CAMERA_ZOOM.maxDistance) {
        MIDI_CAMERA_ZOOM.maxDistance = MIDI_CAMERA_ZOOM.minDistance + 0.5;
      }
    }

    if (midi.smoothing && typeof midi.smoothing === "object") {
      if (Number.isFinite(midi.smoothing.rotationLambda)) {
        MIDI_SMOOTHING.rotationLambda = midi.smoothing.rotationLambda;
      }
      if (Number.isFinite(midi.smoothing.zoomLambda)) {
        MIDI_SMOOTHING.zoomLambda = midi.smoothing.zoomLambda;
      }
      if (Number.isFinite(midi.smoothing.orbitLambda)) {
        MIDI_SMOOTHING.orbitLambda = midi.smoothing.orbitLambda;
      }
    }

    if (midi.xyzMode === "orbit" || midi.xyzMode === "model") {
      setMidiXyzMode(midi.xyzMode);
      mappingUi.xyzMode = midi.xyzMode;
      xyzModeBinding?.refresh();
    }

    if (typeof midi.showLegend === "boolean") {
      mappingUi.showLegend = midi.showLegend;
      showLegendBinding?.refresh();
    }
    if (typeof midi.mappingEnabled === "boolean") {
      mappingUi.enabled = midi.mappingEnabled;
      mappingEnabledBinding?.refresh();
    }
    if (midi.preset && MIDI_MAPPING_PRESETS[midi.preset]) {
      mappingUi.preset = midi.preset;
    }

    if (midi.mapping && typeof midi.mapping === "object") {
      const mapping = JSON.parse(JSON.stringify(midi.mapping));
      ccMapper.loadMapping(mapping);
      ccMapper.setEnabled(mappingUi.enabled);
      const maxParams = getMaxShapeParamCount();
      const range = mapping.sectionParameters;
      const span = range != null ? `${range.start}–${range.max}` : "—";
      mappingUi.status = `organism mapping · CC ${span} (need ≥${maxParams})`;
      syncMappingSectionDisplay();
      mappingStatusBinding?.refresh();
    } else if (midi.preset && MIDI_MAPPING_PRESETS[midi.preset]) {
      await applyMappingPreset(midi.preset);
      ccMapper.setEnabled(mappingUi.enabled);
    } else {
      ccMapper.setEnabled(mappingUi.enabled);
    }

    // Ensure we have a fresh device list before matching
    if (webMidi.isSupported()) {
      try {
        if (!midiDevices.length) {
          const devices = await webMidi.requestAccess();
          refreshMidiDevices(devices);
        } else {
          refreshMidiDevices(webMidi.listInputs());
        }
      } catch (err) {
        console.warn("[MIDI] organism restore — access failed:", err);
      }
    }

    const savedName = midi.deviceName || midi.mapping?.device?.name || null;
    const matched = findMidiDeviceByName(savedName);

    if (matched) {
      midiParams.deviceId = matched.id;
      rebuildMidiDeviceBinding();
      if (midi.webMidiEnabled) {
        midiParams.enabled = true;
        connectMidiInput();
        enableLegendForWiredMidi();
        midiParams.status = `listening · ${matched.name}`;
      } else {
        midiParams.enabled = false;
        webMidi.disconnect();
        midiParams.status = `ready · ${matched.name}`;
        applyLegendEnabled();
      }
    } else {
      // Mapping/calibration still applied; device just isn't here
      midiParams.enabled = false;
      webMidi.disconnect();
      applyLegendEnabled();
      midiParams.status = savedName
        ? `device offline · ${savedName}`
        : midiDevices.length
          ? "ready · select a device"
          : "no MIDI inputs found";
      if (savedName) {
        mappingUi.status = `mapping loaded · waiting for ${savedName}`;
        mappingStatusBinding?.refresh();
      }
    }

    midiStatusBinding?.refresh();
    showLegendBinding?.refresh();
    mappingEnabledBinding?.refresh();
    pane.refresh();
    syncOrganismDirty();
  }

  setOrganismMidiHooks({
    serialize: serializeMidiForOrganism,
    apply: applyMidiFromOrganism,
  });

  async function applyEnvironment() {
    const path = getEnvPath(params.environment);
    if (!path) {
      sceneSystem.clearEnvironment();
      return;
    }
    await sceneSystem.loadEnvironment(path, {
      format: getEnvFormat(params.environment),
    });
    sceneSystem.scene.backgroundBlurriness = params.bgBlur;
  }

  return {
    pane,
    bridgeParams,
    midiParams,
    ready: morphUiReady,
    refreshPitch: () => pitchBinding.refresh(),
    refreshModulation: () => modulationUi.refresh(),
    applyEnvironment,
  };
}
