import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";

/**
 * WebXR / Meta Quest VR POC via Three.js VRButton.
 * Controllers / hand pinch mirror desktop OrbitControls:
 * - one-hand select + move → orbit
 * - two-hand select (pinch distance) → zoom
 * Face buttons (Quest): X + A → exit VR
 * @see https://threejs.org/docs/#VRButton
 * @see https://threejs.org/manual/en/how-to-create-vr-content.html
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

  const rig = new THREE.Group();
  rig.name = "xr-rig";

  const spherical = new THREE.Spherical();
  const offset = new THREE.Vector3();

  let saved = null;
  let prevPinchDist = 0;

  // Quest face buttons: buttons[4] = X (left) / A (right)
  let prevChord = false;

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
    if (!session) return { x, a };
    for (const source of session.inputSources) {
      const pressed = Boolean(source.gamepad?.buttons?.[4]?.pressed);
      if (!pressed) continue;
      if (source.handedness === "left") x = true;
      else if (source.handedness === "right") a = true;
      else {
        // Fallback if handedness is missing: treat first as X, second as A
        if (!x) x = true;
        else a = true;
      }
    }
    return { x, a };
  }

  function endVrSession() {
    const session = renderer.xr.getSession?.();
    session?.end?.();
  }

  function updateFaceButtons() {
    const { x, a } = readFaceButtons();
    const chord = x && a;
    if (chord && !prevChord) endVrSession();
    prevChord = chord;
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
    controls.enabled = false;
    controls.autoRotate = false;
    scene.add(rig);
    rig.add(camera);
    frameContentForVr();
    setRaysVisible(true);
    document.body.classList.add("is-vr-presenting");
    prevChord = false;
  }

  function onSessionEnd() {
    document.body.classList.remove("is-vr-presenting");
    setRaysVisible(false);
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

  // Only mount the Enter VR control when immersive-vr is actually available.
  if (navigator.xr?.isSessionSupported) {
    navigator.xr
      .isSessionSupported("immersive-vr")
      .then((supported) => {
        if (!supported || disposed) return;
        button = VRButton.createButton(renderer, sessionInit);
        button.classList.add("vr-button");
        host.appendChild(button);
      })
      .catch(() => {
        /* hide — VR not allowed / not available */
      });
  }

  return {
    button: () => button,
    isPresenting: () => renderer.xr.isPresenting,
    update() {
      if (!renderer.xr.isPresenting) return;
      updateFaceButtons();
      updateOrbitFromControllers();
    },
    dispose() {
      disposed = true;
      document.body.classList.remove("is-vr-presenting");
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
