import { readSrtFile } from "../ui/srtFilePicker.js";
import {
  SUBTITLE_DEFAULTS,
  buildSubtitleRecord,
  normalizeSubtitleSettings,
  readSubtitleRecord,
} from "./subtitleRecord.js";

/** Faces already loaded by the app (see styles.css / index.html). */
export const SUBTITLE_FONTS = [
  {
    id: "Analo Grotesk",
    family: '"Analo Grotesk", "IBM Plex Sans", sans-serif',
  },
  {
    id: "IBM Plex Sans",
    family: '"IBM Plex Sans", system-ui, sans-serif',
  },
  {
    id: "IBM Plex Mono",
    family: '"IBM Plex Mono", ui-monospace, monospace',
  },
];

export const SUBTITLE_ANCHORS = {
  Center: "center",
  "Bottom center": "bottom",
};

export { SUBTITLE_DEFAULTS };

export function subtitleFontOptions() {
  return Object.fromEntries(SUBTITLE_FONTS.map((font) => [font.id, font.id]));
}

export function subtitleFontFamily(id) {
  return (
    SUBTITLE_FONTS.find((font) => font.id === id)?.family ??
    SUBTITLE_FONTS[0].family
  );
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function byteChannel(n, asBytes) {
  if (!Number.isFinite(n)) return 0;
  const scaled = asBytes ? n : n <= 1 ? n * 255 : n;
  return Math.min(255, Math.max(0, Math.round(scaled)));
}

function cssColorFromRgb(r, g, b, a = 1, asBytes = false) {
  const alpha = Number.isFinite(a) ? Math.min(1, Math.max(0, a > 1 ? a / 255 : a)) : 1;
  const rgb = [r, g, b].map((c) => byteChannel(c, asBytes));
  if (alpha >= 0.999) {
    return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  }
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function normalizeColor(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value.toRgbaObject === "function") {
    const rgba = value.toRgbaObject();
    return cssColorFromRgb(rgba.r, rgba.g, rgba.b, rgba.a, value.type === "int");
  }
  if (value && typeof value === "object" && "r" in value && "g" in value && "b" in value) {
    const asBytes = [value.r, value.g, value.b].some((n) => Number(n) > 1);
    return cssColorFromRgb(value.r, value.g, value.b, value.a ?? 1, asBytes);
  }
  return "#ffffff";
}

/**
 * HTML caption plate above the WebGL canvas.
 * Bloom and dither never see this layer.
 *
 * @param {HTMLElement | null} mount
 * @param {{
 *   getSettings?: () => {
 *     show?: boolean,
 *     fontSize?: number,
 *     width?: number,
 *     anchor?: string,
 *     color?: string,
 *     font?: string,
 *   },
 *   onStatus?: (status: { fileName: string, index: number, count: number }) => void,
 *   onEdit?: () => void,
 *   onRefresh?: () => void,
 * }} [options]
 */
export function createSubtitleOverlay(
  mount,
  { getSettings, onStatus, onEdit, onRefresh } = {}
) {
  const state = {
    cues: /** @type {string[]} */ ([]),
    index: 0,
    fileName: "",
    mime: "application/x-subrip",
    bytes: /** @type {Uint8Array | null} */ (null),
  };
  let suppressEdit = false;

  const root = document.createElement("div");
  root.className = "subtitle-overlay";
  root.hidden = true;
  root.dataset.anchor = "bottom";
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-atomic", "true");

  const plate = document.createElement("div");
  plate.className = "subtitle-overlay__plate";

  const textEl = document.createElement("p");
  textEl.className = "subtitle-overlay__text";

  plate.appendChild(textEl);
  root.appendChild(plate);
  mount?.appendChild(root);

  let publishing = false;

  function publishStatus() {
    if (publishing) return;
    publishing = true;
    try {
      const count = state.cues.length;
      onStatus?.({
        fileName: state.fileName || "—",
        index: count ? state.index : -1,
        count,
      });
    } finally {
      publishing = false;
    }
  }

  function render({ notify = false } = {}) {
    const settings = getSettings?.() ?? {};
    const count = state.cues.length;
    const cue = count ? state.cues[state.index] ?? "" : "";

    textEl.textContent = cue;
    root.dataset.anchor = settings.anchor === "center" ? "center" : "bottom";
    root.style.setProperty(
      "--subtitle-width",
      `${clamp(settings.width, 15, 100, 64)}%`
    );
    root.style.setProperty(
      "--subtitle-size",
      `${clamp(settings.fontSize, 10, 200, 32)}px`
    );
    root.style.setProperty("--subtitle-color", normalizeColor(settings.color));
    root.style.setProperty("--subtitle-font", subtitleFontFamily(settings.font));

    const visible = settings.show !== false && count > 0 && cue.length > 0;
    root.hidden = !visible;

    if (notify) publishStatus();
  }

  function noteEdit() {
    if (!suppressEdit) onEdit?.();
  }

  function writeSettings(settings) {
    const target = getSettings?.();
    if (!target) return;
    target.show = settings.show;
    target.fontSize = settings.fontSize;
    target.width = settings.width;
    target.anchor = settings.anchor;
    target.color = settings.color;
    target.font = settings.font;
  }

  function emptyFile() {
    state.cues = [];
    state.index = 0;
    state.fileName = "";
    state.mime = "application/x-subrip";
    state.bytes = null;
  }

  function applyRecord(record) {
    writeSettings(record.settings);
    state.cues = record.cues;
    state.index = record.index;
    state.fileName = record.fileName;
    state.mime = record.mime;
    state.bytes = record.bytes;
    render({ notify: true });
    onRefresh?.();
  }

  function step(direction) {
    const count = state.cues.length;
    if (!count) return;
    state.index = (state.index + direction + count) % count;
    render({ notify: true });
    noteEdit();
  }

  function onKeyDown(ev) {
    if (!state.cues.length) return;
    if (ev.code !== "Space" && ev.key !== " ") return;
    if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.defaultPrevented) return;

    const tag = ev.target?.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      tag === "BUTTON" ||
      ev.target?.isContentEditable
    ) {
      return;
    }
    if (document.querySelector("[role='dialog']:not([hidden])")) return;

    ev.preventDefault();
    step(ev.shiftKey ? -1 : 1);
  }

  window.addEventListener("keydown", onKeyDown);

  return {
    sync() {
      render({ notify: false });
      noteEdit();
    },
    next() {
      step(1);
    },
    previous() {
      step(-1);
    },
    async loadFile(file) {
      const loaded = await readSrtFile(file);
      state.cues = loaded.cues;
      state.index = 0;
      state.fileName = loaded.fileName;
      state.mime = loaded.mime;
      state.bytes = loaded.bytes;
      render({ notify: true });
      noteEdit();
      console.info(`[srt] loaded ${loaded.fileName} (${loaded.cues.length} cues)`);
    },
    clear() {
      emptyFile();
      render({ notify: true });
      noteEdit();
    },
    getForSave() {
      const settings = getSettings?.() ?? {};
      return buildSubtitleRecord({
        settings: {
          ...settings,
          color: normalizeColor(settings.color),
        },
        index: state.index,
        bytes: state.bytes,
        fileName: state.fileName,
        mime: state.mime,
      });
    },
    applySaved(block) {
      suppressEdit = true;
      try {
        applyRecord(readSubtitleRecord(block));
      } catch (err) {
        console.error("[srt] failed to restore embedded subtitles", err);
        writeSettings(normalizeSubtitleSettings(block));
        emptyFile();
        render({ notify: true });
        onRefresh?.();
        if (typeof window !== "undefined") {
          window.alert(err?.message || "Failed to load embedded subtitles.");
        }
      } finally {
        suppressEdit = false;
      }
    },
    reset() {
      this.applySaved(null);
    },
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      root.remove();
    },
  };
}
