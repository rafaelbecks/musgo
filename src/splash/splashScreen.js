import { createFernBackground } from "./fernBackground.js";
import { createMusgoLogo } from "./musgoLogo.js";
import {
  FERN_SIZE,
  FERN_MODULATION_HZ,
} from "./fernConfig.js";
import { LOGO_VIEWPORT_SCALE } from "./logoConfig.js";

/**
 * MUSGO splash / home screen.
 * Space → enter editor. Drop a .organism file → enter and load it.
 *
 * Fern tweaks (also on `window.MUSGO_SPLASH`):
 *   FERN_SIZE, FERN_MODULATION_HZ — see fernConfig.js
 */
export function createSplashScreen({
  onEnter,
  subtitle = "Morfogénesis de Unidades y Sistemas Generativos Orgánicos",
} = {}) {
  const root = document.createElement("section");
  root.id = "splash";
  root.setAttribute("aria-label", "MUSGO home");
  root.innerHTML = `
    <canvas id="splash-fern" aria-hidden="true"></canvas>
    <div id="splash-center">
      <canvas id="splash-logo" aria-label="MUSGO"></canvas>
      <h3 id="splash-subtitle">${subtitle}</h3>
    </div>
  `;

  document.body.classList.add("is-splash");
  document.body.appendChild(root);
  document.getElementById("app")?.setAttribute("hidden", "");

  const fernCanvas = root.querySelector("#splash-fern");
  const logoCanvas = root.querySelector("#splash-logo");
  const fern = createFernBackground(fernCanvas);
  const logo = createMusgoLogo(logoCanvas);

  let entered = false;
  let dragDepth = 0;

  // Expose tweakables for console / live adjustment
  const api = {
    get size() {
      return fern.state.size;
    },
    set size(v) {
      fern.state.size = Number(v);
    },
    get modulationHz() {
      return fern.state.modulationHz;
    },
    set modulationHz(v) {
      fern.state.modulationHz = Number(v);
    },
    get logoScale() {
      return logo.state.viewportScale;
    },
    set logoScale(v) {
      logo.state.viewportScale = Number(v);
      logo.resize();
    },
    get whiteOffsetX() {
      return logo.state.whiteOffsetX;
    },
    set whiteOffsetX(v) {
      logo.state.whiteOffsetX = Number(v);
      logo.resize();
    },
    get FERN_SIZE() {
      return api.size;
    },
    set FERN_SIZE(v) {
      api.size = v;
    },
    get FERN_MODULATION_HZ() {
      return api.modulationHz;
    },
    set FERN_MODULATION_HZ(v) {
      api.modulationHz = v;
    },
    get LOGO_VIEWPORT_SCALE() {
      return api.logoScale;
    },
    set LOGO_VIEWPORT_SCALE(v) {
      api.logoScale = v;
    },
    get WHITE_OFFSET_X() {
      return api.whiteOffsetX;
    },
    set WHITE_OFFSET_X(v) {
      api.whiteOffsetX = v;
    },
  };
  window.MUSGO_SPLASH = api;

  fern.state.size = FERN_SIZE;
  fern.state.modulationHz = FERN_MODULATION_HZ;
  logo.state.viewportScale = LOGO_VIEWPORT_SCALE;

  async function enter(file = null) {
    if (entered) return;
    entered = true;
    teardownListeners();
    fern.stop();
    logo.stop();
    destroy();
    await onEnter?.({ file });
  }

  function isOrganismFile(file) {
    if (!file) return false;
    const name = (file.name || "").toLowerCase();
    return name.endsWith(".organism") || name.endsWith(".json");
  }

  function onKeyDown(ev) {
    if (ev.code !== "Space" && ev.key !== " ") return;
    // Ignore repeat / modified
    if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    ev.preventDefault();
    enter(null);
  }

  function onDragEnter(ev) {
    ev.preventDefault();
    dragDepth += 1;
    root.classList.add("is-dragover");
  }

  function onDragLeave(ev) {
    ev.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) root.classList.remove("is-dragover");
  }

  function onDragOver(ev) {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
  }

  function onDrop(ev) {
    ev.preventDefault();
    dragDepth = 0;
    root.classList.remove("is-dragover");
    const file = ev.dataTransfer?.files?.[0];
    if (!isOrganismFile(file)) {
      window.alert("Drop a .organism file to open it.");
      return;
    }
    enter(file);
  }

  function teardownListeners() {
    window.removeEventListener("keydown", onKeyDown);
    root.removeEventListener("dragenter", onDragEnter);
    root.removeEventListener("dragleave", onDragLeave);
    root.removeEventListener("dragover", onDragOver);
    root.removeEventListener("drop", onDrop);
  }

  function destroy() {
    teardownListeners();
    fern.destroy();
    logo.destroy();
    root.remove();
    document.body.classList.remove("is-splash");
    if (window.MUSGO_SPLASH === api) delete window.MUSGO_SPLASH;
  }

  window.addEventListener("keydown", onKeyDown);
  root.addEventListener("dragenter", onDragEnter);
  root.addEventListener("dragleave", onDragLeave);
  root.addEventListener("dragover", onDragOver);
  root.addEventListener("drop", onDrop);

  fern.start();
  logo.start().catch((err) => console.error("[splash] logo failed", err));

  return { enter, destroy, api };
}
