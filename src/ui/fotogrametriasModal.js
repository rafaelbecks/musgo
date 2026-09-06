/**
 * Fotogrametrías secta modal — list + load GLB / USDZ from ./fotogrametrias-secta/Modelos/
 */

const INDEX_URL = "./fotogrametrias-secta/Modelos/index.json";
const MODELS_BASE = "./fotogrametrias-secta/Modelos/";

const CLOSE_ICON_SVG = `
<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18" />
  <line x1="6" y1="6" x2="18" y2="18" />
</svg>
`.trim();

function displayName(filename) {
  return filename
    .replace(/\.(glb|usdz|obj)$/i, "")
    .replace(/-/g, " ");
}

function modelMime(filename) {
  if (/\.usdz$/i.test(filename)) return "model/vnd.usdz+zip";
  if (/\.obj$/i.test(filename)) return "model/obj";
  return "model/gltf-binary";
}

export function createFotogrametriasModal({ loading, onSelectModel } = {}) {
  if (!onSelectModel) {
    return { open() {}, close() {}, destroy() {} };
  }

  const modal = document.createElement("div");
  modal.id = "fotogrametrias-modal";
  modal.className = "help-modal examples-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "fotogrametrias-modal-title");
  modal.hidden = true;
  modal.innerHTML = `
    <div class="help-modal__content examples-modal__content">
      <header class="help-modal__header">
        <h2 id="fotogrametrias-modal-title">Fotogrametrías secta</h2>
        <button type="button" class="help-modal__close" title="Cerrar" aria-label="Cerrar">
          ${CLOSE_ICON_SVG}
        </button>
      </header>
      <div class="help-modal__body examples-modal__body" id="fotogrametrias-modal-body">
        <p class="help-modal__loading">Cargando…</p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const bodyEl = modal.querySelector("#fotogrametrias-modal-body");
  const closeBtn = modal.querySelector(".help-modal__close");
  let loaded = false;
  let isOpen = false;

  async function loadList() {
    if (loaded) return;
    bodyEl.innerHTML = `<p class="help-modal__loading">Cargando…</p>`;
    try {
      const response = await fetch(INDEX_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const files = await response.json();
      if (!Array.isArray(files) || files.length === 0) {
        bodyEl.innerHTML = `<p>No se encontraron modelos.</p>`;
        loaded = true;
        return;
      }

      const ordered = files
        .map(String)
        .sort((a, b) =>
          String(a).localeCompare(String(b), "es", { sensitivity: "base" })
        );

      const list = document.createElement("ul");
      list.className = "examples-modal__list";
      for (const name of ordered) {
        const li = document.createElement("li");
        const itemBtn = document.createElement("button");
        itemBtn.type = "button";
        itemBtn.className = "examples-modal__item";
        itemBtn.dataset.file = name;
        itemBtn.innerHTML = `
          <span class="examples-modal__item-name">${displayName(name)}</span>
          <span class="examples-modal__item-file">${name}</span>
        `;
        itemBtn.addEventListener("click", () => selectModel(name));
        li.appendChild(itemBtn);
        list.appendChild(li);
      }
      bodyEl.replaceChildren(list);
      loaded = true;
    } catch (err) {
      console.error("[fotogrametrias] failed to load index", err);
      bodyEl.innerHTML = `<p>No se pudo cargar la lista de modelos.</p>`;
    }
  }

  async function selectModel(filename) {
    hide();
    loading?.begin("model");
    try {
      const response = await fetch(
        `${MODELS_BASE}${encodeURIComponent(filename)}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: modelMime(filename) });
      await onSelectModel?.(file);
    } catch (err) {
      console.error("[fotogrametrias] failed to open", filename, err);
      window.alert(err?.message || `No se pudo abrir ${filename}`);
    } finally {
      loading?.end("model");
    }
  }

  function show() {
    isOpen = true;
    modal.hidden = false;
    modal.classList.add("is-open");
    loaded = false;
    loadList();
    closeBtn.focus();
  }

  function hide() {
    isOpen = false;
    modal.classList.remove("is-open");
    modal.hidden = true;
  }

  function onKeyDown(ev) {
    if (!isOpen) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      hide();
    }
  }

  closeBtn.addEventListener("click", hide);
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) hide();
  });
  window.addEventListener("keydown", onKeyDown);

  return {
    open: show,
    close: hide,
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      modal.remove();
    },
  };
}
