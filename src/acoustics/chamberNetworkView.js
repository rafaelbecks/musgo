const CHAMBER_COLORS = [
  "#c4a882",
  "#7eb8da",
  "#a8c878",
  "#d4a0c8",
  "#e8b86d",
  "#8ab4c4",
  "#c9a96e",
  "#9eb5d4",
];

export function createChamberNetworkView(container, { onSelect, onMixChange } = {}) {
  let selectedId = null;
  let model = null;
  let mixUiState = null;

  if (!container) {
    return {
      render() {},
      setSelected() {},
      getSelected: () => null,
      dispose() {},
    };
  }

  container.innerHTML = `
    <div class="patch-network__empty">Analyze a shape to see the chamber network</div>
    <div class="patch-network__stage" hidden>
      <svg class="patch-network__wires" aria-hidden="true"></svg>
      <div class="patch-network__modules"></div>
    </div>
  `;

  const emptyEl = container.querySelector(".patch-network__empty");
  const stageEl = container.querySelector(".patch-network__stage");
  const wiresEl = container.querySelector(".patch-network__wires");
  const modulesEl = container.querySelector(".patch-network__modules");

  function setSelected(id) {
    selectedId = id;
    modulesEl.querySelectorAll(".patch-module").forEach((el) => {
      el.classList.toggle("patch-module--selected", Number(el.dataset.chamberId) === id);
    });
    drawWires();
  }

  function render(modelData, { mixState = null } = {}) {
    model = modelData;
    mixUiState = mixState;
    if (!model?.chambers?.length) {
      emptyEl.hidden = false;
      stageEl.hidden = true;
      return;
    }

    emptyEl.hidden = true;
    stageEl.hidden = false;

    modulesEl.innerHTML = [...model.chambers]
      .sort((a, b) => (a.chainIndex ?? a.id) - (b.chainIndex ?? b.id))
      .map((chamber, i) => {
        const color = CHAMBER_COLORS[i % CHAMBER_COLORS.length];
        const freq = chamber.frequency?.toFixed(1) ?? "—";
        const amp = chamber.amplitude?.toFixed(2) ?? "—";
        const decay = chamber.decay?.toFixed(2) ?? "—";
        const purity = chamber.purity != null ? `${(chamber.purity * 100).toFixed(0)}%` : "—";
        const drift = chamber.driftHz != null ? `${chamber.driftHz.toFixed(2)} Hz` : "—";
        const thick = chamber.thickness != null ? chamber.thickness.toFixed(3) : "—";
        const ui = mixState?.getUiState?.(chamber.id) ?? { enabled: true, silent: false };
        const silentClass = ui.silent ? " patch-module--silent" : "";
        const toggleClass = ui.enabled ? " patch-chamber-toggle--on" : " patch-chamber-toggle--off";

        return `
          <div class="patch-module${silentClass}" data-chamber-id="${chamber.id}" style="--module-color: ${color}">
            <span class="patch-module__port patch-module__port--in" data-port="in"></span>
            <span class="patch-module__port patch-module__port--out" data-port="out"></span>
            <div class="patch-module__head">
              <button type="button" class="patch-module__select">
                <span class="patch-module__title">${model.chambers.length === 1 ? "osc~" : "reson~"} ${chamber.id}</span>
                <span class="patch-module__label">${chamber.label ?? `chamber ${chamber.id}`}</span>
              </button>
              <button
                type="button"
                class="patch-chamber-toggle${toggleClass}"
                aria-pressed="${ui.enabled}"
                title="${ui.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}"
              >${ui.enabled ? "on" : "off"}</button>
            </div>
            <span class="patch-module__row"><span>f₀</span><span>${freq} Hz</span></span>
            <span class="patch-module__row"><span>thick</span><span>${thick}</span></span>
            <span class="patch-module__row"><span>amp</span><span>${amp}</span></span>
            <span class="patch-module__row"><span>decay</span><span>${decay}</span></span>
            <span class="patch-module__row"><span>purity</span><span>${purity}</span></span>
            <span class="patch-module__row"><span>drift</span><span>${drift}</span></span>
          </div>
        `;
      })
      .join("");

    modulesEl.querySelectorAll(".patch-module").forEach((el) => {
      const id = Number(el.dataset.chamberId);

      el.querySelector(".patch-module__select")?.addEventListener("click", () => {
        setSelected(id);
        onSelect?.(id);
      });

      el.querySelector(".patch-chamber-toggle")?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onMixChange?.(id);
      });
    });

    requestAnimationFrame(() => {
      drawWires();
      if (selectedId != null) setSelected(selectedId);
    });
  }

  function drawWires() {
    if (!model?.network?.length) {
      wiresEl.innerHTML = "";
      return;
    }

    const rect = stageEl.getBoundingClientRect();
    wiresEl.setAttribute("width", rect.width);
    wiresEl.setAttribute("height", rect.height);
    wiresEl.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);

    const ports = new Map();
    modulesEl.querySelectorAll(".patch-module").forEach((mod) => {
      const id = Number(mod.dataset.chamberId);
      const out = mod.querySelector('[data-port="out"]');
      const inn = mod.querySelector('[data-port="in"]');
      if (!out || !inn) return;
      const stageRect = stageEl.getBoundingClientRect();
      const outRect = out.getBoundingClientRect();
      const inRect = inn.getBoundingClientRect();
      const silent = mod.classList.contains("patch-module--silent");
      ports.set(id, {
        out: { x: outRect.left + outRect.width / 2 - stageRect.left, y: outRect.top + outRect.height / 2 - stageRect.top },
        in: { x: inRect.left + inRect.width / 2 - stageRect.left, y: inRect.top + inRect.height / 2 - stageRect.top },
        selected: id === selectedId,
        silent,
      });
    });

    const paths = model.network
      .map((edge) => {
        const a = ports.get(edge.from);
        const b = ports.get(edge.to);
        if (!a || !b) return "";
        const x1 = a.out.x;
        const y1 = a.out.y;
        const x2 = b.in.x;
        const y2 = b.in.y;
        const cx = (x1 + x2) / 2;
        const active = a.selected || b.selected;
        const w = 1 + edge.coupling * 3;
        const opacity = a.silent || b.silent ? 0.12 : active ? 0.9 : 0.35 + edge.coupling * 0.4;
        return `<path d="M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}" fill="none" stroke="var(--resonance)" stroke-width="${w}" opacity="${opacity}" class="patch-wire${active ? " patch-wire--active" : ""}"/>`;
      })
      .join("");

    wiresEl.innerHTML = paths;
  }

  const ro = new ResizeObserver(() => drawWires());
  ro.observe(container);

  return {
    render,
    setSelected,
    getSelected: () => selectedId,
    dispose() {
      ro.disconnect();
    },
  };
}

