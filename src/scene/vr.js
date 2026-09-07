import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";

/**
 * WebXR / Meta Quest via Three.js.
 * Controllers / hand pinch mirror desktop OrbitControls:
 * - one-hand select + move → orbit
 * - two-hand select (pinch distance) → zoom
 * Face buttons (Quest):
 * - X + A → exit XR
 * - Y or B → toggle translucent camera (passthrough) ↔ env background
 *
 * Passthrough needs immersive-ar (alpha-blend). Envmap lighting
 * (scene.environment) stays active in both modes; only scene.background
 * is cleared for camera mode. Desktop background is restored on exit.
 *
 * @see https://threejs.org/docs/#VRButton
 * @see https://developers.meta.com/horizon/documentation/web/webxr-mixed-reality/
 */
export function createVrSystem({
  renderer,
  scene,
  camera,
  controls,
  mount,
  getFocusMesh,
} = {}) {
  renderer.xr.enabled = true;

  const host = mount ?? document.body;
  let button = null;
  let disposed = false;
  /** @type {'immersive-vr' | 'immersive-ar' | null} */
  let sessionMode = null;

  const rig = new THREE.Group();
  rig.name = "xr-rig";

  const spherical = new THREE.Spherical();
  const offset = new THREE.Vector3();

  let saved = null;
  let prevPinchDist = 0;

  // Quest face buttons: [4] = X/A, [5] = Y/B
  let prevChord = false;
  let prevToggle = false;

  /** @type {'env' | 'camera'} */
  let xrBgMode = "env";
  /** Desktop background snapshot — never leave XR with a null bg on desktop. */
  let desktopBackground = null;

  const controller0 = renderer.xr.getController(0);
  const controller1 = renderer.xr.getController(1);
  controller0.name = "xr-controller-0";
  controller1.name = "xr-controller-1";

  for (const controller of [controller0, controller1]) {
    controller.userData.dragging = false;
    controller.userData.prevPos = new THREE.Vector3();
    makeRay(controller);
    scene.add(controller);
  }

  function makeRay(controller) {
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    const line = new THREE.Line(
      geom,
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.35,
      })
    );
    line.name = "xr-ray";
    line.scale.z = 1.25;
    line.visible = false;
    controller.add(line);
    return line;
  }

  function setRaysVisible(visible) {
    for (const controller of [controller0, controller1]) {
      const ray = controller.getObjectByName("xr-ray");
      if (ray) ray.visible = visible;
    }
  }

  function captureDesktopView() {
    saved = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      near: camera.near,
      far: camera.far,
      target: controls.target.clone(),
      autoRotate: controls.autoRotate,
      enabled: controls.enabled,
    };
  }

  function restoreDesktopView() {
    if (!saved) return;
    camera.position.copy(saved.position);
    camera.quaternion.copy(saved.quaternion);
    camera.near = saved.near;
    camera.far = saved.far;
    camera.updateProjectionMatrix();
    controls.target.copy(saved.target);
    controls.autoRotate = saved.autoRotate;
    controls.enabled = saved.enabled;
    controls.update();
    saved = null;
  }

  function canUseCameraMode() {
    return renderer.xr.getEnvironmentBlendMode() === "alpha-blend";
  }

  function resolveEnvBackground() {
    if (scene.environment) return scene.environment;
    if (desktopBackground != null) return desktopBackground;
    return new THREE.Color(0x0a0a0c);
  }

  function applyXrBackgroundMode() {
    if (!renderer.xr.isPresenting) return;
    if (xrBgMode === "camera" && canUseCameraMode()) {
      scene.background = null;
      return;
    }
    if (xrBgMode === "camera" && !canUseCameraMode()) {
      // Opaque VR session — no passthrough; stay on env sky.
      xrBgMode = "env";
    }
    scene.background = resolveEnvBackground();
  }

  function syncSphericalFromView() {
    offset.copy(camera.position).sub(controls.target);
    if (offset.lengthSq() < 1e-8) offset.set(0, 0, 3);
    spherical.setFromVector3(offset);
    spherical.makeSafe();
  }

  function frameContentForVr() {
    const mesh = getFocusMesh?.();
    if (mesh) {
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      if (!box.isEmpty()) {
        box.getCenter(controls.target);
        const size = box.getSize(offset);
        const radius = Math.max(size.x, size.y, size.z, 0.5) * 0.5;
        spherical.radius = Math.max(1.5, radius * 2.4);
        spherical.theta = 0;
        spherical.phi = Math.PI / 2.4;
        spherical.makeSafe();
        applyRigFromSpherical();
        return;
      }
    }
    syncSphericalFromView();
    applyRigFromSpherical();
  }

  function applyRigFromSpherical() {
    spherical.makeSafe();
    spherical.radius = THREE.MathUtils.clamp(spherical.radius, 0.2, 200);
    offset.setFromSpherical(spherical);
    rig.position.copy(controls.target).add(offset);
    rig.lookAt(controls.target);
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
  }

  function readFaceButtons() {
    const session = renderer.xr.getSession?.();
    let x = false;
    let a = false;
    let y = false;
    let b = false;
    if (!session) return { x, a, y, b };
    for (const source of session.inputSources) {
      const buttons = source.gamepad?.buttons;
      if (!buttons) continue;
      const face = Boolean(buttons[4]?.pressed);
      const alt = Boolean(buttons[5]?.pressed);
      if (source.handedness === "left") {
        if (face) x = true;
        if (alt) y = true;
      } else if (source.handedness === "right") {
        if (face) a = true;
        if (alt) b = true;
      } else {
        if (face) {
          if (!x) x = true;
          else a = true;
        }
        if (alt) {
          if (!y) y = true;
          else b = true;
        }
      }
    }
    return { x, a, y, b };
  }

  function endVrSession() {
    const session = renderer.xr.getSession?.();
    session?.end?.();
  }

  function updateFaceButtons() {
    const { x, a, y, b } = readFaceButtons();
    const chord = x && a;
    if (chord && !prevChord) endVrSession();
    prevChord = chord;

    // Y / B — toggle translucent camera ↔ env (ignore while exiting)
    const toggle = !chord && (y || b);
    if (toggle && !prevToggle) {
      xrBgMode = xrBgMode === "camera" ? "env" : "camera";
      applyXrBackgroundMode();
    }
    prevToggle = toggle;
  }

  function onSelectStart(event) {
    const controller = event.target;
    controller.userData.dragging = true;
    controller.userData.prevPos.copy(controller.position);
    prevPinchDist = 0;
    controls.autoRotate = false;
  }

  function onSelectEnd(event) {
    event.target.userData.dragging = false;
    prevPinchDist = 0;
  }

  function updateOrbitFromControllers() {
    const d0 = controller0.userData.dragging;
    const d1 = controller1.userData.dragging;

    if (d0 && d1) {
      const dist = controller0.position.distanceTo(controller1.position);
      if (prevPinchDist > 1e-5) {
        // Match trackpad pinch: closer hands → zoom in (smaller radius)
        spherical.radius *= prevPinchDist / Math.max(dist, 1e-5);
      }
      prevPinchDist = dist;
      controller0.userData.prevPos.copy(controller0.position);
      controller1.userData.prevPos.copy(controller1.position);
      applyRigFromSpherical();
      return;
    }

    prevPinchDist = 0;
    const controller = d0 ? controller0 : d1 ? controller1 : null;
    if (!controller) return;

    const prev = controller.userData.prevPos;
    const dx = controller.position.x - prev.x;
    const dy = controller.position.y - prev.y;
    const dz = controller.position.z - prev.z;
    // Horizontal sweep orbits; vertical + depth pitch — same feel as mouse drag
    const orbitSpeed = 2.8 / Math.max(spherical.radius, 0.5);
    spherical.theta -= (dx + dz) * orbitSpeed * 4;
    spherical.phi -= dy * orbitSpeed * 4;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.12, Math.PI - 0.12);
    prev.copy(controller.position);
    applyRigFromSpherical();
  }

  function onSessionStart() {
    captureDesktopView();
    desktopBackground = scene.background;
    xrBgMode = "env";
    controls.enabled = false;
    controls.autoRotate = false;
    scene.add(rig);
    rig.add(camera);
    frameContentForVr();
    setRaysVisible(true);
    document.body.classList.add("is-vr-presenting");
    document.body.classList.toggle("is-xr-ar", sessionMode === "immersive-ar");
    prevChord = false;
    prevToggle = false;
    applyXrBackgroundMode();
  }

  function onSessionEnd() {
    document.body.classList.remove("is-vr-presenting");
    document.body.classList.remove("is-xr-ar");
    setRaysVisible(false);
    // Camera mode leaves background null — restore desktop-safe sky without
    // clobbering an env that may have been loaded during the session.
    if (scene.background == null) {
      scene.background =
        scene.environment ?? desktopBackground ?? new THREE.Color(0x0a0a0c);
    }
    desktopBackground = null;
    xrBgMode = "env";
    // Carry the VR orbit framing back to desktop OrbitControls
    offset.setFromSpherical(spherical);
    const endPos = controls.target.clone().add(offset);
    if (camera.parent === rig) rig.remove(camera);
    if (rig.parent) rig.parent.remove(rig);
    if (saved) {
      saved.position.copy(endPos);
      saved.target.copy(controls.target);
    }
    restoreDesktopView();
    prevChord = false;
    prevToggle = false;
  }

  controller0.addEventListener("selectstart", onSelectStart);
  controller1.addEventListener("selectstart", onSelectStart);
  controller0.addEventListener("selectend", onSelectEnd);
  controller1.addEventListener("selectend", onSelectEnd);

  renderer.xr.addEventListener("sessionstart", onSessionStart);
  renderer.xr.addEventListener("sessionend", onSessionEnd);

  const sessionInit = {
    optionalFeatures: [
      "local-floor",
      "bounded-floor",
      "hand-tracking",
      "layers",
    ],
  };

  /**
   * Prefer immersive-ar (Quest passthrough / alpha-blend) so Y/B translucent
   * mode can show the real world; fall back to immersive-vr.
   */
  async function mountXrButton() {
    if (!navigator.xr?.isSessionSupported || disposed) return;

    let ar = false;
    let vr = false;
    try {
      ar = await navigator.xr.isSessionSupported("immersive-ar");
    } catch {
      /* ignore */
    }
    try {
      vr = await navigator.xr.isSessionSupported("immersive-vr");
    } catch {
      /* ignore */
    }
    if (disposed || (!ar && !vr)) return;

    sessionMode = ar ? "immersive-ar" : "immersive-vr";

    if (sessionMode === "immersive-vr") {
      button = VRButton.createButton(renderer, sessionInit);
      button.classList.add("vr-button");
      host.appendChild(button);
      return;
    }

    // Custom AR entry — same chrome as VRButton, local-floor like our VR path.
    button = document.createElement("button");
    button.id = "VRButton";
    button.className = "vr-button";
    button.textContent = "ENTER VR";
    button.type = "button";

    let currentSession = null;
    const sessionOptions = {
      ...sessionInit,
      optionalFeatures: [
        "local-floor",
        "bounded-floor",
        "hand-tracking",
        "layers",
        ...(sessionInit.optionalFeatures || []),
      ],
    };

    async function onSessionStarted(session) {
      session.addEventListener("end", onSessionEnded);
      renderer.xr.setReferenceSpaceType("local-floor");
      await renderer.xr.setSession(session);
      button.textContent = "EXIT VR";
      currentSession = session;
    }

    function onSessionEnded() {
      currentSession?.removeEventListener("end", onSessionEnded);
      button.textContent = "ENTER VR";
      currentSession = null;
    }

    button.addEventListener("click", () => {
      if (currentSession) {
        currentSession.end();
        return;
      }
      navigator.xr
        .requestSession("immersive-ar", sessionOptions)
        .then(onSessionStarted)
        .catch((err) => console.warn("[xr] immersive-ar failed", err));
    });

    host.appendChild(button);
  }

  mountXrButton();

  return {
    button: () => button,
    isPresenting: () => renderer.xr.isPresenting,
    getBackgroundMode: () => xrBgMode,
    update() {
      if (!renderer.xr.isPresenting) return;
      updateFaceButtons();
      updateOrbitFromControllers();
      // Env reloads set scene.background — re-assert camera passthrough.
      if (xrBgMode === "camera" && canUseCameraMode() && scene.background != null) {
        scene.background = null;
      }
    },
    dispose() {
      disposed = true;
      document.body.classList.remove("is-vr-presenting");
      document.body.classList.remove("is-xr-ar");
      renderer.xr.removeEventListener("sessionstart", onSessionStart);
      renderer.xr.removeEventListener("sessionend", onSessionEnd);
      controller0.removeEventListener("selectstart", onSelectStart);
      controller1.removeEventListener("selectstart", onSelectStart);
      controller0.removeEventListener("selectend", onSelectEnd);
      controller1.removeEventListener("selectend", onSelectEnd);
      button?.remove();
      if (camera.parent === rig) rig.remove(camera);
      if (rig.parent) rig.parent.remove(rig);
      scene.remove(controller0);
      scene.remove(controller1);
    },
  };
}
