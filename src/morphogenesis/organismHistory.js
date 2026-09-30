/**
 * Memento stack for organism edits.
 * Up to 20 moments in memory, mirrored in localStorage per specimen.
 */

import { SHAPE_LABELS } from "./morphParams.js";
import {
  ORGANISM_TYPE,
  ensureOrganismDraftId,
  getOrganismMemento,
  getOrganismSession,
  setOrganismHistoryBridge,
} from "./organismState.js";

const MAX_ENTRIES = 20;
const MAX_BUCKETS = 8;
const COMMIT_MS = 500;
const STORAGE_KEY = "musgo.organism.history.v1";

/** @type {{ id: string, at: number, label: string, fingerprint: string, state: object }[]} */
let entries = [];
let cursor = -1;
let loadedKey = null;
let ready = false;
let suppressDepth = 0;
let timer = 0;
let applyToken = 0;
let settledToken = 0;
let tail = Promise.resolve();

/** @type {((state: object) => void | Promise<void>) | null} */
let applyHook = null;

/** @type {Set<() => void>} */
const listeners = new Set();

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function sessionKey() {
  return getOrganismSession().id || ensureOrganismDraftId();
}

function emptyStore() {
  return { version: 1, buckets: {} };
}

function readStore() {
  if (typeof localStorage === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !parsed.buckets || typeof parsed.buckets !== "object") {
      return emptyStore();
    }
    return parsed;
  } catch {
    return emptyStore();
  }
}

function prune(store) {
  while (Object.keys(store.buckets).length > MAX_BUCKETS) {
    const keys = Object.keys(store.buckets).filter((key) => key !== loadedKey);
    if (!keys.length) break;
    keys.sort(
      (a, b) => (store.buckets[a]?.updatedAt || 0) - (store.buckets[b]?.updatedAt || 0)
    );
    delete store.buckets[keys[0]];
  }
}

function writeStore(store) {
  if (typeof localStorage === "undefined") return;
  delete store.buckets.untitled;
  prune(store);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    const keys = Object.keys(store.buckets)
      .filter((key) => key !== loadedKey)
      .sort((a, b) => (store.buckets[a]?.updatedAt || 0) - (store.buckets[b]?.updatedAt || 0));
    while (keys.length) {
      delete store.buckets[keys.shift()];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        return;
      } catch {
        // keep dropping older specimens
      }
    }
    console.warn("[history] could not persist undo stack", err);
  }
}

function persistBucket(key = loadedKey) {
  if (!key) return;
  const store = readStore();
  store.buckets[key] = {
    cursor,
    updatedAt: Date.now(),
    entries,
  };
  writeStore(store);
}

function isEntry(entry) {
  return (
    entry &&
    typeof entry.id === "string" &&
    typeof entry.at === "number" &&
    typeof entry.label === "string" &&
    typeof entry.fingerprint === "string" &&
    entry.state &&
    entry.state.type === ORGANISM_TYPE
  );
}

function loadBucket(key) {
  const bucket = readStore().buckets[key];
  if (!bucket || !Array.isArray(bucket.entries)) {
    entries = [];
    cursor = -1;
    return false;
  }
  entries = bucket.entries.filter(isEntry).slice(-MAX_ENTRIES);
  const savedCursor = Number.isInteger(bucket.cursor) ? bucket.cursor : entries.length - 1;
  cursor = entries.length ? Math.max(0, Math.min(savedCursor, entries.length - 1)) : -1;
  return entries.length > 0;
}

function trim() {
  while (entries.length > MAX_ENTRIES) {
    entries.shift();
    cursor -= 1;
  }
  if (!entries.length) {
    cursor = -1;
    return;
  }
  if (cursor < 0) cursor = 0;
  if (cursor > entries.length - 1) cursor = entries.length - 1;
}

function snapshotEntry(label, memo) {
  return {
    id: uid(),
    at: Date.now(),
    label: label || "cambio",
    fingerprint: memo.fingerprint,
    state: JSON.parse(JSON.stringify(memo.state)),
  };
}

function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.error("[history] listener failed", err);
    }
  }
}

function lastMatch(fingerprint) {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].fingerprint === fingerprint) return i;
  }
  return -1;
}

function restorePending() {
  return applyToken !== settledToken;
}

function drifted() {
  if (restorePending() || !ready || cursor < 0 || !entries[cursor]) return false;
  return getOrganismMemento().fingerprint !== entries[cursor].fingerprint;
}

