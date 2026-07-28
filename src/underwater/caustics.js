import * as THREE from "three";

/**
 * Animated procedural caustic pattern (interference) as a CanvasTexture,
 * for SpotLight.map and MeshPhysicalMaterial onBeforeCompile sampling.
 */
export function createCausticTexture(size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  let time = 0;

  function update(delta, speed = 1) {
    time += delta * speed;
    const img = ctx.createImageData(size, size);
    const data = img.data;
    const t = time;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const a =
          Math.sin(u * 12.0 + t * 0.7 + Math.sin(v * 9.0 - t * 0.5)) *
          Math.sin(v * 11.0 - t * 0.6 + Math.sin(u * 8.0 + t * 0.4));
        const b =
          Math.sin(u * 18.0 - t * 0.9 + Math.cos(v * 14.0 + t * 0.3)) *
          Math.sin(v * 16.0 + t * 0.8 + Math.cos(u * 13.0 - t * 0.5));
        const c = Math.sin((u + v) * 22.0 + t) * Math.sin((u - v) * 19.0 - t * 0.7);
        let n = Math.max(0, a * 0.45 + b * 0.35 + c * 0.2);
        n = Math.pow(n, 2.2);
        const i = (y * size + x) * 4;
        const bright = Math.min(255, n * 255 * 1.8);
        data[i] = bright * 0.55;
        data[i + 1] = bright * 0.85;
        data[i + 2] = Math.min(255, bright * 1.15);
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    texture.needsUpdate = true;
  }

  update(0);

  return {
    texture,
    update,
    dispose() {
      texture.dispose();
    },
  };
}

/**
 * Injects additive caustic sampling into MeshPhysicalMaterial without replacing it.
 */
export function attachCausticsToMaterial(material) {
  if (!material || material.isShaderMaterial) {
    return () => {};
  }

  const prev = material.onBeforeCompile;
  const prevCache = material.customProgramCacheKey?.bind(material);

  material.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    shader.uniforms.uwCausticMap = { value: null };
    shader.uniforms.uwCausticStrength = { value: 0 };
    shader.uniforms.uwCausticScale = { value: 0.35 };
    shader.uniforms.uwCausticEnabled = { value: 0 };
    shader.uniforms.uwCausticOffset = { value: new THREE.Vector2(0, 0) };

    material.userData.uwCausticUniforms = shader.uniforms;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
varying vec3 vUwWorldPos;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
vUwWorldPos = (modelMatrix * vec4( transformed, 1.0 )).xyz;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
uniform sampler2D uwCausticMap;
uniform float uwCausticStrength;
uniform float uwCausticScale;
uniform float uwCausticEnabled;
uniform vec2 uwCausticOffset;
varying vec3 vUwWorldPos;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <tonemapping_fragment>",
      `if (uwCausticEnabled > 0.5) {
  vec2 cuv = vUwWorldPos.xz * uwCausticScale + uwCausticOffset;
  vec3 caustic = texture2D(uwCausticMap, cuv).rgb;
  gl_FragColor.rgb += caustic * uwCausticStrength;
}
#include <tonemapping_fragment>`
    );
  };

  material.customProgramCacheKey = () =>
    `${prevCache?.() ?? material.uuid}-uw-caustics`;
  material.needsUpdate = true;

  return () => {
    material.onBeforeCompile = prev || null;
    material.customProgramCacheKey = prevCache || undefined;
    delete material.userData.uwCausticUniforms;
    material.needsUpdate = true;
  };
}

export function syncCausticUniforms(material, opts) {
  const u = material?.userData?.uwCausticUniforms;
  if (!u) return;
  if (opts.map != null && u.uwCausticMap) u.uwCausticMap.value = opts.map;
  if (u.uwCausticStrength) u.uwCausticStrength.value = opts.strength;
  if (u.uwCausticScale) u.uwCausticScale.value = opts.scale;
  if (u.uwCausticEnabled) u.uwCausticEnabled.value = opts.enabled ? 1 : 0;
  if (u.uwCausticOffset && opts.offsetX != null) {
    u.uwCausticOffset.value.set(opts.offsetX, opts.offsetY);
  }
}
