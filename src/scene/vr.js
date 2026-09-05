import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";

/**
 * WebXR / Meta Quest VR POC via Three.js VRButton.
 * @see https://threejs.org/docs/#VRButton
 * @see https://threejs.org/manual/en/how-to-create-vr-content.html
 * @see https://threejsresources.com/vr
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

  const button = VRButton.createButton(renderer);
  button.classList.add("vr-button");
  (mount ?? document.body).appendChild(button);

  // Dolly: headset pose is applied relative to this group while presenting.
  const rig = new THREE.Group();
  rig.name = "xr-rig";

  let saved = null;

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

  function frameContentForVr() {
    const mesh = getFocusMesh?.();
    const target = new THREE.Vector3();
    let distance = 3;
    let floorY = 0;

    if (mesh) {
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      if (!box.isEmpty()) {
        box.getCenter(target);
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z, 0.5) * 0.5;
        distance = Math.max(1.5, radius * 2.4);
        floorY = Number.isFinite(box.min.y) ? box.min.y : 0;
      }
    } else {
      target.copy(controls.target);
      distance = Math.max(1.5, camera.position.distanceTo(target) || 3);
    }

    // local-floor pose already includes standing height — keep camera at rig origin.
    // Stand on +Z of the form; default look is −Z toward center.
    rig.position.set(target.x, floorY, target.z + distance);
    rig.rotation.set(0, 0, 0);
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    camera.near = 0.01;
    camera.far = 500;
    camera.updateProjectionMatrix();
  }

  function onSessionStart() {
    captureDesktopView();
    controls.enabled = false;
    controls.autoRotate = false;
    scene.add(rig);
    rig.add(camera);
    frameContentForVr();
  }

  function onSessionEnd() {
    if (camera.parent === rig) rig.remove(camera);
    if (rig.parent) rig.parent.remove(rig);
    restoreDesktopView();
  }

  renderer.xr.addEventListener("sessionstart", onSessionStart);
  renderer.xr.addEventListener("sessionend", onSessionEnd);

  return {
    button,
    isPresenting: () => renderer.xr.isPresenting,
    dispose() {
      renderer.xr.removeEventListener("sessionstart", onSessionStart);
      renderer.xr.removeEventListener("sessionend", onSessionEnd);
      button.remove();
      if (camera.parent === rig) rig.remove(camera);
      if (rig.parent) rig.parent.remove(rig);
    },
  };
}
