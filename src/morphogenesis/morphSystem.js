import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { USDLoader } from "three/addons/loaders/USDLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { morphParams } from "./morphParams.js";
import { createMorphGeometry, getMorphSide } from "./morphGeometries.js";
import {
  applyNoiseDeform,
  captureBaseGeometry,
} from "./noiseDeform.js";
import { modelFileFormat } from "../ui/modelFilePicker.js";

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
  "catenoidVSegments",
  "catenoidSpan",
  "catenoidDeform",
  "catenoidTwist",
  "catenoidMode",
  "catenoidStackCount",
  "catenoidStackSpacing",
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

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function sanitizeModelBaseName(name) {
  return (
    String(name ?? "model")
      .replace(/\.(glb|obj|usdz)$/i, "")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "model"
  );
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

function extractMaterialTextures(mat) {
  if (!mat) return { name: "Material", map: null, normalMap: null };
  return {
    name: mat.name || "Material",
    map: mat.map || null,
    normalMap: mat.normalMap || null,
  };
}

function cloneModelMaterial(mat) {
  return new THREE.MeshPhysicalMaterial({
    name: mat.name || "Material",
    color: mat.color?.clone?.() ?? new THREE.Color(0xffffff),
    map: mat.map || null,
    normalMap: mat.normalMap || null,
    roughness: mat.roughness ?? 0.5,
    metalness: mat.metalness ?? 0,
    transparent: mat.transparent ?? false,
    opacity: mat.opacity ?? 1,
    alphaMap: mat.alphaMap || null,
    side: THREE.FrontSide,
  });
}

function extractModelAsset(root) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && o.geometry) meshes.push(o);
  });
  if (!meshes.length) return null;

  if (meshes.length === 1) {
    const source = meshes[0];
    const geometry = source.geometry.clone();
    geometry.applyMatrix4(source.matrixWorld);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    const sourceMaterials = Array.isArray(source.material)
      ? source.material
      : [source.material];
    const materials = sourceMaterials.map((mat) => cloneModelMaterial(mat));
    return {
      geometry,
      materials,
      textureSlots: materials.map(extractMaterialTextures),
    };
  }

  const geometries = [];
  const materials = [];
  for (const source of meshes) {
    const geometry = source.geometry.clone();
    geometry.applyMatrix4(source.matrixWorld);
    geometries.push(geometry);
    const sourceMaterials = Array.isArray(source.material)
      ? source.material
      : [source.material];
    for (const mat of sourceMaterials) {
      materials.push(cloneModelMaterial(mat));
    }
  }

  const geometry = mergeGeometries(geometries, true);
  if (!geometry) return null;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return {
    geometry,
    materials,
    textureSlots: materials.map(extractMaterialTextures),
  };
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
  const modelAssetCache = new Map();
  let activeModelTextureSlots = null;
  let activeModelUsesMultiMaterial = false;
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

  let modelTextureSuspendedByWireframe = false;

  function modelHasTexture() {
    return (
      morphParams.shape === "model" &&
      !!activeModelTextureSlots?.some((slot) => slot.map || slot.normalMap)
    );
  }

  function suspendModelTextureForWireframe() {
    if (!modelHasTexture() || !morphParams.modelUseOriginalTexture) return false;
    modelTextureSuspendedByWireframe = true;
    morphParams.modelUseOriginalTexture = false;
    if (mesh) applyMaterialState(mesh.material);
    return true;
  }

  function restoreModelTextureAfterWireframe() {
    if (!modelTextureSuspendedByWireframe) return false;
    modelTextureSuspendedByWireframe = false;
    morphParams.modelUseOriginalTexture = true;
    if (mesh) applyMaterialState(mesh.material);
    return true;
  }

  /**
   * Align model texture with the current wireframe flag.
   * - preferTexture: user picked a textured model → texture wins (wireframe off)
   * - otherwise: respect wireframe (organism / manual toggle)
   */
  function reconcileModelTextureAndWireframe({ preferTexture = false } = {}) {
    if (!modelHasTexture()) {
      if (!viewerParams.wireframe && modelTextureSuspendedByWireframe) {
        restoreModelTextureAfterWireframe();
      }
      return false;
    }

    if (preferTexture) {
      if (viewerParams.wireframe) {
        viewerParams.wireframe = false;
        onViewerChange?.();
      }
      if (modelTextureSuspendedByWireframe) {
        restoreModelTextureAfterWireframe();
      } else if (!morphParams.modelUseOriginalTexture) {
        morphParams.modelUseOriginalTexture = true;
        if (mesh) applyMaterialState(mesh.material);
      }
      return true;
    }

    if (viewerParams.wireframe) {
      return suspendModelTextureForWireframe();
    }
    return restoreModelTextureAfterWireframe();
  }

  function preferTexturedModelView() {
    return reconcileModelTextureAndWireframe({ preferTexture: true });
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

  function disposeMeshMaterials(target) {
    if (!target?.material) return;
    if (Array.isArray(target.material)) {
      for (const mat of target.material) mat.dispose();
    } else {
      target.material.dispose();
    }
  }

  function applyMaterialState(material) {
    if (Array.isArray(material)) {
      for (let i = 0; i < material.length; i++) {
        applyMaterialStateSingle(material[i], activeModelTextureSlots?.[i] ?? null);
      }
      return;
    }
    const slot =
      activeModelTextureSlots?.[0] ??
      (material.map || material.normalMap ? extractMaterialTextures(material) : null);
    applyMaterialStateSingle(material, slot);
  }

  function applyMaterialStateSingle(material, modelSlot) {
    const glass = morphParams.glassEnabled;
    const isModel = morphParams.shape === "model";
    const hasCustom = morphParams.customTextureEnabled && customTexture;
    const role = morphParams.customTextureRole;
    const roleIsColor =
      role === "color" || role === "color map" || role === "color+normal" || role === "color + normal";
    const roleIsNormal =
      role === "normal" || role === "normal map" || role === "color+normal" || role === "color + normal";
    const useCustomColor =
      hasCustom && morphParams.customTextureIntensity > 0 && roleIsColor;
    const useCustomNormal = hasCustom && roleIsNormal;
    const useModelColor =
      isModel &&
      morphParams.modelUseOriginalTexture &&
      modelSlot?.map &&
      morphParams.modelTextureIntensity > 0 &&
      !useCustomColor;
    const useModelNormal =
      isModel &&
      morphParams.modelUseOriginalTexture &&
      modelSlot?.normalMap &&
      !useCustomNormal;
    const surfaceMix = useCustomColor
      ? morphParams.customTextureIntensity
      : useModelColor
        ? morphParams.modelTextureIntensity
        : 0;
    const hasSurfaceMap = useCustomColor || useModelColor;

    material.side = getMorphSide(morphParams.side);
    material.wireframe = viewerParams.wireframe;

    _surfaceTint.set(morphParams.color);
    _surfaceTint.lerp(new THREE.Color(0xffffff), surfaceMix);
    material.color.copy(_surfaceTint);

    if (glass) {
      material.metalness = morphParams.glassMetalness;
      material.roughness = morphParams.glassRoughness;
      material.transmission = hasSurfaceMap
        ? THREE.MathUtils.lerp(
            morphParams.glassTransmission,
            Math.min(morphParams.glassTransmission, 0.15),
            surfaceMix
          )
        : morphParams.glassTransmission;
      material.ior = morphParams.glassIor;
      material.thickness = morphParams.glassThickness;
      material.envMapIntensity = morphParams.glassEnvMapIntensity;
      material.clearcoat = morphParams.glassClearcoat;
      material.clearcoatRoughness = morphParams.glassClearcoatRoughness;
      material.transparent = morphParams.glassTransparent;
      const normalTex = useCustomNormal
        ? customTexture
        : useModelNormal
          ? modelSlot.normalMap
          : normalMapTexture;
      if (useCustomNormal) {
        normalTex.repeat.set(
          morphParams.customTextureRepeatU,
          morphParams.customTextureRepeatV
        );
      } else if (!useModelNormal) {
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
      } else if (useModelNormal) {
        material.normalMap = modelSlot.normalMap;
        material.normalScale.set(1, 1);
      } else {
        material.normalMap = null;
        material.normalScale.set(1, 1);
      }
      material.clearcoatNormalMap = null;
      material.clearcoatNormalScale.set(1, 1);
    }

    if (useCustomColor) {
      material.map = customTexture;
      customTexture.colorSpace = THREE.SRGBColorSpace;
    } else if (useModelColor) {
      material.map = modelSlot.map;
      if (modelSlot.map) {
        modelSlot.map.colorSpace = THREE.SRGBColorSpace;
      }
    } else {
      material.map = null;
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

  function assignGeometry(geometry, modelMaterials = null) {
    ensureGeometryUVs(geometry);
    const useModelMaterials =
      morphParams.shape === "model" &&
      Array.isArray(modelMaterials) &&
      modelMaterials.length > 0;

    activeModelUsesMultiMaterial = useModelMaterials && modelMaterials.length > 1;

    if (mesh) {
      disposeMeshMaterials(mesh);
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      if (useModelMaterials) {
        mesh.material =
          modelMaterials.length === 1
            ? modelMaterials[0].clone()
            : modelMaterials.map((mat) => mat.clone());
      } else {
        mesh.material = createMaterial();
      }
      applyMaterialState(mesh.material);
    } else {
      mesh = new THREE.Mesh(
        geometry,
        useModelMaterials
          ? modelMaterials.length === 1
            ? modelMaterials[0].clone()
            : modelMaterials.map((mat) => mat.clone())
          : createMaterial()
      );
      applyMaterialState(mesh.material);
      scene.add(mesh);
    }

    captureBaseGeometry(mesh.geometry);
    applyNoiseDeform(mesh.geometry, morphParams, noiseMix, elapsed);
    updateTransform();
  }

  const objLoader = new OBJLoader();
  const usdLoader = new USDLoader();
  /** @type {Map<string, { format: string, fileName: string, data: ArrayBuffer }>} */
  const importedSourceStore = new Map();

  function resolveModelAsset(modelFile, asset) {
    modelAssetCache.set(modelFile, {
      geometry: asset.geometry,
      materials: asset.materials.map((mat) => mat.clone()),
      textureSlots: asset.textureSlots,
    });
    return {
      geometry: fitModelGeometry(
        asset.geometry.clone(),
        morphParams.extent,
        morphParams.envelopeRadius
      ),
      materials: asset.materials.map((mat) => mat.clone()),
      textureSlots: asset.textureSlots,
    };
  }

  function loadModelRootFromUrl(url, format) {
    return new Promise((resolve, reject) => {
      const onLoaded = (root) => {
        const asset = extractModelAsset(root);
        if (!asset) {
          reject(new Error("No mesh in model file"));
          return;
        }
        resolve(asset);
      };

      if (format === "obj") {
        objLoader.load(url, onLoaded, undefined, reject);
        return;
      }

      if (format === "usdz") {
        usdLoader.load(
          url,
          onLoaded,
          undefined,
          (err) => reject(normalizeUsdzError(err))
        );
        return;
      }

      glbLoader.load(url, (gltf) => onLoaded(gltf.scene), undefined, reject);
    });
  }

  function normalizeUsdzError(err) {
    const msg = String(err?.message || err || "");
    if (
      /Cannot set properties of undefined/i.test(msg) ||
      /Invalid USDZ|Failed to parse root layer|USDC/i.test(msg)
    ) {
      return new Error(
        "Couldn’t load this USDZ (often binary USDC from Object Capture). Try exporting GLB from Blender, or use a newer Three.js USD loader."
      );
    }
    return err instanceof Error ? err : new Error(msg || "USDZ load failed");
  }

  /**
   * Prefer parsing from bytes (needed for reliable USDZ / USDC).
   */
  function loadModelRootFromBuffer(buffer, format) {
    return new Promise((resolve, reject) => {
      const onLoaded = (root) => {
        try {
          const asset = extractModelAsset(root);
          if (!asset) {
            reject(new Error("No mesh in model file"));
            return;
          }
          resolve(asset);
        } catch (err) {
          reject(err);
        }
      };

      try {
        if (format === "obj") {
          const text = new TextDecoder().decode(buffer);
          onLoaded(objLoader.parse(text));
          return;
        }

        if (format === "usdz") {
          // three ≥ 0.185: real USDC crate support. Geometry is sync; textures async.
          let group = null;
          let settled = false;
          const finish = (root) => {
            if (settled) return;
            settled = true;
            onLoaded(root);
          };
          group = usdLoader.parse(
            buffer,
            "",
            (g) => finish(g),
            (err) => {
              console.warn("[morph] USDZ texture load issue:", err);
              if (group) finish(group);
              else reject(normalizeUsdzError(err));
            }
          );
          if (!group) {
            reject(new Error("USDLoader returned empty"));
          }
          return;
        }

        glbLoader.parse(buffer, "", (gltf) => onLoaded(gltf.scene), reject);
      } catch (err) {
        reject(format === "usdz" ? normalizeUsdzError(err) : err);
      }
    });
  }

  function loadModelAsset(modelFile) {
    const cached = modelAssetCache.get(modelFile);
    if (cached) {
      return Promise.resolve({
        geometry: fitModelGeometry(
          cached.geometry.clone(),
          morphParams.extent,
          morphParams.envelopeRadius
        ),
        materials: cached.materials.map((mat) => mat.clone()),
        textureSlots: cached.textureSlots,
      });
    }

    const embedded = importedSourceStore.get(modelFile);
    if (embedded) {
      return loadModelRootFromBuffer(embedded.data, embedded.format).then((asset) =>
        resolveModelAsset(modelFile, asset)
      );
    }

    return loadModelRootFromUrl(`./glb/${modelFile}.glb`, "glb").then((asset) =>
      resolveModelAsset(modelFile, asset)
    );
  }

  function storeImportedSource(modelFile, { format, fileName, data }) {
    importedSourceStore.set(modelFile, {
      format,
      fileName,
      data,
    });
  }

  async function loadModelFromFile(file) {
    const format = modelFileFormat(file);
    const baseName = sanitizeModelBaseName(file.name);
    const modelFile = `imported/${baseName}`;
    const data = await file.arrayBuffer();

    const asset = await loadModelRootFromBuffer(data, format);
    storeImportedSource(modelFile, {
      format,
      fileName: file.name || `${baseName}.${format}`,
      data,
    });
    return { modelFile, asset: resolveModelAsset(modelFile, asset) };
  }

  /**
   * Embeddable payload for .organism save (imported models only).
   * @returns {{ format: string, fileName: string, encoding: string, data: string, modelFile: string } | null}
   */
  function getModelAssetForSave() {
    if (morphParams.shape !== "model") return null;
    const modelFile = morphParams.modelFile;
    if (!modelFile || !String(modelFile).startsWith("imported/")) return null;
    const stored = importedSourceStore.get(modelFile);
    if (!stored?.data) return null;
    return {
      modelFile,
      format: stored.format,
      fileName: stored.fileName,
      encoding: "base64",
      data: arrayBufferToBase64(stored.data),
    };
  }

  /**
   * Restore an embedded model from a .organism `modelAsset` block.
   * @returns {Promise<{ modelFile: string }>}
   */
  async function loadModelAssetFromOrganism(modelAsset) {
    if (!modelAsset?.data) {
      throw new Error("Organism modelAsset is missing data.");
    }
    const format = modelAsset.format || "glb";
    const fileName =
      modelAsset.fileName ||
      `${sanitizeModelBaseName(modelAsset.modelFile || "model")}.${format}`;
    const modelFile =
      modelAsset.modelFile ||
      `imported/${sanitizeModelBaseName(fileName)}`;
    const data =
      modelAsset.encoding === "base64"
        ? base64ToArrayBuffer(modelAsset.data)
        : modelAsset.data;

    storeImportedSource(modelFile, { format, fileName, data });
    // Drop stale geometry so rebuild pulls from the fresh source.
    modelAssetCache.delete(modelFile);
    await loadModelAsset(modelFile);
    return { modelFile };
  }

  async function rebuildGeometry(force = false) {
    const key = geometryConfigKey();
    if (!force && mesh && builtKey === key) return;

    if (morphParams.shape === "model") {
      const id = ++loadId;
      const modelFile = morphParams.modelFile || "cosos/pututu";
      try {
        const { geometry, materials, textureSlots } = await loadModelAsset(modelFile);
        if (id !== loadId) return;
        activeModelTextureSlots = textureSlots;
        assignGeometry(geometry, materials);
        reconcileModelTextureAndWireframe();
        builtKey = key;
      } catch (err) {
        if (id !== loadId) return;
        activeModelTextureSlots = null;
        activeModelUsesMultiMaterial = false;
        console.error("[morph] failed to load model", modelFile, err);
      }
      return;
    }

    activeModelTextureSlots = null;
    activeModelUsesMultiMaterial = false;

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
    disposeMeshMaterials(mesh);
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

  function exportBaseName() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return morphParams.shape === "model"
      ? `${(morphParams.modelFile || "model").replace(/\//g, "-")}-noise-${stamp}`
      : `${morphParams.shape}-noise-${stamp}`;
  }

  function prepareExportMesh() {
    const exportMesh = mesh.clone();
    exportMesh.updateMatrixWorld(true);
    exportMesh.geometry = mesh.geometry.clone();
    exportMesh.geometry.applyMatrix4(exportMesh.matrixWorld);
    exportMesh.position.set(0, 0, 0);
    exportMesh.rotation.set(0, 0, 0);
    exportMesh.scale.set(1, 1, 1);
    return exportMesh;
  }

  function exportMorphJson() {
    if (!mesh) return { ok: false, reason: "No morphogenesis mesh." };
    const baseName = exportBaseName();
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
    return { ok: true, baseName };
  }

  async function exportMorphGlb() {
    if (!mesh) return { ok: false, reason: "No morphogenesis mesh." };
    const baseName = exportBaseName();
    const exportMesh = prepareExportMesh();
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

  function exportMorphObj() {
    if (!mesh) return { ok: false, reason: "No morphogenesis mesh." };
    const baseName = exportBaseName();
    const exportMesh = prepareExportMesh();
    const obj = new OBJExporter().parse(exportMesh);
    exportMesh.geometry.dispose();
    downloadBlob(new Blob([obj], { type: "text/plain" }), `${baseName}.obj`);
    return { ok: true, baseName };
  }

  async function exportMorph() {
    const json = exportMorphJson();
    if (!json.ok) return json;
    return exportMorphGlb();
  }

  return {
    sync,
    applyLiveState,
    update: updateNoise,
    applyTransform: updateTransform,
    applyMaterial: () => {
      if (mesh) applyMaterialState(mesh.material);
    },
    suspendModelTextureForWireframe,
    restoreModelTextureAfterWireframe,
    reconcileModelTextureAndWireframe,
    preferTexturedModelView,
    loadCustomTexture,
    loadModelFromFile,
    loadModelAssetFromOrganism,
    getModelAssetForSave,
    clearCustomTexture,
    refreshCustomTexture,
    hasCustomTexture: () => !!customTexture,
    hasModelTexture: () =>
      morphParams.shape === "model" &&
      !!activeModelTextureSlots?.some((slot) => slot.map || slot.normalMap),
    getModelTextureLabels: () =>
      activeModelTextureSlots?.map((slot) => slot.name).filter(Boolean) ?? [],
    usesMultiModelMaterial: () => activeModelUsesMultiMaterial,
    dispose,
    getAnalysisMesh,
    getNoiseMix,
    snapNoiseMix,
    exportMorph,
    exportMorphGlb,
    exportMorphObj,
    exportMorphJson,
    isActive: () => !!mesh,
  };
}
