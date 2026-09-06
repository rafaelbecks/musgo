import { createFernBackground } from "./fernBackground.js";
import { createMusgoLogo } from "./musgoLogo.js";
import {
  FERN_SIZE,
  FERN_MODULATION_HZ,
} from "./fernConfig.js";
import { LOGO_VIEWPORT_SCALE } from "./logoConfig.js";

/**
 * MUSGO splash / home screen.
 * Space / logo click → enter editor.
 * Drop / OS launch of `.organism` is handled in main.js (same as Glow).
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

  /**
   * @param {File | { file?: File | null, fileHandle?: FileSystemFileHandle | null } | null} payload
   */
  async function enter(payload = null) {
    if (entered) return;
    entered = true;

    let file = null;
    let fileHandle = null;
    if (payload instanceof File) {
      file = payload;
    } else if (payload && typeof payload === "object") {
      file = payload.file ?? null;
      fileHandle = payload.fileHandle ?? null;
    }

    teardownListeners();
    fern.stop();
    logo.stop();
    destroy();
    await onEnter?.({ file, fileHandle });
  }

  function onKeyDown(ev) {
    if (ev.code !== "Space" && ev.key !== " ") return;
    if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    ev.preventDefault();
    enter(null);
  }

  function onLogoClick(ev) {
    ev.preventDefault();
    enter(null);
  }

  function teardownListeners() {
    window.removeEventListener("keydown", onKeyDown);
    logoCanvas.removeEventListener("click", onLogoClick);
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
  logoCanvas.addEventListener("click", onLogoClick);

  fern.start();
  logo.start().catch((err) => console.error("[splash] logo failed", err));

  return { enter, destroy, api };
}
