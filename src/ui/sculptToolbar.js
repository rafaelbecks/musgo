import * as THREE from "three";
import { applySculptStroke } from "../morphogenesis/sculptEngine.js";
import { commitOrganismHistoryNow } from "../morphogenesis/organismHistory.js";
import { syncOrganismDirty } from "../morphogenesis/organismState.js";

const TOOLS = [
  {
    id: "select",
    label: "Select",
    icon: null,
    cursor: null,
    sculpt: false,
  },
  {
    id: "add",
    label: "Add",
    icon: "add-circle-outline",
    cursor: 'url("./assets/cursor-sculpt-add.svg") 12 12, crosshair',
    sculpt: true,
    color: 0x4a90e2,
  },
  {
    id: "subtract",
    label: "Subtract",
    icon: "remove-circle-outline",
    cursor: 'url("./assets/cursor-sculpt-subtract.svg") 12 12, crosshair',
    sculpt: true,
    color: 0xe24a4a,
  },
  {
    id: "push",
    label: "Push",
    icon: "expand-outline",
    cursor: 'url("./assets/cursor-sculpt-push.svg") 12 12, crosshair',
    sculpt: true,
    color: 0xe2a44a,
  },
];

const DEFAULT_CURSOR = 'url("./assets/cursor.svg") 4 4, auto';

/**
 * Floating left sculpt toolbar + mesh brush interaction.
 */
