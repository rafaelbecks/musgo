const STORAGE_KEY = "resonant-torus-panel-sizes";

const LIMITS = {
  toolsWidth: { min: 280, max: 720 },
  acousticsHeight: { min: 120, minViewer: 160 },
};

const COLLAPSED_ACOUSTICS_HEIGHT = 44; // matches --header-h

function getAppHeight() {
  return document.getElementById("app")?.clientHeight ?? window.innerHeight;
}

function acousticsMaxHeight() {
  return Math.max(LIMITS.acousticsHeight.min + 80, getAppHeight() - LIMITS.acousticsHeight.minViewer);
}

function readAcousticsHeight() {
  const panel = document.getElementById("acoustics-panel");
  if (panel) {
    const measured = panel.getBoundingClientRect().height;
    if (measured > 0) return measured;
  }
  return readPxVar("--acoustics-height");
}

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveSizes(sizes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
  } catch {
    // ignore quota / private mode
  }
}

function readPxVar(name) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return parseFloat(value) || 0;
}

function setPxVar(name, px) {
  document.documentElement.style.setProperty(name, `${Math.round(px)}px`);
}

function clampAcousticsHeight(px) {
  const min = LIMITS.acousticsHeight.min;
  const max = acousticsMaxHeight();
  return Math.min(max, Math.max(min, px));
}

function beginDrag({ cursor, onMove, onEnd }) {
  const prevCursor = document.body.style.cursor;
  const prevSelect = document.body.style.userSelect;
  document.body.style.cursor = cursor;
  document.body.style.userSelect = "none";

  const move = (ev) => onMove(ev);
  const end = (ev) => {
    document.body.style.cursor = prevCursor;
    document.body.style.userSelect = prevSelect;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    onEnd?.(ev);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function setupWidthResize(handle, { onResize } = {}) {
  const { min, max } = LIMITS.toolsWidth;

  handle.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    handle.setPointerCapture(ev.pointerId);
    handle.classList.add("is-dragging");

    const startX = ev.clientX;
    const startWidth = readPxVar("--tools-width");

    beginDrag({
      cursor: "ew-resize",
      onMove: (moveEv) => {
        const next = Math.min(max, Math.max(min, startWidth + (startX - moveEv.clientX)));
        setPxVar("--tools-width", next);
        onResize?.();
      },
      onEnd: () => {
        handle.classList.remove("is-dragging");
        handle.releasePointerCapture(ev.pointerId);
        saveSizes({ ...loadSaved(), toolsWidth: readPxVar("--tools-width") });
      },
    });
  });
}

function setupHeightResize(handle, { onResize, isCollapsed } = {}) {
  handle.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    if (isCollapsed?.()) return;
    ev.preventDefault();
    handle.setPointerCapture(ev.pointerId);
    handle.classList.add("is-dragging");

    const startY = ev.clientY;
    const startHeight = readAcousticsHeight();
    const { min } = LIMITS.acousticsHeight;

    beginDrag({
      cursor: "ns-resize",
      onMove: (moveEv) => {
        const delta = startY - moveEv.clientY;
        const next = clampAcousticsHeight(startHeight + delta);
        setPxVar("--acoustics-height", Math.min(acousticsMaxHeight(), Math.max(min, next)));
        onResize?.();
      },
      onEnd: () => {
        handle.classList.remove("is-dragging");
        handle.releasePointerCapture(ev.pointerId);
        saveSizes({
          ...loadSaved(),
          acousticsHeight: clampAcousticsHeight(readAcousticsHeight()),
        });
      },
    });
  });
}

function setupAcousticsCollapse({ onResize, defaultCollapsed = true } = {}) {
  const panel = document.getElementById("acoustics-panel");
  const btn = document.getElementById("acoustics-collapse-btn");
  if (!panel || !btn) {
    return {
      isCollapsed: () => false,
      setCollapsed: () => {},
      toggle: () => false,
    };
  }

  let collapsed = false;
  let expandedHeight = clampAcousticsHeight(
    loadSaved().acousticsHeight || readPxVar("--acoustics-height") || 260
  );

  function applyCollapsed(nextCollapsed, { persist = true } = {}) {
    collapsed = nextCollapsed;
    panel.classList.toggle("is-collapsed", collapsed);

    if (collapsed) {
      const current = readAcousticsHeight();
      if (current > COLLAPSED_ACOUSTICS_HEIGHT + 8) {
        expandedHeight = clampAcousticsHeight(current);
      }
      const header = panel.querySelector(".panel-header--acoustics");
      const headerH = Math.ceil(header?.getBoundingClientRect().height || COLLAPSED_ACOUSTICS_HEIGHT);
      setPxVar("--acoustics-height", Math.max(COLLAPSED_ACOUSTICS_HEIGHT, headerH));
      btn.textContent = "+";
      btn.setAttribute("aria-label", "Expand acoustics panel");
      btn.setAttribute("aria-expanded", "false");
      btn.title = "Expand (⌘K)";
    } else {
      setPxVar("--acoustics-height", clampAcousticsHeight(expandedHeight));
      btn.textContent = "−";
      btn.setAttribute("aria-label", "Collapse acoustics panel");
      btn.setAttribute("aria-expanded", "true");
      btn.title = "Collapse (⌘K)";
    }

    if (persist) {
      saveSizes({
        ...loadSaved(),
        acousticsCollapsed: collapsed,
        acousticsHeight: collapsed
          ? expandedHeight
          : clampAcousticsHeight(readAcousticsHeight()),
      });
    }

    onResize?.();
  }

  btn.addEventListener("click", () => {
    applyCollapsed(!collapsed);
  });

  const saved = loadSaved();
  // Morphogenesis-first: always start with the acoustics strip collapsed.
  // Preference is still persisted when the user toggles (click or ⌘K).
  if (defaultCollapsed || saved.acousticsCollapsed) {
    applyCollapsed(true, { persist: false });
  }

  return {
    isCollapsed: () => collapsed,
    setCollapsed: (value, opts) => applyCollapsed(Boolean(value), opts),
    toggle: () => {
      applyCollapsed(!collapsed);
      return collapsed;
    },
  };
}

export function initPanelResize({ onResize } = {}) {
  const saved = loadSaved();
  if (saved.toolsWidth) {
    setPxVar("--tools-width", Math.min(LIMITS.toolsWidth.max, Math.max(LIMITS.toolsWidth.min, saved.toolsWidth)));
  }
  if (saved.acousticsHeight && !saved.acousticsCollapsed) {
    setPxVar("--acoustics-height", clampAcousticsHeight(saved.acousticsHeight));
  }

  const toolsHandle = document.getElementById("tools-resize-handle");
  const acousticsHandle = document.getElementById("acoustics-resize-handle");

  const acousticsCollapse = setupAcousticsCollapse({
    onResize,
    defaultCollapsed: true,
  });

  if (toolsHandle) setupWidthResize(toolsHandle, { onResize });
  if (acousticsHandle) {
    setupHeightResize(acousticsHandle, {
      onResize,
      isCollapsed: acousticsCollapse.isCollapsed,
    });
  }

  window.addEventListener("resize", () => {
    if (!acousticsCollapse.isCollapsed()) {
      setPxVar("--acoustics-height", clampAcousticsHeight(readAcousticsHeight()));
    }
    onResize?.();
  });

  return {
    toggleAcousticsPanel: () => acousticsCollapse.toggle(),
    setAcousticsCollapsed: (value) => acousticsCollapse.setCollapsed(value),
    isAcousticsCollapsed: () => acousticsCollapse.isCollapsed(),
  };
}
