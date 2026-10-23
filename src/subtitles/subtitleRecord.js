import { cuesFromSrtBytes } from "../ui/srtFilePicker.js";

/** Keep in step with SUBTITLE_FONTS in subtitleOverlay.js. */
const SUBTITLE_FONT_IDS = new Set([
  "Analo Grotesk",
  "IBM Plex Sans",
  "IBM Plex Mono",
]);

export const SUBTITLE_DEFAULTS = {
  show: true,
  fontSize: 32,
  width: 64,
  anchor: "bottom",
  color: "#ffffff",
  font: "Analo Grotesk",
};

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function uint8ToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function normalizeSubtitleSettings(raw = {}) {
  const font = SUBTITLE_FONT_IDS.has(raw.font) ? raw.font : SUBTITLE_DEFAULTS.font;
  const color = typeof raw.color === "string" && raw.color.trim()
    ? raw.color.trim()
    : SUBTITLE_DEFAULTS.color;
  return {
    show: raw.show !== false,
    fontSize: clamp(raw.fontSize, 12, 160, SUBTITLE_DEFAULTS.fontSize),
    width: clamp(raw.width, 20, 100, SUBTITLE_DEFAULTS.width),
    anchor: raw.anchor === "center" ? "center" : "bottom",
    color,
    font,
  };
}

/**
 * Settings plus the original SRT bytes, base64-encoded like other organism assets.
 * @param {{
 *   settings?: object,
 *   index?: number,
 *   bytes?: Uint8Array | null,
 *   fileName?: string,
 *   mime?: string,
 * }} source
 */
export function buildSubtitleRecord({
  settings = {},
  index = 0,
  bytes = null,
  fileName = "",
  mime = "application/x-subrip",
} = {}) {
  const record = {
    ...normalizeSubtitleSettings(settings),
    index: Math.max(0, Math.floor(Number(index) || 0)),
  };
  if (bytes && bytes.byteLength) {
    record.file = {
      fileName: fileName || "subtitles.srt",
      mime: mime || "application/x-subrip",
      encoding: "base64",
      data: uint8ToBase64(bytes),
    };
  }
  return record;
}

function bytesFromFileBlock(file) {
  if (!file || typeof file.data !== "string" || !file.data) return null;
  if (file.encoding === "utf-8") return new TextEncoder().encode(file.data);
  return base64ToUint8(file.data);
}

/**
 * Restore settings, cue index, and SRT bytes from an organism `subtitles` block.
 * Missing block → factory defaults and no file.
 * @param {object | null | undefined} block
 */
export function readSubtitleRecord(block) {
  if (!block || typeof block !== "object") {
    return {
      settings: { ...SUBTITLE_DEFAULTS },
      index: 0,
      cues: [],
      bytes: null,
      fileName: "",
      mime: "application/x-subrip",
    };
  }

  const settings = normalizeSubtitleSettings(block);
  if (!block.file?.data) {
    return {
      settings,
      index: 0,
      cues: [],
      bytes: null,
      fileName: "",
      mime: "application/x-subrip",
    };
  }

  let bytes;
  try {
    bytes = bytesFromFileBlock(block.file);
  } catch {
    throw new Error("Embedded SRT could not be decoded.");
  }
  if (!bytes?.byteLength) {
    throw new Error("Embedded SRT is empty.");
  }
  const cues = cuesFromSrtBytes(bytes);
  if (!cues.length) {
    throw new Error("Embedded SRT has no subtitle text.");
  }
  let index = Math.floor(Number(block.index));
  if (!Number.isFinite(index) || index < 0) index = 0;
  if (index >= cues.length) index = cues.length - 1;
  return {
    settings,
    index,
    cues,
    bytes,
    fileName: block.file.fileName || "subtitles.srt",
    mime: block.file.mime || "application/x-subrip",
  };
}