export function createSculptToolbar({
  mount,
  camera,
  scene,
  controls,
  domElement,
  morphSystem,
  getMesh = () => morphSystem.getAnalysisMesh(),
}) {
  const root = document.createElement("div");
  root.className = "sculpt-toolbar";
  root.setAttribute("role", "toolbar");
  root.setAttribute("aria-label", "Sculpt tools");
  mount.appendChild(root);

  const state = {
    visible: true,
    tool: "select",
    brushSize: 0.45,
    brushStrength: 0.55,
    symmetry: { x: false, y: false, z: false },
  };

  let painting = false;
  let strokeModified = false;
  let invertStroke = false;
  let hasPrevHit = false;
  let raf = 0;
  let pendingPointer = null;

  const pointerNdc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const localHit = new THREE.Vector3();
  const prevLocalHit = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const worldPoint = new THREE.Vector3();
  const invMatrix = new THREE.Matrix4();
  const ringQuat = new THREE.Quaternion();
  const zUp = new THREE.Vector3(0, 0, 1);
  const clickLocal = new THREE.Vector3();
  const prevLocalCopy = new THREE.Vector3();

  const brushRing = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1, 48, 1),
    new THREE.MeshBasicMaterial({
      color: 0x4a90e2,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthTest: false,
    })
  );
  brushRing.renderOrder = 1000;
  brushRing.visible = false;
  scene.add(brushRing);

  const brushDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.04, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthTest: false,
    })
  );
  brushDot.renderOrder = 1001;
  brushDot.visible = false;
  scene.add(brushDot);

  function currentToolDef() {
    return TOOLS.find((t) => t.id === state.tool) ?? TOOLS[0];
  }

  function isSculpting() {
    return currentToolDef().sculpt;
  }

  function applyCursor() {
    const def = currentToolDef();
    document.documentElement.style.setProperty("--cursor", def.cursor || DEFAULT_CURSOR);
  }

  function syncOrbitForTool() {
    if (!controls) return;
    controls.mouseButtons.LEFT = isSculpting() ? -1 : THREE.MOUSE.ROTATE;
  }

  function worldBrushRadius() {
    const mesh = getMesh();
    if (!mesh?.geometry) return state.brushSize;
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const radius = mesh.geometry.boundingSphere?.radius ?? 1;
    const scale = mesh.scale.x || 1;
    return Math.max(1e-4, radius * scale * state.brushSize);
  }

  function localBrushRadius(mesh) {
    return worldBrushRadius() / Math.max(1e-6, mesh.scale.x || 1);
  }

  function updateBrushGeometry() {
    const outer = worldBrushRadius();
    brushRing.geometry.dispose();
    brushRing.geometry = new THREE.RingGeometry(outer * 0.92, outer, 48, 1);
    brushDot.geometry.dispose();
    brushDot.geometry = new THREE.CircleGeometry(Math.max(outer * 0.03, 0.008), 16);
  }

  function setBrushVisible(visible) {
    brushRing.visible = visible;
    brushDot.visible = visible;
  }

  function paintHit(clientX, clientY, { deform = false } = {}) {
    const mesh = getMesh();
    if (!mesh || !isSculpting()) {
      setBrushVisible(false);
      return null;
    }

    const rect = domElement.getBoundingClientRect();
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObject(mesh, false);
    if (!hits.length) {
      setBrushVisible(false);
      return null;
    }

    const hit = hits[0];
    const def = currentToolDef();
    brushRing.material.color.setHex(def.color ?? 0x4a90e2);

    worldNormal.copy(hit.face?.normal || zUp);
    worldNormal.transformDirection(mesh.matrixWorld).normalize();
    worldPoint.copy(hit.point).addScaledVector(worldNormal, 0.01);
    brushRing.position.copy(worldPoint);
    brushDot.position.copy(worldPoint);
    ringQuat.setFromUnitVectors(zUp, worldNormal);
    brushRing.quaternion.copy(ringQuat);
    brushDot.quaternion.copy(ringQuat);
    setBrushVisible(true);

    if (!deform) return hit;

    invMatrix.copy(mesh.matrixWorld).invert();
    localHit.copy(hit.point).applyMatrix4(invMatrix);
    clickLocal.copy(localHit);
    const brushLocal = localBrushRadius(mesh);
    const previousPoint =
      hasPrevHit && state.tool === "push" ? prevLocalCopy.copy(prevLocalHit) : null;

    const modified = morphSystem.sculptBase(({ basePositions, normals }) =>
      applySculptStroke({
        basePositions,
        normals,
        clickPoint: clickLocal,
        tool: state.tool,
        brushSize: brushLocal,
        brushStrength: state.brushStrength,
        symmetryAxes: state.symmetry,
        previousPoint,
        invert: invertStroke,
      })
    );

    if (modified) strokeModified = true;
    prevLocalHit.copy(localHit);
    hasPrevHit = true;
    return hit;
  }

  function flushPointer() {
    raf = 0;
    if (!pendingPointer) return;
    const { x, y, deform } = pendingPointer;
    pendingPointer = null;
    paintHit(x, y, { deform });
  }

  function queuePointer(clientX, clientY, deform) {
    pendingPointer = { x: clientX, y: clientY, deform };
    if (!raf) raf = requestAnimationFrame(flushPointer);
  }

  function endStroke() {
    if (!painting) return;
    painting = false;
    hasPrevHit = false;
    if (strokeModified) {
      morphSystem.bumpSculptRevision();
      syncOrganismDirty();
      commitOrganismHistoryNow();
      strokeModified = false;
    }
  }

  const toolsRow = document.createElement("div");
  toolsRow.className = "sculpt-toolbar__tools";
  root.appendChild(toolsRow);

  const toolButtons = new Map();

  for (const tool of TOOLS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sculpt-toolbar__btn";
    btn.dataset.tool = tool.id;
    btn.dataset.tooltip = tool.label;
    btn.setAttribute("aria-label", tool.label);
    btn.setAttribute("aria-pressed", tool.id === state.tool ? "true" : "false");
    if (tool.id === "select") {
      btn.innerHTML = `<img class="sculpt-toolbar__cursor-icon" src="./assets/cursor.svg" alt="" aria-hidden="true" />`;
    } else {
      btn.innerHTML = `<ion-icon name="${tool.icon}" aria-hidden="true"></ion-icon>`;
    }
    btn.addEventListener("click", () => setTool(tool.id));
    toolsRow.appendChild(btn);
    toolButtons.set(tool.id, btn);
  }

  const controlsPanel = document.createElement("div");
  controlsPanel.className = "sculpt-toolbar__controls";
  root.appendChild(controlsPanel);

  function makeSlider({ label, icon, min, max, step, value, onChange, format }) {
    const wrap = document.createElement("label");
    wrap.className = "sculpt-toolbar__slider";
    wrap.innerHTML = `
      <span class="sculpt-toolbar__slider-head">
        <ion-icon name="${icon}" aria-hidden="true"></ion-icon>
        <span class="sculpt-toolbar__slider-label">${label}</span>
        <span class="sculpt-toolbar__slider-value"></span>
      </span>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" />
    `;
    const input = wrap.querySelector("input");
    const valueEl = wrap.querySelector(".sculpt-toolbar__slider-value");
    const refresh = () => {
      valueEl.textContent = format(Number(input.value));
    };
    refresh();
    input.addEventListener("input", () => {
      onChange(Number(input.value));
      refresh();
    });
    return { wrap, input, refresh };
  }

  const sizeSlider = makeSlider({
    label: "Size",
    icon: "radio-button-off-outline",
    min: 0.05,
    max: 1.2,
    step: 0.01,
    value: state.brushSize,
    format: (v) => v.toFixed(2),
    onChange: (v) => {
      state.brushSize = v;
      updateBrushGeometry();
    },
  });
  controlsPanel.appendChild(sizeSlider.wrap);

  const strengthSlider = makeSlider({
    label: "Strength",
    icon: "flash-outline",
    min: 0.05,
    max: 1,
    step: 0.01,
    value: state.brushStrength,
    format: (v) => `${Math.round(v * 100)}%`,
    onChange: (v) => {
      state.brushStrength = v;
    },
  });
  controlsPanel.appendChild(strengthSlider.wrap);

  const symWrap = document.createElement("div");
  symWrap.className = "sculpt-toolbar__symmetry";
  symWrap.innerHTML = `<span class="sculpt-toolbar__sym-label"><ion-icon name="git-compare-outline" aria-hidden="true"></ion-icon> Symmetry</span>`;
  const symBtns = document.createElement("div");
  symBtns.className = "sculpt-toolbar__sym-btns";
  for (const axis of ["x", "y", "z"]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sculpt-toolbar__sym-btn";
    btn.dataset.axis = axis;
    btn.textContent = axis.toUpperCase();
    btn.title = `Mirror on ${axis.toUpperCase()}`;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => {
      state.symmetry[axis] = !state.symmetry[axis];
      btn.classList.toggle("is-active", state.symmetry[axis]);
      btn.setAttribute("aria-pressed", state.symmetry[axis] ? "true" : "false");
    });
    symBtns.appendChild(btn);
  }
  symWrap.appendChild(symBtns);
  controlsPanel.appendChild(symWrap);

  function syncControlsVisibility() {
    controlsPanel.hidden = !isSculpting();
  }

  function setTool(id) {
    if (!TOOLS.some((t) => t.id === id)) return;
    state.tool = id;
    for (const [toolId, btn] of toolButtons) {
      const active = toolId === id;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
    applyCursor();
    syncOrbitForTool();
    syncControlsVisibility();
    if (!isSculpting()) setBrushVisible(false);
    updateBrushGeometry();
  }

  function setVisible(next) {
    state.visible = Boolean(next);
    root.hidden = !state.visible;
    root.setAttribute("aria-hidden", state.visible ? "false" : "true");
    if (!state.visible) {
      endStroke();
      setBrushVisible(false);
      document.documentElement.style.setProperty("--cursor", DEFAULT_CURSOR);
      if (controls) controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    } else {
      applyCursor();
      syncOrbitForTool();
    }
  }

  function onPointerDown(ev) {
    if (!state.visible || !isSculpting()) return;
    if (ev.button !== 0) return;
    if (ev.target !== domElement) return;
    painting = true;
    strokeModified = false;
    hasPrevHit = false;
    invertStroke = ev.shiftKey;
    paintHit(ev.clientX, ev.clientY, { deform: true });
    ev.preventDefault();
  }

  function onPointerMove(ev) {
    if (!state.visible || !isSculpting()) return;
    invertStroke = ev.shiftKey;
    queuePointer(ev.clientX, ev.clientY, painting);
  }

  function onPointerUp() {
    endStroke();
  }

  function onKeyDown(ev) {
    if (!state.visible) return;
    const tag = ev.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || ev.target?.isContentEditable) return;

    if (ev.key === "[" || ev.key === "]") {
      const dir = ev.key === "]" ? 1 : -1;
      if (ev.shiftKey) {
        state.brushStrength = THREE.MathUtils.clamp(
          state.brushStrength + dir * 0.05,
          0.05,
          1
        );
        strengthSlider.input.value = String(state.brushStrength);
        strengthSlider.refresh();
      } else {
        state.brushSize = THREE.MathUtils.clamp(state.brushSize + dir * 0.03, 0.05, 1.2);
        sizeSlider.input.value = String(state.brushSize);
        sizeSlider.refresh();
        updateBrushGeometry();
      }
      ev.preventDefault();
      return;
    }

    if (ev.metaKey || ev.ctrlKey) return;
    if (ev.key === "x" || ev.key === "X") {
      symBtns.querySelector('[data-axis="x"]')?.click();
    } else if (ev.key === "y" || ev.key === "Y") {
      symBtns.querySelector('[data-axis="y"]')?.click();
    } else if (ev.key === "z" || ev.key === "Z") {
      symBtns.querySelector('[data-axis="z"]')?.click();
    }
  }

  domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("keydown", onKeyDown);

  setTool("select");
  setVisible(true);
  updateBrushGeometry();

  return {
    isVisible: () => state.visible,
    setVisible,
    toggle() {
      setVisible(!state.visible);
    },
    getTool: () => state.tool,
    setTool,
    destroy() {
      endStroke();
      if (raf) cancelAnimationFrame(raf);
      domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      scene.remove(brushRing);
      scene.remove(brushDot);
      brushRing.geometry.dispose();
      brushRing.material.dispose();
      brushDot.geometry.dispose();
      brushDot.material.dispose();
      root.remove();
      document.documentElement.style.setProperty("--cursor", DEFAULT_CURSOR);
      if (controls) controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    },
  };
}
