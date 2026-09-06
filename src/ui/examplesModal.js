/**
 * Examples modal — list + load .organism files from ./examples/
 */

import * as THREE from "three";
import { HTMLMesh } from "three/addons/interactive/HTMLMesh.js";
import { InteractiveGroup } from "three/addons/interactive/InteractiveGroup.js";

const EXAMPLES_INDEX_URL = "./examples/index.json";
const EXAMPLES_BASE = "./examples/";

/** Keep these at the top of the list (order preserved from index.json). */
export const PINNED_EXAMPLES = [
  "mandibula-dorada.organism",
  "mandibula-plateada.organism",
  "craneo-morado.organism",
  "craneo-dorado.organism",
];

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
  getVrContext,
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
    return { open() {}, close() {}, destroy() {}, isOpen: () => false };
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

  const contentEl = modal.querySelector(".examples-modal__content");
  const bodyEl = modal.querySelector("#examples-modal-body");
  const closeBtn = modal.querySelector(".help-modal__close");
  let loaded = false;
  let isOpen = false;
  let vrLayout = false;

  /** @type {{ group: import("three").Group, mesh: HTMLMesh } | null} */
  let vrPanel = null;

  function orderExamples(files) {
    const pinnedSet = new Set(PINNED_EXAMPLES);
    const pinned = PINNED_EXAMPLES.filter((name) => files.includes(name));
    const rest = files
      .filter((name) => !pinnedSet.has(name))
      .sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { sensitivity: "base" })
      );
    return [...pinned, ...rest];
  }

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

      const ordered = orderExamples(files.map(String));

      const list = document.createElement("ul");
      list.className = "examples-modal__list";
      for (const name of ordered) {
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

  function destroyVrPanel() {
    if (!vrPanel) return;
    vrPanel.group.parent?.remove(vrPanel.group);
    vrPanel.mesh.dispose?.();
    vrPanel = null;
  }

  function syncVrPanel() {
    const ctx = getVrContext?.();
    const presenting = Boolean(ctx?.isPresenting?.());
    if (!isOpen || !vrLayout || !presenting || !ctx?.scene || !ctx?.renderer) {
      destroyVrPanel();
      return;
    }

    if (!vrPanel) {
      const group = new InteractiveGroup();
      group.listenToPointerEvents(ctx.renderer, ctx.camera);
      if (ctx.controller0) group.listenToXRControllerEvents(ctx.controller0);
      if (ctx.controller1) group.listenToXRControllerEvents(ctx.controller1);
      ctx.scene.add(group);

      const mesh = new HTMLMesh(contentEl);
      mesh.name = "examples-html-mesh";
      group.add(mesh);
      vrPanel = { group, mesh };
    }

    // Float the panel in front of the headset / orbit rig.
    const rig = ctx.rig;
    const anchor = rig ?? ctx.camera;
    anchor.updateWorldMatrix?.(true);
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    anchor.getWorldPosition(worldPos);
    anchor.getWorldQuaternion(worldQuat);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuat);
    vrPanel.group.position.copy(worldPos).addScaledVector(forward, 1.15);
    vrPanel.group.position.y += 0.05;
    vrPanel.group.quaternion.copy(worldQuat);
    vrPanel.mesh.scale.setScalar(1.35);
  }

  async function show({ vr = false } = {}) {
    isOpen = true;
    vrLayout = Boolean(vr);
    modal.hidden = false;
    modal.classList.add("is-open");
    modal.classList.toggle("is-vr", vrLayout);
    loaded = false;
    await loadList();
    // Let layout settle so HTMLMesh can sample real dimensions.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    syncVrPanel();
    if (!vrLayout) closeBtn.focus();
  }

  function hide() {
    isOpen = false;
    vrLayout = false;
    modal.classList.remove("is-open", "is-vr");
    modal.hidden = true;
    destroyVrPanel();
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
    isOpen: () => isOpen,
    /** Keep the in-world HTML panel posed while VR orbiting. */
    updateVrPanel: syncVrPanel,
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      destroyVrPanel();
      btn?.remove();
      modal.remove();
    },
  };
}
