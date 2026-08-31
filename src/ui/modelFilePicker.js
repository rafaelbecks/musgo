const MODEL_ACCEPT = ".glb,.obj,model/gltf-binary";

const MODEL_OPEN_OPTS = {
  types: [
    {
      description: "3D model",
      accept: {
        "model/gltf-binary": [".glb"],
        "model/obj": [".obj"],
      },
    },
  ],
  multiple: false,
};

export function supportsModelFilePicker() {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function"
  );
}

export function isModelFile(file) {
  if (!file) return false;
  return /\.(glb|obj)$/i.test(file.name);
}

export function modelFileFormat(file) {
  return /\.obj$/i.test(file?.name ?? "") ? "obj" : "glb";
}

/**
 * Open a file picker for GLB / OBJ models.
 * @returns {Promise<File>}
 */
export async function pickModelFile() {
  if (supportsModelFilePicker()) {
    try {
      const [handle] = await window.showOpenFilePicker(MODEL_OPEN_OPTS);
      return handle.getFile();
    } catch (err) {
      if (err?.name === "AbortError") {
        throw new Error("File picker cancelled.");
      }
      throw err;
    }
  }

  return pickModelFileInput();
}

function pickModelFileInput() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = MODEL_ACCEPT;
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
      if (!isModelFile(file)) {
        reject(new Error("Please choose a GLB or OBJ file."));
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
