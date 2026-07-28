import * as THREE from "three";

/**
 * Build a indexed parametric mesh with UV.u as the ring parameter for chamber analysis.
 */
export function buildParametricMesh({
  evaluate,
  uSegments,
  vSegments,
  uMin,
  uMax,
  vMin,
  vMax,
  shouldSkipVertex = () => false,
}) {
  const uCount = uSegments + 1;
  const vCount = vSegments + 1;
  const positions = [];
  const uvs = [];
  const valid = [];

  for (let j = 0; j < vCount; j++) {
    const v = vMin + (j / vSegments) * (vMax - vMin);
    for (let i = 0; i < uCount; i++) {
      const u = uMin + (i / uSegments) * (uMax - uMin);
      const point = evaluate(u, v);
      const skip = !point || shouldSkipVertex(u, v, point);
      valid.push(!skip);
      if (skip) {
        positions.push(0, 0, 0);
      } else {
        positions.push(point.x, point.y, point.z);
      }
      uvs.push(i / uSegments, j / vSegments);
    }
  }

  const indices = [];
  for (let j = 0; j < vSegments; j++) {
    for (let i = 0; i < uSegments; i++) {
      const a = j * uCount + i;
      const b = a + 1;
      const c = a + uCount;
      const d = c + 1;
      if (!valid[a] || !valid[b] || !valid[c] || !valid[d]) continue;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
