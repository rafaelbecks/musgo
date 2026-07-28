import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";
import { params } from "../config.js";
import {
  attachCausticsToMaterial,
  createCausticTexture,
  syncCausticUniforms,
} from "./caustics.js";

const WATER_NORMALS_URL = "./textures/waternormals.jpg";

const SHAPE_OPTIONS = {
  Sphere: "sphere",
  Cube: "box",
};

/**
 * Water volume around the live morph mesh (cartografias-style Three.js Water
 * envelope) plus projected caustics. Organism materials stay untouched aside
 * from a non-destructive caustic compile hook.
 */
export function createUnderwaterSystem({ sceneSystem, morphSystem }) {
  const { scene, camera, controls, light } = sceneSystem;

  let water = null;
  let waterNormals = null;
  let causticAnim = null;
  let causticLight = null;
  let detachCaustics = null;
  let enabled = false;
  let settingLight = false;
  let builtKey = null;
  let causticOffset = new THREE.Vector2();

  const sun = new THREE.Vector3();
  const boundsBox = new THREE.Box3();
  const boundsSize = new THREE.Vector3();
  const boundsCenter = new THREE.Vector3();
  const lightDir = new THREE.Vector3(2, 2, -1).normalize();

  function loadWaterNormals() {
    if (waterNormals) return waterNormals;
    waterNormals = new THREE.TextureLoader().load(WATER_NORMALS_URL, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    });
    return waterNormals;
  }

  function getMeshBounds() {
    const mesh = morphSystem.getAnalysisMesh?.();
    if (!mesh) {
      boundsCenter.set(0, 0, 0);
      boundsSize.set(2, 2, 2);
      return { center: boundsCenter, size: boundsSize, radius: 1.5 };
    }
    mesh.updateMatrixWorld(true);
    boundsBox.setFromObject(mesh);
    boundsBox.getCenter(boundsCenter);
    boundsBox.getSize(boundsSize);
    const radius = boundsSize.length() * 0.5;
    return { center: boundsCenter.clone(), size: boundsSize.clone(), radius };
  }

  function waterSide() {
    switch (params.uwSide) {
      case "inside":
        return THREE.BackSide;
      case "outside":
        return THREE.FrontSide;
      default:
        return THREE.DoubleSide;
    }
  }

  function createEnvelopeGeometry(bounds) {
    const pad = params.uwPadding;
    const segments = Math.max(16, Math.floor(params.uwSegments));

    if (params.uwShape === "box") {
      const w = Math.max(0.2, bounds.size.x * pad);
      const h = Math.max(0.2, bounds.size.y * pad);
      const d = Math.max(0.2, bounds.size.z * pad);
      const div = Math.max(1, Math.floor(segments * 0.25));
      return new THREE.BoxGeometry(w, h, d, div, div, div);
    }

    const r = Math.max(0.15, bounds.radius * pad);
    return new THREE.SphereGeometry(
      r,
      segments,
      Math.max(8, Math.floor(segments * 0.75))
    );
  }

  function createWaterMesh(geometry) {
    return new Water(geometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: loadWaterNormals(),
      sunDirection: new THREE.Vector3(),
      sunColor: new THREE.Color(params.uwSunColor),
      waterColor: new THREE.Color(params.uwWaterColor),
      distortionScale: params.uwDistortion,
      alpha: params.uwAlpha,
      side: waterSide(),
      fog: false,
    });
  }

  function updateSunFromLightDir() {
    if (!water) return;
    sun.copy(lightDir).normalize();
    water.material.uniforms.sunDirection.value.copy(sun);
  }

  function applyWaterUniforms() {
    if (!water) return;
    const u = water.material.uniforms;
    u.waterColor.value.set(params.uwWaterColor);
    u.sunColor.value.set(params.uwSunColor);
    u.distortionScale.value = params.uwDistortion;
    u.size.value = params.uwWaveSize;
    u.alpha.value = params.uwAlpha;
    water.material.side = waterSide();
    water.material.transparent = params.uwAlpha < 0.999;
    water.material.needsUpdate = true;
    updateSunFromLightDir();
  }

  function geometryKey(bounds) {
    return [
      params.uwShape,
      params.uwPadding.toFixed(2),
      params.uwSegments,
      params.uwSide,
      bounds.size.x.toFixed(2),
      bounds.size.y.toFixed(2),
      bounds.size.z.toFixed(2),
    ].join("|");
  }

  function rebuildEnvelope(force = false) {
    const bounds = getMeshBounds();
    const key = geometryKey(bounds);
    if (!force && water && builtKey === key) {
      water.position.copy(bounds.center);
      return;
    }

    const geometry = createEnvelopeGeometry(bounds);
    if (water) {
      water.geometry.dispose();
      water.geometry = geometry;
    } else {
      water = createWaterMesh(geometry);
      water.renderOrder = 2;
      scene.add(water);
    }

    water.position.copy(bounds.center);
    water.rotation.set(0, 0, 0);
    applyWaterUniforms();
    builtKey = key;
  }

  function ensureCausticLight() {
    if (causticLight) return;
    causticAnim = createCausticTexture(128);
    causticLight = new THREE.SpotLight(0xa8e8ff, params.uwCausticStrength * 8);
    causticLight.angle = Math.PI / 4;
    causticLight.penumbra = 0.6;
    causticLight.decay = 1.5;
    causticLight.distance = 40;
    causticLight.castShadow = false;
    causticLight.map = causticAnim.texture;
    causticLight.target = new THREE.Object3D();
    scene.add(causticLight);
    scene.add(causticLight.target);
  }

  function placeCausticLight(bounds) {
    if (!causticLight) return;
    const dist = Math.max(bounds.radius * 2.5, 2);
    causticLight.position
      .copy(bounds.center)
      .addScaledVector(lightDir, dist);
    causticLight.target.position.copy(bounds.center);
    causticLight.target.updateMatrixWorld();
    causticLight.intensity = params.uwCausticStrength * 10;
    causticLight.distance = dist * 4;
  }

  function attachToMorph() {
    detachFromMorph();
    const mesh = morphSystem.getAnalysisMesh?.();
    if (!mesh?.material) return;
    detachCaustics = attachCausticsToMaterial(mesh.material);
  }

  function detachFromMorph() {
    if (detachCaustics) {
      detachCaustics();
      detachCaustics = null;
    }
  }

  function syncMorphCaustics() {
    const mesh = morphSystem.getAnalysisMesh?.();
    if (!mesh?.material || !causticAnim) return;
    syncCausticUniforms(mesh.material, {
      map: causticAnim.texture,
      strength: params.uwCausticStrength * 0.85,
      scale: params.uwCausticScale,
      enabled: enabled && params.uwCaustics,
      offsetX: causticOffset.x,
      offsetY: causticOffset.y,
    });
  }

  function setLightFromCamera() {
    lightDir.copy(camera.position).sub(controls.target).normalize();
    if (lightDir.lengthSq() < 1e-6) lightDir.set(2, 2, -1).normalize();
    updateSunFromLightDir();
    if (enabled) {
      placeCausticLight(getMeshBounds());
      // Also nudge studio key light for coherence
      if (light) {
        const bounds = getMeshBounds();
        light.position
          .copy(bounds.center)
          .addScaledVector(lightDir, Math.max(bounds.radius * 3, 4));
      }
    }
  }

  function onKeyDown(e) {
    if (!enabled) return;
    if (e.code === "KeyL") {
      settingLight = true;
      setLightFromCamera();
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    if (e.code === "KeyL") settingLight = false;
  }

  let inputConnected = false;
  function connectInput() {
    if (inputConnected) return;
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    inputConnected = true;
  }

  function disconnectInput() {
    if (!inputConnected) return;
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    settingLight = false;
    inputConnected = false;
  }

  function setEnabled(value) {
    if (value === enabled) {
      if (value) sync();
      return;
    }

    if (value) {
      ensureCausticLight();
      rebuildEnvelope(true);
      attachToMorph();
      placeCausticLight(getMeshBounds());
      applyWaterUniforms();
      syncMorphCaustics();
      connectInput();
      enabled = true;
      params.uwEnabled = true;
    } else {
      disconnectInput();
      detachFromMorph();
      if (water) {
        scene.remove(water);
        water.geometry.dispose();
        water.material.dispose();
        water = null;
        builtKey = null;
      }
      if (causticLight) {
        scene.remove(causticLight);
        scene.remove(causticLight.target);
        causticLight.dispose?.();
        causticLight = null;
      }
      if (causticAnim) {
        causticAnim.dispose();
        causticAnim = null;
      }
      enabled = false;
      params.uwEnabled = false;
    }
  }

  function sync() {
    if (!params.uwEnabled) {
      if (enabled) setEnabled(false);
      return;
    }
    if (!enabled) {
      setEnabled(true);
      return;
    }
    rebuildEnvelope();
    applyWaterUniforms();
    placeCausticLight(getMeshBounds());
    syncMorphCaustics();
  }

  function refreshFromMorph() {
    if (!enabled) return;
    rebuildEnvelope(true);
    attachToMorph();
    placeCausticLight(getMeshBounds());
    syncMorphCaustics();
  }

  function applyParams() {
    if (params.uwEnabled !== enabled) {
      setEnabled(params.uwEnabled);
      return;
    }
    if (!enabled) return;
    rebuildEnvelope(true);
    applyWaterUniforms();
    placeCausticLight(getMeshBounds());
    syncMorphCaustics();
  }

  function update(delta) {
    if (!enabled) return;

    if (settingLight || params.uwLightFollow) {
      setLightFromCamera();
    }

    if (water) {
      water.material.uniforms.time.value += delta * params.uwWaveSpeed;
      const bounds = getMeshBounds();
      water.position.copy(bounds.center);
    }

    if (causticAnim && params.uwCaustics) {
      // Full canvas rewrite is expensive — throttle to ~20fps
      if (!update._acc) update._acc = 0;
      update._acc += delta;
      if (update._acc >= 0.05) {
        causticAnim.update(update._acc, params.uwCausticSpeed);
        causticOffset.x += update._acc * 0.08 * params.uwCausticSpeed;
        causticOffset.y += update._acc * 0.05 * params.uwCausticSpeed;
        update._acc = 0;
        syncMorphCaustics();
      }
    }

    if (causticLight) {
      causticLight.visible = params.uwCaustics;
      causticLight.intensity = params.uwCausticStrength * 10;
    }
  }

  function onResize() {
    // Mirror RT resizes with renderer; nothing extra required
  }

  return {
    setEnabled,
    isEnabled: () => enabled,
    update,
    onResize,
    refreshFromMorph,
    applyParams,
    sync,
    setLightFromCamera,
    SHAPE_OPTIONS,
    dispose() {
      setEnabled(false);
    },
  };
}
