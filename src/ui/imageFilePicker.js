const IMAGE_ACCEPT = "image/*,.hdr,.exr";

const IMAGE_OPEN_OPTS = {
  types: [
    {
      description: "Image",
      accept: {
        "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".hdr", ".exr"],
      },
    },
  ],
  multiple: false,
};

export function supportsImageFilePicker() {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function"
  );
}

function isImageFile(file) {
  if (!file) return false;
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp|hdr|exr)$/i.test(file.name);
}

/**
 * Open a file picker for image / HDR / EXR files.
 * @returns {Promise<File>}
 */
export async function pickImageFile() {
  if (supportsImageFilePicker()) {
    try {
      const [handle] = await window.showOpenFilePicker(IMAGE_OPEN_OPTS);
      return handle.getFile();
    } catch (err) {
      if (err?.name === "AbortError") {
        throw new Error("File picker cancelled.");
      }
      throw err;
    }
  }

  return pickImageFileInput();
}

function pickImageFileInput() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = IMAGE_ACCEPT;
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
      if (!isImageFile(file)) {
        reject(new Error("Please choose an image file."));
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

export function imageFileFormat(file) {
  const name = String(file?.name ?? "").toLowerCase();
  if (name.endsWith(".exr")) return "exr";
  if (name.endsWith(".hdr")) return "hdr";
  return "image";
}
