import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export function createPostProcessing({ renderer, scene, camera, params }) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    params.bloomStrength,
    params.bloomRadius,
    params.bloomThreshold
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  function syncBloom() {
    bloomPass.enabled = params.bloomEnabled;
    bloomPass.strength = params.bloomStrength;
    bloomPass.radius = params.bloomRadius;
    bloomPass.threshold = params.bloomThreshold;
  }

  function setSize(width, height) {
    composer.setSize(width, height);
    bloomPass.resolution.set(width, height);
  }

  function render() {
    syncBloom();
    composer.render();
  }

  function dispose() {
    composer.dispose();
  }

  return { render, setSize, dispose, bloomPass };
}
