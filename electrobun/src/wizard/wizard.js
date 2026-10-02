/**
 * First-run / settings content-pack wizard.
 * UI matches MUSGO help-modal + examples-modal (styles.css).
 */

const api = {
  async status() {
    const res = await fetch("/__desktop/api/status");
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json();
  },
  async skip() {
    await fetch("/__desktop/api/skip", { method: "POST" });
  },
  async complete() {
    await fetch("/__desktop/api/complete", { method: "POST" });
  },
  /**
   * @param {string} packId
   * @param {(ev: object) => void} onEvent
   */
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

const listEl = document.getElementById("pack-list");
const form = document.getElementById("pack-form");
const btnSkip = document.getElementById("btn-skip");
const btnSkipFooter = document.getElementById("btn-skip-footer");
const btnDownload = document.getElementById("btn-download");
const progressBlock = document.getElementById("progress-block");
const progressLabel = document.getElementById("progress-label");
const progressPct = document.getElementById("progress-pct");
const progressFill = document.getElementById("progress-fill");
const progressBar = document.getElementById("progress-bar");
const progressDetail = document.getElementById("progress-detail");
const errorEl = document.getElementById("error");

/** @type {Array<object>} */
let packs = [];

function goToApp() {
  const params = new URLSearchParams(location.search);
  const next = params.get("next") || "/";
  location.href = next;
}

function setBusy(busy) {
  btnSkip.disabled = busy;
  btnSkipFooter.disabled = busy;
  btnDownload.disabled = busy;
  listEl.querySelectorAll("input").forEach((el) => {
    el.disabled = busy || el.dataset.installed === "1";
  });
  listEl.querySelectorAll(".examples-modal__item").forEach((el) => {
    el.disabled = busy || el.dataset.installed === "1";
  });
}

function setProgress(ratio, label, detail) {
  progressBlock.hidden = false;
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  progressFill.style.width = `${pct}%`;
  progressBar.setAttribute("aria-valuenow", String(pct));
  progressPct.textContent = `${pct}%`;
  if (label) progressLabel.textContent = label;
  if (detail != null) progressDetail.textContent = detail;
}

function showError(message) {
  errorEl.hidden = !message;
  errorEl.textContent = message || "";
}

function syncSelectedClass(li, input) {
  li.classList.toggle("is-selected", input.checked && !input.disabled);
}

function renderPacks() {
  listEl.innerHTML = "";
  for (const pack of packs) {
    const li = document.createElement("li");
    li.className =
      "wizard-pack" + (pack.installed ? " is-installed" : "");

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "pack";
    input.value = pack.id;
    input.id = `pack-${pack.id}`;
    input.checked = pack.recommended && !pack.installed;
    input.disabled = pack.installed;
    if (pack.installed) input.dataset.installed = "1";

    const itemBtn = document.createElement("button");
    itemBtn.type = "button";
    itemBtn.className = "examples-modal__item";
    itemBtn.setAttribute("aria-pressed", input.checked ? "true" : "false");
    if (pack.installed) {
      itemBtn.disabled = true;
      itemBtn.dataset.installed = "1";
    }

    const badge = pack.installed
      ? `<span class="wizard-pack__badge wizard-pack__badge--ok">Instalado</span>`
      : pack.recommended
        ? `<span class="wizard-pack__badge">Sugerido</span>`
        : "";

    itemBtn.innerHTML = `
      <span class="examples-modal__item-name">${pack.label}${badge}</span>
      <span class="examples-modal__item-file">${pack.description}</span>
      <span class="examples-modal__item-file">${pack.archive} · ${pack.sizeLabel}</span>
    `;

    itemBtn.addEventListener("click", () => {
      if (input.disabled) return;
      input.checked = !input.checked;
      itemBtn.setAttribute("aria-pressed", input.checked ? "true" : "false");
      syncSelectedClass(li, input);
    });

    li.append(input, itemBtn);
    listEl.append(li);
    syncSelectedClass(li, input);
  }
}

function selectedPackIds() {
  return [...form.querySelectorAll('input[name="pack"]:checked')].map(
    (el) => el.value,
  );
}

async function skipWizard() {
  showError("");
  setBusy(true);
  try {
    await api.skip();
    goToApp();
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
    setBusy(false);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  const ids = selectedPackIds();
  if (!ids.length) {
    await api.complete();
    goToApp();
    return;
  }

  setBusy(true);
  try {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const pack = packs.find((p) => p.id === id);
      const label = pack?.label || id;
      setProgress(
        i / ids.length,
        `Descargando ${label}`,
        `${i + 1} / ${ids.length}`,
      );

      await api.installPack(id, (ev) => {
        if (ev.type !== "progress") return;
        const local = Number(ev.ratio) || 0;
        const overall = (i + local) / ids.length;
        const phase = ev.phase === "extract" ? "Extrayendo" : "Descargando";
        const detail =
          ev.total > 0
            ? `${phase} ${label} — ${Math.round(ev.received / 1e6)} / ${Math.round(ev.total / 1e6)} MB`
            : `${phase} ${label}`;
        setProgress(overall, `${phase} ${label}`, detail);
      });
    }
    setProgress(1, "Listo", "Paquetes instalados");
    await api.complete();
    goToApp();
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
    setBusy(false);
    const status = await api.status();
    packs = status.packs;
    renderPacks();
  }
});

btnSkip.addEventListener("click", () => skipWizard());
btnSkipFooter.addEventListener("click", () => skipWizard());

async function boot() {
  try {
    const status = await api.status();
    packs = status.packs;
    renderPacks();
  } catch (err) {
    showError(
      "No se pudo conectar al servicio de paquetes. " +
        (err instanceof Error ? err.message : String(err)),
    );
    setBusy(true);
    btnSkip.disabled = false;
    btnSkipFooter.disabled = false;
  }
}

boot();
