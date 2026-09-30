/**
 * Moment list — jump back to any of the last 20 organism snapshots.
 */

import {
  commitOrganismHistoryNow,
  getOrganismHistory,
  restoreOrganismHistoryId,
  subscribeOrganismHistory,
} from "../morphogenesis/organismHistory.js";

const CLOSE_ICON_SVG = `
<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18" />
  <line x1="6" y1="6" x2="18" y2="18" />
</svg>
`.trim();

function formatHistoryTime(at) {
  const date = new Date(at);
  const time = date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (date.toDateString() === new Date().toDateString()) return time;
  const day = date.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
  return `${day} ${time}`;
}

export function createHistoryModal() {
  const modal = document.createElement("div");
  modal.id = "history-modal";
  modal.className = "help-modal history-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "history-modal-title");
  modal.hidden = true;
  modal.innerHTML = `
    <div class="help-modal__content history-modal__content">
      <header class="help-modal__header">
        <h2 id="history-modal-title">Historial</h2>
        <button type="button" class="help-modal__close" title="Cerrar" aria-label="Cerrar">
          ${CLOSE_ICON_SVG}
        </button>
      </header>
      <div class="help-modal__body history-modal__body">
        <p class="history-modal__intro" id="history-modal-intro"></p>
        <div id="history-modal-list"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const introEl = modal.querySelector("#history-modal-intro");
  const listEl = modal.querySelector("#history-modal-list");
  const closeBtn = modal.querySelector(".help-modal__close");
  let isOpen = false;

  function render() {
    const history = getOrganismHistory();
    const count = history.entries.length;
    introEl.textContent = count
      ? `${count} de ${history.limit} momentos. Elige uno para volver a ese estado.`
      : "Todavía no hay momentos.";

    if (!count) {
      listEl.innerHTML = `<p class="history-modal__empty">Los cambios del espécimen van a aparecer acá.</p>`;
      return;
    }

    const list = document.createElement("ul");
    list.className = "history-modal__list";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Momentos");

    const ordered = history.entries.slice().reverse();
    for (const entry of ordered) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history-modal__item";
      btn.setAttribute("role", "option");
      btn.dataset.historyId = entry.id;
      if (entry.current) {
        btn.classList.add("is-current");
        btn.setAttribute("aria-selected", "true");
      } else {
        btn.setAttribute("aria-selected", "false");
      }
      btn.innerHTML = `
        <span class="history-modal__time">${formatHistoryTime(entry.at)}</span>
        <span class="history-modal__label"></span>
        ${entry.current ? `<span class="history-modal__badge">actual</span>` : `<span class="history-modal__badge" hidden></span>`}
      `;
      btn.querySelector(".history-modal__label").textContent = entry.label;
      btn.addEventListener("click", () => {
        void restoreOrganismHistoryId(entry.id);
      });
      li.appendChild(btn);
      list.appendChild(li);
    }

    listEl.replaceChildren(list);
    list.querySelector(".is-current")?.scrollIntoView({ block: "nearest" });
  }

  function show() {
    isOpen = true;
    modal.hidden = false;
    modal.classList.add("is-open");
    commitOrganismHistoryNow();
    render();
    closeBtn.focus();
  }

  function hide() {
    isOpen = false;
    modal.classList.remove("is-open");
    modal.hidden = true;
  }

  function onKeyDown(ev) {
    if (!isOpen || ev.key !== "Escape") return;
    ev.preventDefault();
    hide();
  }

  closeBtn.addEventListener("click", hide);
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) hide();
  });
  window.addEventListener("keydown", onKeyDown);
  const unsubscribe = subscribeOrganismHistory(() => {
    if (isOpen) render();
  });

  return {
    open: show,
    close: hide,
    sync() {
      if (isOpen) render();
    },
    destroy() {
      unsubscribe();
      window.removeEventListener("keydown", onKeyDown);
      modal.remove();
    },
  };
}
