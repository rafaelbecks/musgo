import { parseSrt } from "../subtitles/parseSrt.js";

const SRT_ACCEPT = ".srt,application/x-subrip,text/plain";

const SRT_OPEN_OPTS = {
  types: [
    {
      description: "SubRip subtitles",
      accept: {
        "application/x-subrip": [".srt"],
        "text/plain": [".srt"],
      },
    },
  ],
  multiple: false,
};

export function supportsSrtFilePicker() {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function"
  );
}

export function isSrtFile(file) {
  if (!file) return false;
  return String(file.name || "").toLowerCase().endsWith(".srt");
}

/**
 * @returns {Promise<File>}
 */
export async function pickSrtFile() {
  if (supportsSrtFilePicker()) {
    try {
      const [handle] = await window.showOpenFilePicker(SRT_OPEN_OPTS);
      const file = await handle.getFile();
      if (!isSrtFile(file)) {
        throw new Error("Please choose an .srt file.");
      }
      return file;
    } catch (err) {
      if (err?.name === "AbortError") {
        throw new Error("File picker cancelled.");
      }
      throw err;
    }
  }

  return pickSrtFileInput();
}

function pickSrtFileInput() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = SRT_ACCEPT;
    input.style.display = "none";
    document.body.appendChild(input);

    const cleanup = () => {
      input.remove();
    };

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        reject(new Error("No file selected."));
        return;
      }
      if (!isSrtFile(file)) {
        reject(new Error("Please choose an .srt file."));
        return;
      }
      resolve(file);
    });

    input.addEventListener("cancel", () => {
      cleanup();
      reject(new Error("File picker cancelled."));
    });

    input.click();
  });
}

/**
 * @param {ArrayBuffer | Uint8Array} buffer
 */
export function decodeSrtBytes(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * @param {Uint8Array | ArrayBuffer} bytes
 * @returns {string[]}
 */
export function cuesFromSrtBytes(bytes) {
  return parseSrt(decodeSrtBytes(bytes));
}

/**
 * @param {File} file
 * @returns {Promise<{ cues: string[], fileName: string, mime: string, bytes: Uint8Array }>}
 */
export async function readSrtFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const cues = cuesFromSrtBytes(bytes);
  if (!cues.length) {
    throw new Error("That SRT file has no subtitle text.");
  }
  return {
    cues,
    fileName: file.name || "subtitles.srt",
    mime: file.type || "application/x-subrip",
    bytes,
  };
}