function fieldLabel(section, key, value) {
  if (section === "modulation") return "modulación";
  if (key === "shape") return `forma → ${SHAPE_LABELS[value] || value}`;
  if (key === "environment") return `entorno → ${value}`;
  if (key === "uwEnabled") return value ? "underwater on" : "underwater off";
  if (section === "underwater") {
    const raw = key.replace(/^uw/, "");
    const name = raw.charAt(0).toLowerCase() + raw.slice(1);
    return `underwater ${name}`;
  }
  if (section === "midi") {
    if (key === "webMidiEnabled") return value ? "MIDI on" : "MIDI off";
    if (key === "mapping") return "MIDI mapping";
    if (key === "zoom") return "MIDI zoom";
    if (key === "smoothing") return "MIDI smoothing";
    if (key === "deviceName") return "MIDI device";
    return `MIDI ${key}`;
  }
  if (typeof value === "boolean") return `${key} ${value ? "on" : "off"}`;
  return key;
}

function diffSection(prev, next, section) {
  const before = prev?.[section];
  const after = next?.[section];
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (section === "modulation") return ["modulación"];
  if (!before || !after || typeof before !== "object" || typeof after !== "object") {
    return [section];
  }
  const labels = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      labels.push(fieldLabel(section, key, after[key]));
    }
  }
  if (section === "midi" && labels.length > 2) return ["MIDI"];
  return labels;
}

export function describeOrganismChange(prevFingerprint, nextFingerprint) {
  let prev;
  let next;
  try {
    prev = JSON.parse(prevFingerprint);
    next = JSON.parse(nextFingerprint);
  } catch {
    return "cambio";
  }
  const parts = [
    ...diffSection(prev, next, "morph"),
    ...diffSection(prev, next, "viewer"),
    ...diffSection(prev, next, "underwater"),
    ...diffSection(prev, next, "midi"),
    ...diffSection(prev, next, "modulation"),
  ];
  if (!parts.length) return "cambio";
  const label = parts.length <= 3 ? parts.join(", ") : `${parts.slice(0, 3).join(", ")} +${parts.length - 3}`;
  return label.length > 80 ? `${label.slice(0, 77)}…` : label;
}

function appendRaw(label, memo) {
  entries.push(snapshotEntry(label, memo));
  cursor = entries.length - 1;
  trim();
  persistBucket();
  notify();
}

/**
 * Park history on the current specimen.
 * `replace` starts a fresh stack (Nuevo). Otherwise resume this specimen's stored moments.
 */
export function anchorOrganismHistory(label, { replace = false } = {}) {
  if (timer) {
    clearTimeout(timer);
    timer = 0;
  }
  const key = sessionKey();
  if (replace) {
    entries = [];
    cursor = -1;
    loadedKey = key;
  } else if (!ready || key !== loadedKey) {
    if (ready && loadedKey && key !== loadedKey) persistBucket(loadedKey);
    loadBucket(key);
    loadedKey = key;
  }

  const memo = getOrganismMemento();
  ready = true;

  if (!entries.length) {
    appendRaw(label, memo);
    return;
  }
  if (entries[cursor]?.fingerprint === memo.fingerprint) {
    persistBucket();
    notify();
    return;
  }
  const match = lastMatch(memo.fingerprint);
  if (match >= 0) {
    cursor = match;
    persistBucket();
    notify();
    return;
  }
  appendRaw(label, memo);
}

export function isOrganismHistoryReady() {
  return ready;
}

/** Move the current moment's snapshot up to the live params (load side-effects). */
export function realignOrganismHistoryCursor() {
  if (!ready || cursor < 0 || !entries[cursor]) return;
  const memo = getOrganismMemento();
  if (memo.fingerprint === entries[cursor].fingerprint) return;
  entries[cursor] = {
    ...entries[cursor],
    fingerprint: memo.fingerprint,
    state: JSON.parse(JSON.stringify(memo.state)),
  };
  persistBucket();
}

/** If a save assigns a new specimen id, move the stack onto that id. */
export function rekeyOrganismHistory() {
  if (!ready || !loadedKey) return;
  const key = sessionKey();
  if (!key || key === loadedKey) {
    persistBucket(loadedKey);
    return;
  }
  const store = readStore();
  delete store.buckets[loadedKey];
  loadedKey = key;
  store.buckets[key] = { cursor, updatedAt: Date.now(), entries };
  writeStore(store);
}

