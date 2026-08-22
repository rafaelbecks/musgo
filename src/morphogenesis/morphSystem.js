import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { morphParams } from "./morphParams.js";
import { createMorphGeometry, getMorphSide } from "./morphGeometries.js";
import {
  applyNoiseDeform,
  captureBaseGeometry,
} from "./noiseDeform.js";

const EXPORT_PARAM_KEYS = [
  "shape",
  "extent",
  "shapeSegments",
  "envelopeRadius",
  "torusTube",
  "torusKnotRadius",
  "torusKnotTube",
  "torusKnotTubularSegments",
  "torusKnotRadialSegments",
  "torusKnotP",
  "torusKnotQ",
  "minimalVSegments",
  "chenGackstatterRMin",
  "chenGackstatterRMax",
  "chenGackstatterStretchZ",
  "lopezRosSpan",
  "lopezRosDeform",
  "lopezRosTwist",
  "lopezRosMode",
  "lopezRosStackCount",
  "lopezRosStackSpacing",
  "gielisA1",
  "gielisB1",
  "gielisM1",
  "gielisN11",
  "gielisN12",
  "gielisN13",
  "gielisFamily1",
  "gielisA2",
  "gielisB2",
  "gielisM2",
  "gielisN21",
  "gielisN22",
  "gielisN23",
  "gielisFamily2",
  "gielisPhiMode",
  "gielisVSegments",
  "leafRadius",
  "leafWidthScale",
  "leafHeightScale",
  "leafExponent",
  "leafAsymmetry",
  "leafTopPinch",
  "leafBottomPinch",
  "leafSkew",
  "leafResolution",
  "leafFoldDepth",
  "leafFoldPower",
  "leafBulge",
  "lsystemPreset",
  "lsystemIterations",
  "lsystemAngle",
  "lsystemStep",
  "lsystemTubeRadius",
  "lsystemTaper",
  "lsystemBranchTaper",
  "lsystemLengthDecay",
  "lsystemSegments",
  "lsystemRadialSegments",
  "lsystemTubularDetail",
  "dlaParticleCount",
  "dlaGridSize",
  "dlaSeed",
  "dlaSeedMode",
  "dlaLaunchMode",
  "dlaStickiness",
  "dlaMinNeighbors",
  "dlaHitsRequired",
  "dlaConnectivity",
  "dlaUpBias",
  "dlaOutwardBias",
  "dlaNoiseBias",
  "dlaNoiseScale",
  "dlaParticleRadius",
  "dlaMeshDetail",
  "dlaElementShape",
  "dlaOrientRandom",
  "modelFile",
  "noiseAmplitude",
  "noiseScale",
  "noiseSeed",
  "noiseOctaves",
  "rotationX",
  "rotationY",
  "rotationZ",
  "side",
];

/** Params that actually change mesh topology / base positions (not noise/rotation). */
const GEOMETRY_PARAM_KEYS = EXPORT_PARAM_KEYS.filter(
  (k) =>
    !k.startsWith("noise") &&
    k !== "rotationX" &&
    k !== "rotationY" &&
    k !== "rotationZ" &&
    k !== "side"
);

function geometryConfigKey() {
  return GEOMETRY_PARAM_KEYS.map((k) => morphParams[k]).join("|");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function createGlbLoader() {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    "https://www.gstatic.com/draco/versioned/decoders/1.5.7/"
  );
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  return loader;
}

function extractFirstMeshGeometry(root) {
  let source = null;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o.isMesh && o.geometry && !source) source = o;
  });
  if (!source) return null;

  const geometry = source.geometry.clone();
  geometry.applyMatrix4(source.matrixWorld);
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function fitModelGeometry(geometry, extent, envelopeRadius) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);

  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
  const target = Math.max(0.5, extent) * Math.max(0.3, envelopeRadius);
  const scale = target / maxDim;
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function ensureGeometryUVs(geometry) {
  if (geometry.attributes.uv) return;

  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();

  const center = geometry.boundingSphere.center;
  const position = geometry.attributes.position;
  const uvs = new Float32Array(position.count * 2);
  const p = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).sub(center).normalize();
    uvs[i * 2] = 0.5 + Math.atan2(p.z, p.x) / (2 * Math.PI);
    uvs[i * 2 + 1] = 0.5 - Math.asin(THREE.MathUtils.clamp(p.y, -1, 1)) / Math.PI;
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

