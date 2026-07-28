import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Build a tube mesh for each turtle stroke and merge into one BufferGeometry.
 */

/**
 * @param {import("./turtle.js").TurtleStroke[]} strokes
 * @param {object} opts
 * @param {number} opts.radialSegments
 * @param {number} [opts.tubularPerStep=4]
 */
export function strokesToGeometry(strokes, opts) {
  const radialSegments = Math.max(3, Math.floor(opts.radialSegments ?? 6));
  const tubularPerStep = Math.max(1, Math.floor(opts.tubularPerStep ?? 3));
  const geos = [];

  for (const stroke of strokes) {
    if (!stroke.points || stroke.points.length < 2) continue;

    const geo = strokeToTube(stroke, radialSegments, tubularPerStep);
    if (geo) geos.push(geo);
  }

  if (!geos.length) {
    return new THREE.SphereGeometry(0.05, 8, 8);
  }

  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();

  if (!merged) {
    return new THREE.SphereGeometry(0.05, 8, 8);
  }

  return merged;
}

function strokeToTube(stroke, radialSegments, tubularPerStep) {
  const pts = stroke.points;
  const radii = stroke.radii;
  const n = pts.length;
  if (n < 2) return null;

  // Average radius along stroke for TubeGeometry (constant radius)
  let rSum = 0;
  for (let i = 0; i < radii.length; i++) rSum += radii[i];
  const radius = Math.max(1e-4, rSum / radii.length);

  let curve;
  try {
    curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
  } catch {
    return null;
  }

  const tubularSegments = Math.max(n - 1, (n - 1) * tubularPerStep);
  const geo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);

  // UV.x ~ path length, UV.y ~ around tube (useful if analysis ever needs it)
  return geo;
}

/**
 * Center geometry and uniformly scale so its max AABB extent matches `targetSize`.
 */
export function fitGeometryToSize(geometry, targetSize) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return geometry;

  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  geometry.translate(-center.x, -center.y, -center.z);

  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
  const s = targetSize / maxDim;
  geometry.scale(s, s, s);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  return geometry;
}
