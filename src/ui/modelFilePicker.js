export const MODEL_FORMATS = {
  glb: {
    id: "glb",
    label: "GLB",
    extension: ".glb",
    mime: "model/gltf-binary",
  },
  obj: {
    id: "obj",
    label: "OBJ",
    extension: ".obj",
    mime: "model/obj",
  },
  usdz: {
    id: "usdz",
    label: "USDZ",
    extension: ".usdz",
    mime: "model/vnd.usdz+zip",
  },
  stl: {
    id: "stl",
    label: "STL",
    extension: ".stl",
    mime: "model/stl",
  },
};

export const MODEL_FORMAT_IDS = Object.keys(MODEL_FORMATS);
const MODEL_EXT_RE = /\.(glb|obj|usdz|stl)$/i;

function formatsFor(format = null) {
  if (format && MODEL_FORMATS[format]) return [MODEL_FORMATS[format]];
  return Object.values(MODEL_FORMATS);
}

function formatListLabel(formats) {
  if (formats.length === 1) return formats[0].label;
  const labels = formats.map((f) => f.label);
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, or ${labels.at(-1)}`;
}

function pickerConfig(format = null) {
  const formats = formatsFor(format);
  const accept = formats.flatMap((f) => [f.extension, f.mime]).join(",");
  const mimeAccept = {};
  for (const f of formats) {
    mimeAccept[f.mime] = [f.extension];
  }
  return {
    formats,
    accept,
    openOpts: {
      types: [
        {
          description: formats.length === 1 ? `${formats[0].label} model` : "3D model",
          accept: mimeAccept,
        },
      ],
      multiple: false,
    },
    errorMessage: `Please choose a ${formatListLabel(formats)} file.`,
  };
}

export function supportsModelFilePicker() {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function"
  );
}

export function isModelFile(file) {
  if (!file) return false;
  return MODEL_EXT_RE.test(file.name);
}

/** @returns {"glb" | "obj" | "usdz" | "stl"} */
export function modelFileFormat(file) {
  const name = file?.name ?? "";
  if (/\.obj$/i.test(name)) return "obj";
  if (/\.usdz$/i.test(name)) return "usdz";
  if (/\.stl$/i.test(name)) return "stl";
  return "glb";
}

/**
 * Open a file picker for GLB / OBJ / USDZ / STL models.
 * @param {string | null} [format]
 * @returns {Promise<File>}
 */
export async function pickModelFile(format = null) {
  const config = pickerConfig(format);
  if (supportsModelFilePicker()) {
    try {
      const [handle] = await window.showOpenFilePicker(config.openOpts);
      const file = await handle.getFile();
      assertModelFile(file, config);
      return file;
    } catch (err) {
      if (err?.name === "AbortError") {
        throw new Error("File picker cancelled.");
      }
      throw err;
    }
  }

  return pickModelFileInput(config);
}

function assertModelFile(file, config) {
  if (!isModelFile(file)) {
    throw new Error(config.errorMessage);
  }
  if (config.formats.length === 1 && modelFileFormat(file) !== config.formats[0].id) {
    throw new Error(config.errorMessage);
  }
}

function pickModelFileInput(config) {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = config.accept;
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
      try {
        assertModelFile(file, config);
        resolve(file);
      } catch (err) {
        reject(err);
      }
    });

    input.addEventListener("cancel", () => {
      cleanup();
      reject(new Error("File picker cancelled."));
    });

    input.click();
  });
}
