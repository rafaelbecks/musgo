/**
 * WebMIDI input — device selection, note on/off, and CC events.
 * Can listen to one port or fan-in from several (KeyLab MIDI + DAW, etc.).
 */
export function createWebMidiController({
  onNoteOn,
  onNoteOff,
  onCC,
  onMessage,
  onStateChange,
} = {}) {
  let access = null;
  /** @type {MIDIInput[]} */
  let attached = [];
  let selectedDeviceId = "";

  function listInputs() {
    if (!access) return [];
    return [...access.inputs.values()].map((d) => ({
      id: d.id,
      name: d.name || "Unknown device",
      manufacturer: d.manufacturer || "",
      state: d.state,
    }));
  }

  function handleMessage(ev) {
    const data = ev.data;
    if (!data || data.length < 1) return;

    const status = data[0];
    const data1 = data[1] ?? 0;
    const data2 = data[2] ?? 0;
    const cmd = status & 0xf0;
    const channel = status & 0x0f;
    const source = ev.currentTarget;
    const deviceId = source?.id ?? selectedDeviceId;
    const deviceName = source?.name ?? "";

    onMessage?.({
      status,
      cmd,
      channel,
      data1,
      data2,
      deviceId,
      deviceName,
      raw: [...data],
    });

    if (cmd === 0xb0) {
      onCC?.({
        cc: data1,
        value: data2,
        channel,
        deviceId,
        deviceName,
      });
      return;
    }

    if (cmd === 0x90 && data2 > 0) {
      onNoteOn?.({ note: data1, velocity: data2, channel, deviceId, deviceName });
    } else if (cmd === 0x80 || (cmd === 0x90 && data2 === 0)) {
      onNoteOff?.({ note: data1, velocity: data2 || 0, channel, deviceId, deviceName });
    }
  }

  function detachAll() {
    for (const inp of attached) {
      try {
        inp.removeEventListener("midimessage", handleMessage);
      } catch {
        /* ignore */
      }
      try {
        inp.onmidimessage = null;
      } catch {
        /* ignore */
      }
    }
    attached = [];
  }

  function attachInput(inp) {
    if (!inp || attached.includes(inp)) return false;
    // Prefer addEventListener — more reliable across browsers than onmidimessage
    inp.addEventListener("midimessage", handleMessage);
    attached.push(inp);
    return true;
  }

  /**
   * @param {string | string[] | null} deviceId
   *   - string: one port id
   *   - string[]: several port ids
   *   - "*" or null with listenAll: every input
   * @param {{ listenAll?: boolean }} [opts]
   */
  function selectDevice(deviceId, opts = {}) {
    detachAll();

    if (!access) {
      selectedDeviceId = "";
      return false;
    }

    if (opts.listenAll || deviceId === "*") {
      selectedDeviceId = "*";
      let n = 0;
      for (const inp of access.inputs.values()) {
        if (inp.state === "connected" && attachInput(inp)) n += 1;
      }
      return n > 0;
    }

    const ids = Array.isArray(deviceId)
      ? deviceId.filter(Boolean)
      : deviceId
        ? [deviceId]
        : [];

    if (!ids.length) {
      selectedDeviceId = "";
      return false;
    }

    selectedDeviceId = ids[0];
    let n = 0;
    for (const id of ids) {
      const inp = access.inputs.get(id);
      if (inp && attachInput(inp)) n += 1;
    }
    return n > 0;
  }

  async function requestAccess() {
    if (!navigator.requestMIDIAccess) {
      throw new Error("WebMIDI is not supported in this browser");
    }
    access = await navigator.requestMIDIAccess({ sysex: false });
    access.onstatechange = () => {
      // Re-bind if we were listening to all / selected ports disappeared
      if (selectedDeviceId === "*") {
        selectDevice("*", { listenAll: true });
      } else if (selectedDeviceId && attached.length === 0) {
        selectDevice(selectedDeviceId);
      }
      onStateChange?.(listInputs());
    };
    return listInputs();
  }

  function isSupported() {
    return Boolean(navigator.requestMIDIAccess);
  }

  function disconnect() {
    detachAll();
    selectedDeviceId = "";
  }

  function getSelectedDevice() {
    if (!access || !selectedDeviceId || selectedDeviceId === "*") {
      if (selectedDeviceId === "*" && attached[0]) {
        return {
          id: "*",
          name: `all inputs (${attached.length})`,
          manufacturer: "",
        };
      }
      return null;
    }
    const d = access.inputs.get(selectedDeviceId);
    if (!d) return null;
    return {
      id: d.id,
      name: d.name || "Unknown device",
      manufacturer: d.manufacturer || "",
    };
  }

  function getAttachedCount() {
    return attached.length;
  }

  return {
    isSupported,
    requestAccess,
    listInputs,
    selectDevice,
    disconnect,
    getSelectedDeviceId: () => selectedDeviceId,
    getSelectedDevice,
    getAttachedCount,
  };
}