function noteOrganismEdit() {
  if (!ready || suppressDepth > 0) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = 0;
    if (restorePending() || suppressDepth > 0) {
      noteOrganismEdit();
      return;
    }
    commitOrganismHistoryNow();
  }, COMMIT_MS);
}

export function commitOrganismHistoryNow() {
  if (!ready || suppressDepth > 0 || restorePending()) return false;
  if (timer) {
    clearTimeout(timer);
    timer = 0;
  }
  if (cursor < 0 || !entries[cursor]) return false;
  const memo = getOrganismMemento();
  if (memo.fingerprint === entries[cursor].fingerprint) return false;
  const label = describeOrganismChange(entries[cursor].fingerprint, memo.fingerprint);
  entries = entries.slice(0, cursor + 1);
  entries.push(snapshotEntry(label, memo));
  cursor = entries.length - 1;
  trim();
  persistBucket();
  notify();
  return true;
}

export function setOrganismHistoryApply(fn) {
  applyHook = fn;
}

export async function runWithoutOrganismHistory(fn) {
  if (timer) {
    clearTimeout(timer);
    timer = 0;
  }
  suppressDepth += 1;
  try {
    return await fn();
  } finally {
    suppressDepth -= 1;
  }
}

function scheduleApply() {
  const token = ++applyToken;
  const state = entries[cursor]?.state;
  if (!state || !applyHook) {
    settledToken = token;
    return Promise.resolve(false);
  }
  const copy = JSON.parse(JSON.stringify(state));
  if (timer) {
    clearTimeout(timer);
    timer = 0;
  }
  tail = tail.then(async () => {
    if (token !== applyToken) return false;
    suppressDepth += 1;
    try {
      await applyHook(copy);
      return true;
    } catch (err) {
      console.error("[history] restore failed", err);
      if (typeof window !== "undefined") {
        window.alert(err?.message || "No se pudo restaurar ese momento.");
      }
      return false;
    } finally {
      suppressDepth -= 1;
      if (token === applyToken) {
        settledToken = token;
        notify();
      }
    }
  });
  return tail;
}

export function undoOrganism() {
  if (!restorePending()) commitOrganismHistoryNow();
  if (!ready || cursor <= 0) return Promise.resolve(false);
  cursor -= 1;
  persistBucket();
  notify();
  return scheduleApply();
}

export function redoOrganism() {
  if (!ready) return Promise.resolve(false);
  if (!restorePending() && drifted()) {
    commitOrganismHistoryNow();
    return Promise.resolve(false);
  }
  if (timer) {
    clearTimeout(timer);
    timer = 0;
  }
  if (cursor >= entries.length - 1) return Promise.resolve(false);
  cursor += 1;
  persistBucket();
  notify();
  return scheduleApply();
}

export function restoreOrganismHistoryId(id) {
  if (!ready || !id) return Promise.resolve(false);
  if (!restorePending()) commitOrganismHistoryNow();
  const index = entries.findIndex((entry) => entry.id === id);
  if (index < 0 || index === cursor) return Promise.resolve(false);
  if (timer) {
    clearTimeout(timer);
    timer = 0;
  }
  cursor = index;
  persistBucket();
  notify();
  return scheduleApply();
}

export function canUndoOrganism() {
  return ready && (cursor > 0 || drifted());
}

export function canRedoOrganism() {
  return ready && cursor < entries.length - 1 && !drifted();
}

export function getOrganismHistory() {
  return {
    cursor,
    limit: MAX_ENTRIES,
    canUndo: canUndoOrganism(),
    canRedo: canRedoOrganism(),
    entries: entries.map((entry, index) => ({
      id: entry.id,
      at: entry.at,
      label: entry.label,
      index,
      current: index === cursor,
    })),
  };
}

export function subscribeOrganismHistory(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

setOrganismHistoryBridge({
  onEdit: noteOrganismEdit,
  onSave: rekeyOrganismHistory,
});

if (typeof window !== "undefined") {
  window.addEventListener(
    "keydown",
    (ev) => {
      const mod = ev.metaKey || ev.ctrlKey;
      if (!mod || ev.altKey || !ev.key) return;
      const key = ev.key.toLowerCase();
      const redo = (key === "z" && ev.shiftKey) || (key === "y" && ev.ctrlKey && !ev.metaKey && !ev.shiftKey);
      const undo = key === "z" && !ev.shiftKey;
      if (!undo && !redo) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (undo) void undoOrganism();
      else void redoOrganism();
    },
    true
  );
  window.addEventListener("pagehide", () => {
    if (!restorePending()) commitOrganismHistoryNow();
  });
}
