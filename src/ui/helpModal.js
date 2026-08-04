/**
 * Help modal — loads README.md and renders markdown (GLOW-style info panel).
 */

const HELP_MARKDOWN_URL = "./README.md";

const HELP_ICON_SVG = `
<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="9" />
  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
  <line x1="12" y1="17" x2="12.01" y2="17" />
</svg>
`.trim();

const CLOSE_ICON_SVG = `
<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18" />
  <line x1="6" y1="6" x2="18" y2="18" />
</svg>
`.trim();

export function createHelpModal({
  buttonParent = document.querySelector("#tools-panel .panel-header"),
} = {}) {
  if (!buttonParent) return { open() {}, close() {}, destroy() {} };

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "help-btn";
  btn.className = "help-btn";
  btn.title = "Help";
  btn.setAttribute("aria-label", "Help");
  btn.innerHTML = HELP_ICON_SVG;
  buttonParent.appendChild(btn);

  const modal = document.createElement("div");
  modal.id = "help-modal";
  modal.className = "help-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "help-modal-title");
  modal.hidden = true;
  modal.innerHTML = `
    <div class="help-modal__content">
      <header class="help-modal__header">
        <h2 id="help-modal-title">MUSGO</h2>
        <button type="button" class="help-modal__close" title="Close" aria-label="Close">
          ${CLOSE_ICON_SVG}
        </button>
      </header>
      <div class="help-modal__body" id="help-modal-body">
        <p class="help-modal__loading">Loading…</p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const bodyEl = modal.querySelector("#help-modal-body");
  const closeBtn = modal.querySelector(".help-modal__close");
  let loaded = false;
  let open = false;

  async function loadContent() {
    if (loaded) return;
    bodyEl.innerHTML = `<p class="help-modal__loading">Loading…</p>`;
    try {
      const [{ marked }, response] = await Promise.all([
        import("https://esm.sh/marked@15.0.7"),
        fetch(HELP_MARKDOWN_URL),
      ]);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const markdown = await response.text();
      bodyEl.innerHTML = marked.parse(markdown);
      // Keep relative media working from site root
      bodyEl.querySelectorAll("img").forEach((img) => {
        const src = img.getAttribute("src");
        if (src && src.startsWith("./")) {
          img.setAttribute("src", src.slice(2));
        }
      });
      loaded = true;
    } catch (err) {
      console.error("[help] failed to load README", err);
      bodyEl.innerHTML = `<p>Couldn’t load help. Open <a href="./README.md" target="_blank" rel="noreferrer">README.md</a> instead.</p>`;
    }
  }

  function show() {
    open = true;
    modal.hidden = false;
    modal.classList.add("is-open");
    document.body.classList.add("help-modal-open");
    loadContent();
    closeBtn.focus();
  }

  function hide() {
    open = false;
    modal.classList.remove("is-open");
    modal.hidden = true;
    document.body.classList.remove("help-modal-open");
  }

  function onKeyDown(ev) {
    if (!open) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      hide();
    }
  }

  btn.addEventListener("click", (ev) => {
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
      btn.remove();
      modal.remove();
      document.body.classList.remove("help-modal-open");
    },
  };
}
