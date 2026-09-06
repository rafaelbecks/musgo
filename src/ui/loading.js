const LABELS = {
  model: "Cargando modelo",
  environment: "Cargando entorno",
};

export function createLoading() {
  const root = document.getElementById("loading");
  const labelEl = root?.querySelector(".loading-label");
  const barEl = root?.querySelector(".loading-bar");
  const trackEl = root?.querySelector(".loading-track");

  const stack = [];
  let progress = null;

  function render() {
    if (!root || !labelEl || !barEl) return;
    const type = stack.length ? stack[stack.length - 1] : null;
    if (!type) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    labelEl.textContent = LABELS[type] ?? "Loading";

    if (progress == null || !Number.isFinite(progress)) {
      barEl.classList.add("loading-bar--indeterminate");
      barEl.style.width = "";
      trackEl?.setAttribute("aria-valuenow", "");
    } else {
      barEl.classList.remove("loading-bar--indeterminate");
      const pct = Math.max(0, Math.min(1, progress)) * 100;
      barEl.style.width = `${pct}%`;
      trackEl?.setAttribute("aria-valuenow", String(Math.round(pct)));
    }
  }

  return {
    begin(type) {
      stack.push(type);
      progress = null;
      render();
    },
    end(type) {
      const i = stack.lastIndexOf(type);
      if (i !== -1) stack.splice(i, 1);
      progress = null;
      render();
    },
    setProgress(value) {
      if (stack.length === 0) return;
      progress = value;
      render();
    },
  };
}