export function createMorphSystem({ scene, params: viewerParams, onViewerChange } = {}) {
  let mesh = null;
  let builtKey = null;
  let noiseMix = 0;
  let elapsed = 0;
  let loadId = 0;
  const glbLoader = createGlbLoader();
  const geometryCache = new Map();
  const normalMapTexture = new THREE.TextureLoader().load(
    "./textures/glass-normal.jpg"
  );
  normalMapTexture.wrapS = THREE.RepeatWrapping;
  normalMapTexture.wrapT = THREE.RepeatWrapping;
  normalMapTexture.colorSpace = THREE.NoColorSpace;

  let customTexture = null;
  let customTextureObjectUrl = null;
  const textureLoader = new THREE.TextureLoader();

  function disposeCustomTexture() {
    if (customTexture) {
      customTexture.dispose();
      customTexture = null;
    }
    if (customTextureObjectUrl) {
      URL.revokeObjectURL(customTextureObjectUrl);
      customTextureObjectUrl = null;
    }
    morphParams.customTextureFileName = "";
  }

  function applyCustomTextureSettings(texture) {
    const wrapMode = morphParams.customTextureWrap;
    const wrap =
      wrapMode === "clamp" || wrapMode === "clamp to edge"
        ? THREE.ClampToEdgeWrapping
        : THREE.RepeatWrapping;
    texture.wrapS = wrap;
    texture.wrapT = wrap;
    texture.repeat.set(
      morphParams.customTextureRepeatU,
      morphParams.customTextureRepeatV
    );
    texture.offset.set(
      morphParams.customTextureOffsetU,
      morphParams.customTextureOffsetV
    );
    texture.rotation = THREE.MathUtils.degToRad(morphParams.customTextureRotation);
    texture.center.set(0.5, 0.5);
    texture.needsUpdate = true;
  }

  function loadCustomTexture(file) {
    return new Promise((resolve, reject) => {
      disposeCustomTexture();
      const objectUrl = URL.createObjectURL(file);
      customTextureObjectUrl = objectUrl;
      textureLoader.load(
        objectUrl,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          applyCustomTextureSettings(texture);
          customTexture = texture;
          morphParams.customTextureEnabled = true;
          morphParams.customTextureFileName = file.name || "image";
          if (viewerParams.wireframe) {
            viewerParams.wireframe = false;
            onViewerChange?.();
          }
          if (mesh) applyMaterialState(mesh.material);
          resolve(texture);
        },
        undefined,
        (err) => {
          disposeCustomTexture();
          reject(err);
        }
      );
    });
  }

  function clearCustomTexture() {
    disposeCustomTexture();
    morphParams.customTextureEnabled = false;
    if (mesh) applyMaterialState(mesh.material);
  }

  function refreshCustomTexture() {
    if (!customTexture) return;
    applyCustomTextureSettings(customTexture);
    if (mesh) applyMaterialState(mesh.material);
  }

  const _surfaceTint = new THREE.Color();

  function applyMaterialState(material) {
    const glass = morphParams.glassEnabled;
    const hasCustom = morphParams.customTextureEnabled && customTexture;
    const role = morphParams.customTextureRole;
    const roleIsColor =
      role === "color" || role === "color map" || role === "color+normal" || role === "color + normal";
    const roleIsNormal =
      role === "normal" || role === "normal map" || role === "color+normal" || role === "color + normal";
    const useCustomColor =
      hasCustom && morphParams.customTextureIntensity > 0 && roleIsColor;
    const useCustomNormal = hasCustom && roleIsNormal;
    const colorMix = useCustomColor ? morphParams.customTextureIntensity : 0;

    if ((glass || hasCustom) && viewerParams.wireframe) {
      viewerParams.wireframe = false;
      onViewerChange?.();
    }

    material.side = getMorphSide(morphParams.side);
    material.wireframe = hasCustom || glass ? false : viewerParams.wireframe;

    _surfaceTint.set(morphParams.color);
    _surfaceTint.lerp(new THREE.Color(0xffffff), colorMix);
    material.color.copy(_surfaceTint);

    if (glass) {
      material.metalness = morphParams.glassMetalness;
      material.roughness = morphParams.glassRoughness;
      material.transmission = useCustomColor
        ? THREE.MathUtils.lerp(
            morphParams.glassTransmission,
            Math.min(morphParams.glassTransmission, 0.15),
            colorMix
          )
        : morphParams.glassTransmission;
      material.ior = morphParams.glassIor;
      material.thickness = morphParams.glassThickness;
      material.envMapIntensity = morphParams.glassEnvMapIntensity;
      material.clearcoat = morphParams.glassClearcoat;
      material.clearcoatRoughness = morphParams.glassClearcoatRoughness;
      material.transparent = morphParams.glassTransparent;
      const normalTex = useCustomNormal ? customTexture : normalMapTexture;
      if (useCustomNormal) {
        normalTex.repeat.set(
          morphParams.customTextureRepeatU,
          morphParams.customTextureRepeatV
        );
      } else {
        normalTex.repeat.set(
          morphParams.glassNormalRepeat,
          morphParams.glassNormalRepeat
        );
      }
      material.normalMap = normalTex;
      material.clearcoatNormalMap = normalTex;
      material.normalScale.set(
        morphParams.glassNormalScale,
        morphParams.glassNormalScale
      );
      material.clearcoatNormalScale.set(
        morphParams.glassClearcoatNormalScale,
        morphParams.glassClearcoatNormalScale
      );
    } else {
      material.metalness = viewerParams.metalness;
      material.roughness = viewerParams.roughness;
      material.transmission = 0;
      material.thickness = 0;
      material.ior = 1.5;
      material.envMapIntensity = 1;
      material.clearcoat = 0;
      material.clearcoatRoughness = 0;
      material.transparent = false;
      if (useCustomNormal) {
        material.normalMap = customTexture;
        material.normalScale.set(
          morphParams.glassNormalScale || 1,
          morphParams.glassNormalScale || 1
        );
      } else {
        material.normalMap = null;
        material.normalScale.set(1, 1);
      }
      material.clearcoatNormalMap = null;
      material.clearcoatNormalScale.set(1, 1);
    }

    material.map = useCustomColor ? customTexture : null;
    if (useCustomColor) {
      customTexture.colorSpace = THREE.SRGBColorSpace;
    }

    material.needsUpdate = true;
  }

  function createMaterial() {
    return new THREE.MeshPhysicalMaterial({
      color: morphParams.color,
      roughness: viewerParams.roughness,
      metalness: viewerParams.metalness,
      side: getMorphSide(morphParams.side),
      wireframe: viewerParams.wireframe,
    });
  }

  function assignGeometry(geometry) {
    ensureGeometryUVs(geometry);
    if (mesh) {
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      applyMaterialState(mesh.material);
    } else {
      mesh = new THREE.Mesh(geometry, createMaterial());
      applyMaterialState(mesh.material);
      scene.add(mesh);
    }

    captureBaseGeometry(mesh.geometry);
    applyNoiseDeform(mesh.geometry, morphParams, noiseMix, elapsed);
    updateTransform();
  }

  function loadModelGeometry(modelFile) {
    const cached = geometryCache.get(modelFile);
    if (cached) {
      return Promise.resolve(
        fitModelGeometry(
          cached.clone(),
          morphParams.extent,
          morphParams.envelopeRadius
        )
      );
    }

    return new Promise((resolve, reject) => {
      glbLoader.load(
        `./glb/${modelFile}.glb`,
        (gltf) => {
          const extracted = extractFirstMeshGeometry(gltf.scene);
          if (!extracted) {
            reject(new Error(`No mesh in ${modelFile}.glb`));
            return;
          }
          geometryCache.set(modelFile, extracted);
          resolve(
            fitModelGeometry(
              extracted.clone(),
              morphParams.extent,
              morphParams.envelopeRadius
            )
          );
        },
        undefined,
        reject
      );
    });
  }

  async function rebuildGeometry(force = false) {
    const key = geometryConfigKey();
    if (!force && mesh && builtKey === key) return;

    if (morphParams.shape === "model") {
      const id = ++loadId;
      const modelFile = morphParams.modelFile || "cosos/pututu";
      try {
        const geometry = await loadModelGeometry(modelFile);
        if (id !== loadId) return;
        assignGeometry(geometry);
        builtKey = key;
      } catch (err) {
        if (id !== loadId) return;
        console.error("[morph] failed to load model", modelFile, err);
      }
      return;
    }

    const geometry = createMorphGeometry(morphParams.shape, morphParams.extent, morphParams);
    assignGeometry(geometry);
    builtKey = key;
  }

  function updateTransform() {
    if (!mesh) return;
    mesh.rotation.set(
      morphParams.rotationX,
      morphParams.rotationY,
      morphParams.rotationZ
    );
    mesh.position.set(0, 0, 0);
  }

  function disposeMesh() {
    if (!mesh) return;
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh = null;
    builtKey = null;
  }

  function dispose() {
    disposeMesh();
    disposeCustomTexture();
    normalMapTexture.dispose();
  }

  async function sync() {
    await rebuildGeometry();
    if (!mesh) return;
    mesh.visible = true;
    applyMaterialState(mesh.material);
    noiseMix = morphParams.noiseEnabled ? 1 : 0;
    applyNoiseDeform(
      mesh.geometry,
      morphParams,
      noiseMix,
      morphParams.animateNoise ? elapsed : 0
    );
    updateTransform();
  }

  /**
   * Synchronous live update for the modulation render loop.
   * Rebuilds parametric geometry immediately; models rebuild async.
   */
  function applyLiveState() {
    if (morphParams.shape === "model") {
      void rebuildGeometry();
    } else {
      const key = geometryConfigKey();
      if (!mesh || builtKey !== key) {
        const geometry = createMorphGeometry(
          morphParams.shape,
          morphParams.extent,
          morphParams
        );
        assignGeometry(geometry);
        builtKey = key;
      }
    }
    if (!mesh) return;
    applyMaterialState(mesh.material);
    updateTransform();
  }

  function updateNoise(delta) {
    if (!mesh) return;
    elapsed += delta;

    if (!mesh.geometry.userData.basePosition) {
      captureBaseGeometry(mesh.geometry);
    }

    const target = morphParams.noiseEnabled ? 1 : 0;
    noiseMix = THREE.MathUtils.damp(
      noiseMix,
      target,
      morphParams.noiseMorphSpeed,
      delta
    );

    const time = morphParams.animateNoise ? elapsed : 0;
    applyNoiseDeform(mesh.geometry, morphParams, noiseMix, time);
  }

  function getAnalysisMesh() {
    return mesh;
  }

  function getNoiseMix() {
    return noiseMix;
  }

  function snapNoiseMix(value) {
    noiseMix = value;
    if (!mesh) return;
    if (!mesh.geometry.userData.basePosition) captureBaseGeometry(mesh.geometry);
    applyNoiseDeform(mesh.geometry, morphParams, noiseMix, elapsed);
  }

  async function exportMorph() {
    if (!mesh) return { ok: false, reason: "No morphogenesis mesh." };

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const baseName =
      morphParams.shape === "model"
        ? `${(morphParams.modelFile || "model").replace(/\//g, "-")}-noise-${stamp}`
        : `${morphParams.shape}-noise-${stamp}`;
    const config = {
      version: 1,
      type: "morphogenesis",
      noiseMix,
      params: Object.fromEntries(EXPORT_PARAM_KEYS.map((k) => [k, morphParams[k]])),
    };

    downloadBlob(
      new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }),
      `${baseName}.json`
    );

    const exportMesh = mesh.clone();
    exportMesh.updateMatrixWorld(true);
    exportMesh.geometry = mesh.geometry.clone();
    exportMesh.geometry.applyMatrix4(exportMesh.matrixWorld);
    exportMesh.position.set(0, 0, 0);
    exportMesh.rotation.set(0, 0, 0);
    exportMesh.scale.set(1, 1, 1);

    const glb = await new Promise((resolve, reject) => {
      new GLTFExporter().parse(
        exportMesh,
        (result) => {
          if (result instanceof ArrayBuffer) resolve(result);
          else reject(new Error("Expected binary GLB"));
        },
        reject,
        { binary: true }
      );
    });

    exportMesh.geometry.dispose();
    downloadBlob(new Blob([glb], { type: "model/gltf-binary" }), `${baseName}.glb`);
    return { ok: true, baseName };
  }

  return {
    sync,
    applyLiveState,
    update: updateNoise,
    applyTransform: updateTransform,
    applyMaterial: () => {
      if (mesh) applyMaterialState(mesh.material);
    },
    loadCustomTexture,
    clearCustomTexture,
    refreshCustomTexture,
    hasCustomTexture: () => !!customTexture,
    dispose,
    getAnalysisMesh,
    getNoiseMix,
    snapNoiseMix,
    exportMorph,
    isActive: () => !!mesh,
  };
}
