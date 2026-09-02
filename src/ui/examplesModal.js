/**
 * Examples modal — list + load .organism files from ./examples/
 */

const EXAMPLES_INDEX_URL = "./examples/index.json";
const EXAMPLES_BASE = "./examples/";

const CLOSE_ICON_SVG = `
<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18" />
  <line x1="6" y1="6" x2="18" y2="18" />
</svg>
`.trim();

function displayName(filename) {
  return filename
    .replace(/\.organism$/i, "")
    .replace(/^spec-/, "")
    .replace(/-/g, " ");
}

export function createExamplesModal({
  buttonParent = document.querySelector("#viewer-panel .panel-header"),
  showButton = true,
  onSelectExample,
} = {}) {
  const hasButton = showButton && buttonParent;
  let btn = null;

  if (hasButton) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "examples-btn";
    btn.className = "examples-btn";
    btn.title = "Examples";
    btn.setAttribute("aria-label", "Examples");
    btn.innerHTML = `<ion-icon name="bug-outline"></ion-icon>`;
    buttonParent.appendChild(btn);
  } else if (!onSelectExample) {
    return { open() {}, close() {}, destroy() {} };
  }

  const modal = document.createElement("div");
  modal.id = "examples-modal";
  modal.className = "help-modal examples-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "examples-modal-title");
  modal.hidden = true;
  modal.innerHTML = `
    <div class="help-modal__content examples-modal__content">
      <header class="help-modal__header">
        <h2 id="examples-modal-title">Examples</h2>
        <button type="button" class="help-modal__close" title="Close" aria-label="Close">
          ${CLOSE_ICON_SVG}
        </button>
      </header>
      <div class="help-modal__body examples-modal__body" id="examples-modal-body">
        <p class="help-modal__loading">Loading…</p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const bodyEl = modal.querySelector("#examples-modal-body");
  const closeBtn = modal.querySelector(".help-modal__close");
  let loaded = false;
  let isOpen = false;

  async function loadList() {
    if (loaded) return;
    bodyEl.innerHTML = `<p class="help-modal__loading">Loading…</p>`;
    try {
      const response = await fetch(EXAMPLES_INDEX_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const files = await response.json();
      if (!Array.isArray(files) || files.length === 0) {
        bodyEl.innerHTML = `<p>No examples found.</p>`;
        loaded = true;
        return;
      }

      const sorted = [...files].sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { sensitivity: "base" })
      );

      const list = document.createElement("ul");
      list.className = "examples-modal__list";
      for (const name of sorted) {
        const li = document.createElement("li");
        const itemBtn = document.createElement("button");
        itemBtn.type = "button";
        itemBtn.className = "examples-modal__item";
        itemBtn.dataset.file = name;
        itemBtn.innerHTML = `
          <span class="examples-modal__item-name">${displayName(name)}</span>
          <span class="examples-modal__item-file">${name}</span>
        `;
        itemBtn.addEventListener("click", () => selectExample(name));
        li.appendChild(itemBtn);
        list.appendChild(li);
      }
      bodyEl.replaceChildren(list);
      loaded = true;
    } catch (err) {
      console.error("[examples] failed to load index", err);
      bodyEl.innerHTML = `<p>Couldn’t load examples list.</p>`;
    }
  }

  async function selectExample(filename) {
    hide();
    try {
      const response = await fetch(`${EXAMPLES_BASE}${encodeURIComponent(filename)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: "application/json" });
      await onSelectExample?.(file);
    } catch (err) {
      console.error("[examples] failed to open", filename, err);
      window.alert(err?.message || `Failed to open ${filename}`);
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
      btn?.remove();
      modal.remove();
    },
  };
}
