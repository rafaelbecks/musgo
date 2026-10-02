/**
 * Compact in-app content pack downloader (MUSGO help-modal look).
 */

import {
  refreshContentAvailability,
  packIdForLibrary,
} from "./contentAvailability.js";

const CLOSE_ICON_SVG = `
<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18" />
  <line x1="6" y1="6" x2="18" y2="18" />
</svg>
`.trim();

const api = {
  async status() {
    const res = await fetch("/__desktop/api/status", { cache: "no-store" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json();
  },
  async installPack(packId, onEvent) {
    const res = await fetch("/__desktop/api/install-pack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId }),
    });
    if (!res.ok || !res.body) throw new Error(`install failed (${res.status})`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let failed = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        onEvent(ev);
        if (ev.type === "error") failed = ev.message || "Install failed";
      }
    }
    if (buffer.trim()) {
      const ev = JSON.parse(buffer);
      onEvent(ev);
      if (ev.type === "error") failed = ev.message || "Install failed";
    }
    if (failed) throw new Error(failed);
  },
};

/** @type {ReturnType<typeof createContentPackModal> | null} */
let singleton = null;

export function getContentPackModal() {
  if (!singleton) singleton = createContentPackModal();
  return singleton;
}

export function createContentPackModal() {
  const modal = document.createElement("div");
  modal.id = "content-packs-modal";
  modal.className = "help-modal content-packs-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "content-packs-title");
  modal.hidden = true;
  modal.innerHTML = `
    <div class="help-modal__content content-packs-modal__content">
      <header class="help-modal__header">
        <h2 id="content-packs-title">Contenidos extra</h2>
        <button type="button" class="help-modal__close" title="Cerrar" aria-label="Cerrar">
          ${CLOSE_ICON_SVG}
        </button>
      </header>
      <div class="help-modal__body content-packs-modal__body">
        <p class="content-packs-modal__lede">
          Descargá solo lo que necesites. La app sigue usable sin estos paquetes.
        </p>
        <form id="content-packs-form">
          <ul class="content-packs-modal__list" id="content-packs-list" role="list"></ul>
          <div class="loading-card content-packs-modal__progress" id="content-packs-progress" hidden>
            <p class="loading-label" id="content-packs-progress-label">Preparando…</p>
            <div class="loading-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="content-packs-progress-bar">
              <div class="loading-bar" id="content-packs-progress-fill"></div>
            </div>
            <p class="content-packs-modal__progress-detail" id="content-packs-progress-detail"></p>
          </div>
          <p class="content-packs-modal__error" id="content-packs-error" hidden></p>
          <div class="content-packs-modal__actions">
            <button type="button" class="wizard-btn wizard-btn--ghost" id="content-packs-cancel">Cerrar</button>
            <button type="submit" class="wizard-btn wizard-btn--primary" id="content-packs-download">Descargar</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const listEl = modal.querySelector("#content-packs-list");
  const form = modal.querySelector("#content-packs-form");
  const closeBtn = modal.querySelector(".help-modal__close");
  const cancelBtn = modal.querySelector("#content-packs-cancel");
  const downloadBtn = modal.querySelector("#content-packs-download");
  const progressBlock = modal.querySelector("#content-packs-progress");
  const progressLabel = modal.querySelector("#content-packs-progress-label");
  const progressFill = modal.querySelector("#content-packs-progress-fill");
  const progressBar = modal.querySelector("#content-packs-progress-bar");
  const progressDetail = modal.querySelector("#content-packs-progress-detail");
  const errorEl = modal.querySelector("#content-packs-error");

  /** @type {Array<object>} */
  let packs = [];
  let isOpen = false;
  /** @type {((ok: boolean) => void) | null} */
  let pendingResolve = null;

  function setBusy(busy) {
    downloadBtn.disabled = busy;
    cancelBtn.disabled = busy;
    closeBtn.disabled = busy;
    listEl.querySelectorAll("input, button").forEach((el) => {
      if (el.dataset.installed === "1") {
        el.disabled = true;
        return;
      }
      el.disabled = busy;
    });
  }

  function showError(message) {
    errorEl.hidden = !message;
    errorEl.textContent = message || "";
  }

  function setProgress(ratio, label, detail) {
    progressBlock.hidden = false;
    const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
    progressFill.style.width = `${pct}%`;
    progressBar.setAttribute("aria-valuenow", String(pct));
    if (label) progressLabel.textContent = label;
    progressDetail.textContent = detail || `${pct}%`;
  }

  function render(preselectIds = []) {
    const pre = new Set(preselectIds);
    listEl.innerHTML = "";
    for (const pack of packs) {
      const ready = Boolean(pack.available || pack.installed);
      const li = document.createElement("li");
      li.className =
        "content-packs-modal__item" + (ready ? " is-installed" : "");

      const label = document.createElement("label");
      label.className = "content-packs-modal__row";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "pack";
      input.value = pack.id;
      input.checked = !ready && (pre.has(pack.id) || pack.recommended);
      input.disabled = ready;
      if (ready) input.dataset.installed = "1";

      const text = document.createElement("span");
      text.className = "content-packs-modal__text";
      text.innerHTML = `
        <span class="content-packs-modal__name">${pack.label}${
          ready
            ? ' <em class="content-packs-modal__badge">Disponible</em>'
            : ""
        }</span>
        <span class="content-packs-modal__meta">${pack.sizeLabel} · ${pack.description}</span>
      `;

      label.append(input, text);
      li.append(label);
      listEl.append(li);
    }
  }

  function selectedIds() {
    return [...form.querySelectorAll('input[name="pack"]:checked')].map(
      (el) => el.value,
    );
  }

  function finish(ok) {
    hide();
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve?.(ok);
  }

  function hide() {
    isOpen = false;
    modal.hidden = true;
    modal.classList.remove("is-open");
  }

  /**
   * @param {{ preselect?: string[], library?: string }=} opts
   * @returns {Promise<boolean>} true if something installed / already available
   */
  async function open(opts = {}) {
    if (isOpen) return false;
    showError("");
    progressBlock.hidden = true;
    progressFill.style.width = "0%";

    try {
      const status = await api.status();
      packs = status.packs || [];
    } catch (err) {
      window.open(
        "https://github.com/rafaelbecks/musgo/releases/tag/v1",
        "_blank",
        "noopener",
      );
      return false;
    }

    const preselect = [...(opts.preselect || [])];
    if (opts.library) {
      const id = packIdForLibrary(/** @type {any} */ (opts.library));
      if (id) preselect.push(id);
    }

    render(preselect);
    isOpen = true;
    modal.hidden = false;
    modal.classList.add("is-open");
    closeBtn.focus();

    return new Promise((resolve) => {
      pendingResolve = resolve;
    });
  }

  /**
   * Ensure a library pack is installed; opens modal if missing.
   * @param {import("./contentAvailability.js").LibraryKey} library
   */
  async function ensureLibrary(library) {
    const state = await refreshContentAvailability();
    if (state.libraries[library]) return true;
    if (!state.desktop) return false;
    return open({ library });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const ids = selectedIds();
    if (!ids.length) {
      finish(false);
      return;
    }
    setBusy(true);
    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const pack = packs.find((p) => p.id === id);
        const label = pack?.label || id;
        setProgress(i / ids.length, `Descargando ${label}`, `${i + 1} / ${ids.length}`);
        await api.installPack(id, (ev) => {
          if (ev.type !== "progress") return;
          const local = Number(ev.ratio) || 0;
          const overall = (i + local) / ids.length;
          const phase = ev.phase === "extract" ? "Extrayendo" : "Descargando";
          const detail =
            ev.total > 0
              ? `${Math.round(ev.received / 1e6)} / ${Math.round(ev.total / 1e6)} MB`
              : `${phase}…`;
          setProgress(overall, `${phase} ${label}`, detail);
        });
      }
      setProgress(1, "Listo", "Instalado");
      await refreshContentAvailability();
      finish(true);
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      try {
        const status = await api.status();
        packs = status.packs || [];
        render(ids);
      } catch {
        /* ignore */
      }
    }
  });

  closeBtn.addEventListener("click", () => finish(false));
  cancelBtn.addEventListener("click", () => finish(false));
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal && !downloadBtn.disabled) finish(false);
  });

  return {
    open,
    ensureLibrary,
    close: () => finish(false),
    destroy() {
      finish(false);
      modal.remove();
      if (singleton === this) singleton = null;
    },
  };
}