export function renderChamberDetail(el, chamber, analysis) {
  if (!el) return;
  if (!chamber) {
    el.innerHTML = `<p class="chamber-detail__hint">Click a chamber on the model or network patch</p>`;
    return;
  }

  const timbre = analysis?.timbre;
  el.innerHTML = `
    <h3 class="chamber-detail__title">${chamber.label ?? `Chamber ${chamber.id}`}</h3>
    <div class="chamber-detail__section">
      <div class="metric-row"><span>Frequency</span><span class="metric-value">${chamber.frequency?.toFixed(2) ?? "—"} Hz</span></div>
      <div class="metric-row"><span>Amplitude</span><span class="metric-value">${chamber.amplitude?.toFixed(3) ?? "—"}</span></div>
      <div class="metric-row"><span>Decay</span><span class="metric-value">${chamber.decay?.toFixed(3) ?? "—"}</span></div>
      <div class="metric-row"><span>Resonance</span><span class="metric-value">${chamber.resonance?.toFixed(3) ?? "—"}</span></div>
      <div class="metric-row"><span>Concavity</span><span class="metric-value">${chamber.concavity?.toFixed(3) ?? "—"}</span></div>
      <div class="metric-row"><span>Thickness</span><span class="metric-value">${chamber.thickness?.toFixed(3) ?? "—"}</span></div>
      <div class="metric-row"><span>Lump score</span><span class="metric-value">${chamber.lumpScore?.toFixed(3) ?? chamber.displacement?.toFixed(3) ?? "—"}</span></div>
      <div class="metric-row"><span>Chain index</span><span class="metric-value">${chamber.chainIndex ?? chamber.id}</span></div>
      <div class="metric-row"><span>Purity</span><span class="metric-value">${chamber.purity != null ? `${(chamber.purity * 100).toFixed(1)}%` : "—"}</span></div>
      <div class="metric-row"><span>Drift</span><span class="metric-value">${chamber.driftHz != null ? `${chamber.driftHz.toFixed(2)} Hz` : "—"}</span></div>
      <div class="metric-row"><span>Samples</span><span class="metric-value">${chamber.sampleCount ?? "—"}</span></div>
    </div>
    ${
      timbre
        ? `<div class="chamber-detail__section chamber-detail__global">
            <p class="chamber-detail__subtitle">Global timbre</p>
            <div class="metric-row"><span>Harmonic stack</span><span class="metric-value">${timbre.harmonicStack}</span></div>
            <div class="metric-row"><span>Purity</span><span class="metric-value">${(timbre.purity * 100).toFixed(1)}%</span></div>
            <div class="metric-row"><span>Modulation</span><span class="metric-value">${(timbre.modulation * 100).toFixed(1)}%</span></div>
          </div>`
        : ""
    }
  `;
}
