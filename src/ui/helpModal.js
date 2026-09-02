/**
 * About MUSGO — compact credit modal (displaced logo, version, repo).
 */

import { createMusgoLogo } from "../splash/musgoLogo.js";

const APP_VERSION = "0.1.0";
const REPO_URL = "https://github.com/rafaelbecks/musgo";
const ABOUT_LOGO_WIDTH = 168;

const CLOSE_ICON_SVG = `
<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18" />
  <line x1="6" y1="6" x2="18" y2="18" />
</svg>
`.trim();

export function createHelpModal(options) {
  return createAboutModal(options);
}

export function createAboutModal({
  buttonParent = document.querySelector("#tools-panel .panel-header"),
  showButton = false,
} = {}) {
  const hasButton = showButton && buttonParent;
  let btn = null;

  if (hasButton) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "about-btn";
    btn.className = "help-btn";
    btn.title = "About";
    btn.setAttribute("aria-label", "About");
    btn.innerHTML = `<ion-icon name="information-circle-outline"></ion-icon>`;
    buttonParent.appendChild(btn);
  }

  const year = new Date().getFullYear();
  const modal = document.createElement("div");
  modal.id = "about-modal";
  modal.className = "help-modal about-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "about-modal-title");
  modal.hidden = true;
  modal.innerHTML = `
    <div class="help-modal__content about-modal__content">
      <button type="button" class="help-modal__close about-modal__close" title="Close" aria-label="Close">
        ${CLOSE_ICON_SVG}
      </button>
      <div class="about-modal__body">
        <h2 id="about-modal-title" class="about-modal__title visually-hidden">MUSGO</h2>
        <canvas class="about-modal__logo" aria-hidden="true"></canvas>
        <p class="about-modal__meta">v${APP_VERSION} · ${year}</p>
        <a
          class="about-modal__repo"
          href="${REPO_URL}"
          target="_blank"
          rel="noopener noreferrer"
        >github.com/rafaelbecks/musgo</a>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const closeBtn = modal.querySelector(".help-modal__close");
  const logoCanvas = modal.querySelector(".about-modal__logo");
  const logo = createMusgoLogo(logoCanvas);
  logo.state.fitWidth = ABOUT_LOGO_WIDTH;
  let open = false;

  async function ensureLogo() {
    try {
      await logo.start();
    } catch (err) {
      console.error("[about] logo failed", err);
    }
  }

  function show() {
    open = true;
    modal.hidden = false;
    modal.classList.add("is-open");
    document.body.classList.add("help-modal-open");
    ensureLogo();
    closeBtn.focus();
  }

  function hide() {
    open = false;
    modal.classList.remove("is-open");
    modal.hidden = true;
    document.body.classList.remove("help-modal-open");
    logo.stop();
  }

  function onKeyDown(ev) {
    if (!open) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      hide();
    }
  }

  btn?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    show();
  });
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
      logo.destroy();
      btn?.remove();
      modal.remove();
      document.body.classList.remove("help-modal-open");
    },
  };
}
