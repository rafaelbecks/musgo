import * as THREE from "three";
import { fitGeometryToSize } from "../lsystem/geometry.js";
import { createRng } from "./simulate.js";
import { DLA_ELEMENT_SHAPES, DLA_ELEMENT_SHAPE_LABELS } from "./constants.js";

export { DLA_ELEMENT_SHAPES, DLA_ELEMENT_SHAPE_LABELS };

/**
 * @param {string} shape
 * @param {number} radius  half-extent style size
 * @param {number} detail  0–2
 */
export function createElementPrototype(shape, radius, detail) {
  const d = Math.max(0, Math.min(2, Math.round(detail)));
  const r = Math.max(1e-4, radius);

  switch (shape) {
    case "box":
      return new THREE.BoxGeometry(r * 2, r * 2, r * 2);
    case "tetrahedron":
      return new THREE.TetrahedronGeometry(r * 1.35, d);
    case "octahedron":
      return new THREE.OctahedronGeometry(r * 1.2, d);
    case "cone":
      return new THREE.ConeGeometry(r, r * 2, 5 + d * 3, 1);
    case "cylinder":
      return new THREE.CylinderGeometry(r * 0.85, r * 0.85, r * 2, 6 + d * 3, 1);
    case "sphere":
    default:
      return new THREE.SphereGeometry(r, 6 + d * 4, 4 + d * 2);
  }
}

/**
 * Build a merged mesh of element shapes for each stuck DLA particle.
 * Stores element layout on `geometry.userData` for per-element noise.
 *
 * @param {{x:number,y:number,z:number}[]} particles  grid coords
 * @param {object} opts
 */
export function particlesToGeometry(particles, opts) {
  const radius = Math.max(0.2, opts.particleRadius ?? 0.85) * 0.5;
  const detail = Math.max(0, Math.min(2, Math.round(opts.meshDetail ?? 1)));
  const targetSize = Math.max(0.1, opts.targetSize ?? 1);
  const shape = DLA_ELEMENT_SHAPES.includes(opts.elementShape)
    ? opts.elementShape
    : "sphere";
  const orientAmount = Math.max(0, Math.min(1, opts.orientRandom ?? 1));
  const rng = createRng((opts.orientSeed ?? 42) + 7919);

  if (!particles.length) {
    const empty = createElementPrototype(shape, 0.05, 0);
    return fitGeometryToSize(empty, targetSize);
  }

  const proto = createElementPrototype(shape, radius, detail);
  // Ensure indexed topology when the builder left it non-indexed (polyhedra).
  if (!proto.index) {
    const n = proto.attributes.position.count;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    proto.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  proto.computeVertexNormals();

  const protoPos = proto.attributes.position;
  const protoNrm = proto.attributes.normal;
  const protoIdx = proto.index;
  const vertsPer = protoPos.count;
  const idxPer = protoIdx.count;
  const count = particles.length;

  const positions = new Float32Array(count * vertsPer * 3);
  const normals = new Float32Array(count * vertsPer * 3);
  const indices = new Uint32Array(count * idxPer);

  const _v = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _m4 = new THREE.Matrix4();
  const _m3 = new THREE.Matrix3();
  const doOrient = orientAmount > 0.001 && shape !== "sphere";

  for (let p = 0; p < count; p++) {
    const ox = particles[p].x;
    const oy = particles[p].y;
    const oz = particles[p].z;

    if (doOrient) {
      _e.set(
        (rng() * 2 - 1) * Math.PI * orientAmount,
        (rng() * 2 - 1) * Math.PI * orientAmount,
        (rng() * 2 - 1) * Math.PI * orientAmount
      );
      _q.setFromEuler(_e);
      _m3.setFromMatrix4(_m4.makeRotationFromQuaternion(_q));
    }

    const posBase = p * vertsPer * 3;
    for (let i = 0; i < vertsPer; i++) {
      _v.set(protoPos.getX(i), protoPos.getY(i), protoPos.getZ(i));
      _n.set(protoNrm.getX(i), protoNrm.getY(i), protoNrm.getZ(i));
      if (doOrient) {
        _v.applyQuaternion(_q);
        _n.applyMatrix3(_m3).normalize();
      }

      const o = posBase + i * 3;
      positions[o] = _v.x + ox;
      positions[o + 1] = _v.y + oy;
      positions[o + 2] = _v.z + oz;
      normals[o] = _n.x;
      normals[o + 1] = _n.y;
      normals[o + 2] = _n.z;
    }

    const vertBase = p * vertsPer;
    const idxBase = p * idxPer;
    for (let i = 0; i < idxPer; i++) {
      indices[idxBase + i] = protoIdx.getX(i) + vertBase;
    }
  }

  proto.dispose();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  // Element layout for per-particle noise (valid after fit — verts stay grouped).
  geometry.userData.elementVertsPer = vertsPer;
  geometry.userData.elementCount = count;

  return fitGeometryToSize(geometry, targetSize);
}
