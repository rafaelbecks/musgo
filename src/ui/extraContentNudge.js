/**
 * Bottom-left first-run nudge: "Descargar contenidos extra"
 * Dismissed state persists in localStorage.
 */

import {
  anyOptionalLibraryMissing,
  isDesktopContentMode,
  refreshContentAvailability,
  subscribeContentAvailability,
} from "./contentAvailability.js";
import { getContentPackModal } from "./contentPackModal.js";

const STORAGE_KEY = "musgo.extraContentNudgeDismissed";

export function createExtraContentNudge() {
  if (localStorage.getItem(STORAGE_KEY) === "1") {
    return { destroy() {} };
  }

  const el = document.createElement("aside");
  el.id = "extra-content-nudge";
  el.className = "extra-content-nudge";
  el.hidden = true;
  el.innerHTML = `
    <div class="extra-content-nudge__inner">
      <button type="button" class="extra-content-nudge__action" id="extra-content-nudge-open">
        Descargar contenidos extra
      </button>
      <button type="button" class="extra-content-nudge__close" title="Cerrar" aria-label="Cerrar">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  `;
  document.body.appendChild(el);

  const openBtn = el.querySelector("#extra-content-nudge-open");
  const closeBtn = el.querySelector(".extra-content-nudge__close");

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    el.hidden = true;
  }

  function syncVisibility() {
    if (localStorage.getItem(STORAGE_KEY) === "1") {
      el.hidden = true;
      return;
    }
    el.hidden = !(isDesktopContentMode() && anyOptionalLibraryMissing());
  }

  openBtn.addEventListener("click", async () => {
    await getContentPackModal().open();
    syncVisibility();
  });
  closeBtn.addEventListener("click", dismiss);

  const unsub = subscribeContentAvailability(syncVisibility);
  refreshContentAvailability().then(syncVisibility);

  return {
    destroy() {
      unsub();
      el.remove();
    },
  };
}
