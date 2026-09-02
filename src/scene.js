import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import { params } from "./config.js";
import { createPostProcessing } from "./scene/postProcessing.js";

export function createSceneSystem({ mount, loading } = {}) {
  const container = mount ?? document.body;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0c);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
  camera.position.set(4, 3, 6);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.physicallyCorrectLights = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = params.exposure;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = params.autoRotate;
  controls.autoRotateSpeed = params.rotateSpeed;
  controls.target.set(0, 0, 0);

  controls.addEventListener("start", () => {
    controls.autoRotate = false;
  });
  controls.addEventListener("end", () => {
    if (params.autoRotate) controls.autoRotate = true;
  });

  const light = new THREE.DirectionalLight(0xffffff, params.lightIntensity);
  light.position.set(4, 8, 6);
  scene.add(light);

  const fill = new THREE.DirectionalLight(0xaabbcc, 0.35);
  fill.position.set(-3, 2, -4);
  scene.add(fill);

  const ambient = new THREE.AmbientLight(0xffffff, params.ambient);
  scene.add(ambient);

  let grid = null;
  let axes = null;

  function rebuildGrid() {
    if (grid) {
      scene.remove(grid);
      grid.geometry.dispose();
      grid.material.dispose();
      grid = null;
    }
    if (!params.showGrid) return;

    grid = new THREE.GridHelper(
      params.gridSize,
      params.gridDivisions,
      0x444455,
      0x222228
    );
    grid.material.opacity = 0.6;
    grid.material.transparent = true;
    scene.add(grid);
  }

  function rebuildAxes() {
    if (axes) {
      scene.remove(axes);
      axes.dispose();
      axes = null;
    }
    if (!params.showAxes) return;
    axes = new THREE.AxesHelper(params.gridSize * 0.4);
    scene.add(axes);
  }

  rebuildGrid();
  rebuildAxes();

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rgbeLoader = new RGBELoader();
  const exrLoader = new EXRLoader();
  const textureLoader = new THREE.TextureLoader();
  let currentEnvMap = null;
  let currentEnvPath = null;
  let customEnvObjectUrl = null;
  let envLoadId = 0;

  function disposeCustomEnvUrl() {
    if (customEnvObjectUrl) {
      URL.revokeObjectURL(customEnvObjectUrl);
      customEnvObjectUrl = null;
    }
  }

  function applyCustomEnvTransform() {
    const rotY = THREE.MathUtils.degToRad(params.customEnvRotation ?? 0);
    if (scene.environmentRotation) {
      scene.environmentRotation.set(0, rotY, 0);
    }
    if (scene.backgroundRotation) {
      scene.backgroundRotation.set(0, rotY, 0);
    }
    scene.backgroundIntensity = params.customEnvIntensity ?? 1;
  }

  function applyEnvironmentTexture(texture, { offset = 0 } = {}) {
    if (offset) {
      texture.offset.x = offset;
      texture.needsUpdate = true;
    }
    const envMap = pmrem.fromEquirectangular(texture).texture;
    scene.environment = envMap;
    scene.background = envMap;
    scene.backgroundBlurriness = params.bgBlur;
    applyCustomEnvTransform();

    if (currentEnvMap) currentEnvMap.dispose();
    currentEnvMap = envMap;
    light.intensity = 0;
    ambient.intensity = 0;
    texture.dispose();
  }

  function loadEnvironment(path, { silent = false, format = null } = {}) {
    if (!path) {
      clearEnvironment();
      return Promise.resolve();
    }

    if (path === currentEnvPath && !customEnvObjectUrl) {
      scene.backgroundBlurriness = params.bgBlur;
      applyCustomEnvTransform();
      return Promise.resolve();
    }

    disposeCustomEnvUrl();
    const id = ++envLoadId;
    const resolvedFormat =
      format ?? (String(path).endsWith(".exr") ? "exr" : "hdr");
    const loader = resolvedFormat === "exr" ? exrLoader : rgbeLoader;

    return new Promise((resolve, reject) => {
      if (!silent) loading?.begin("environment");

      loader.load(
        path,
        (texture) => {
          if (id !== envLoadId) {
            if (!silent) loading?.end("environment");
            resolve(null);
            return;
          }
          applyEnvironmentTexture(texture);
          currentEnvPath = path;
          if (!silent) loading?.end("environment");
          resolve(texture);
        },
        (xhr) => {
          if (!silent && xhr.total) loading?.setProgress(xhr.loaded / xhr.total);
        },
        (err) => {
          if (id === envLoadId && !silent) loading?.end("environment");
          console.error(err);
          reject(err);
        }
      );
    });
  }

  function loadEnvironmentFromFile(file, { silent = false } = {}) {
    if (!file) {
      clearEnvironment();
      return Promise.resolve();
    }

    disposeCustomEnvUrl();
    const objectUrl = URL.createObjectURL(file);
    customEnvObjectUrl = objectUrl;
    currentEnvPath = null;

    const name = String(file.name ?? "").toLowerCase();
    const format = name.endsWith(".exr")
      ? "exr"
      : name.endsWith(".hdr")
        ? "hdr"
        : "image";

    const id = ++envLoadId;

    return new Promise((resolve, reject) => {
      if (!silent) loading?.begin("environment");

      const onLoaded = (texture) => {
        if (id !== envLoadId) {
          if (!silent) loading?.end("environment");
          resolve(null);
          return;
        }
        if (format === "image") {
          texture.colorSpace = THREE.SRGBColorSpace;
        }
        applyEnvironmentTexture(texture, { offset: params.customEnvOffset ?? 0 });
        if (!silent) loading?.end("environment");
        resolve(texture);
      };

      const onError = (err) => {
        if (id === envLoadId) {
          disposeCustomEnvUrl();
          if (!silent) loading?.end("environment");
          console.error(err);
          reject(err);
        }
      };

      if (format === "exr") {
        exrLoader.load(objectUrl, onLoaded, undefined, onError);
      } else if (format === "hdr") {
        rgbeLoader.load(objectUrl, onLoaded, undefined, onError);
      } else {
        textureLoader.load(objectUrl, onLoaded, undefined, onError);
      }
    });
  }

  function refreshCustomEnvironment() {
    if (!customEnvObjectUrl && !currentEnvPath) return;
    if (customEnvObjectUrl) {
      applyCustomEnvTransform();
      scene.backgroundBlurriness = params.bgBlur;
      return;
    }
    scene.backgroundBlurriness = params.bgBlur;
    applyCustomEnvTransform();
  }

  function clearEnvironment() {
    scene.environment = null;
    scene.background = new THREE.Color(0x0a0a0c);
    light.intensity = params.lightIntensity;
    ambient.intensity = params.ambient;
    currentEnvPath = null;
    disposeCustomEnvUrl();
    if (scene.environmentRotation) scene.environmentRotation.set(0, 0, 0);
    if (scene.backgroundRotation) scene.backgroundRotation.set(0, 0, 0);
    scene.backgroundIntensity = 1;
    if (currentEnvMap) {
      currentEnvMap.dispose();
      currentEnvMap = null;
    }
  }

  const postProcessing = createPostProcessing({ renderer, scene, camera, params });

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    postProcessing.setSize(w, h);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  return {
    scene,
    camera,
    renderer,
    controls,
    light,
    ambient,
    render: () => postProcessing.render(),
    loadEnvironment,
    loadEnvironmentFromFile,
    refreshCustomEnvironment,
    clearEnvironment,
    hasCustomEnvironment: () => !!customEnvObjectUrl,
    rebuildGrid,
    rebuildAxes,
    resize,
    dispose() {
      ro.disconnect();
      postProcessing.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
