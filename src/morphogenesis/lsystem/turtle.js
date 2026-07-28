import * as THREE from "three";

/**
 * 3D turtle interpreter (heading / left / up frame).
 * Emits polylines with per-vertex radii for tube meshing.
 *
 * Commands (ABOP-compatible subset):
 *   F  draw forward   f  move forward
 *   + − yaw   & ^ pitch   \ / roll   | turn around
 *   [ ] push/pop state
 *   ! taper radius
 */

const _yawQ = new THREE.Quaternion();
const _pitchQ = new THREE.Quaternion();
const _rollQ = new THREE.Quaternion();

/**
 * @typedef {{ points: THREE.Vector3[], radii: number[] }} TurtleStroke
 */

/**
 * @param {string} product
 * @param {object} opts
 * @param {number} opts.step
 * @param {number} opts.angleDeg
 * @param {number} opts.radius
 * @param {number} opts.taper          radius scale on `!`
 * @param {number} [opts.branchTaper=1] radius scale when pushing `[`
 * @param {number} [opts.lengthDecay=1]
 * @returns {TurtleStroke[]}
 */
export function interpretTurtle(product, opts) {
  const step0 = Math.max(1e-4, opts.step ?? 0.2);
  const angleRad = THREE.MathUtils.degToRad(opts.angleDeg ?? 25);
  const taper = Math.max(0.5, Math.min(0.99, opts.taper ?? 0.92));
  const branchTaper = Math.max(0.4, Math.min(1, opts.branchTaper ?? 1));
  const lengthDecay = Math.max(0.7, Math.min(1, opts.lengthDecay ?? 1));

  const pos = new THREE.Vector3(0, 0, 0);
  // Start heading +Y (plants grow up); shrimp will be rotated after fit
  const H = new THREE.Vector3(0, 1, 0);
  const L = new THREE.Vector3(-1, 0, 0);
  const U = new THREE.Vector3(0, 0, 1);

  let radius = Math.max(1e-4, opts.radius ?? 0.04);
  let step = step0;
  const stack = [];

  /** @type {TurtleStroke[]} */
  const strokes = [];
  /** @type {TurtleStroke | null} */
  let current = null;

  function startStroke() {
    current = {
      points: [pos.clone()],
      radii: [radius],
    };
  }

  function endStroke() {
    if (current && current.points.length >= 2) {
      strokes.push(current);
    }
    current = null;
  }

  function applyYaw(sign) {
    _yawQ.setFromAxisAngle(U, sign * angleRad);
    H.applyQuaternion(_yawQ);
    L.applyQuaternion(_yawQ);
  }

  function applyPitch(sign) {
    _pitchQ.setFromAxisAngle(L, sign * angleRad);
    H.applyQuaternion(_pitchQ);
    U.applyQuaternion(_pitchQ);
  }

  function applyRoll(sign) {
    _rollQ.setFromAxisAngle(H, sign * angleRad);
    L.applyQuaternion(_rollQ);
    U.applyQuaternion(_rollQ);
  }

  function moveForward(draw) {
    if (draw) {
      // Capture origin before stepping — otherwise isolated F's
      // (e.g. algae F[+F]F…) become zero-length tubes.
      if (!current) startStroke();
      pos.addScaledVector(H, step);
      current.points.push(pos.clone());
      current.radii.push(radius);
    } else {
      endStroke();
      pos.addScaledVector(H, step);
    }
  }

  const s = product ?? "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    switch (ch) {
      case "F":
        moveForward(true);
        break;
      case "f":
        moveForward(false);
        break;
      case "+":
        applyYaw(1);
        break;
      case "-":
        applyYaw(-1);
        break;
      case "&":
        applyPitch(1);
        break;
      case "^":
        applyPitch(-1);
        break;
      case "\\":
        applyRoll(1);
        break;
      case "/":
        applyRoll(-1);
        break;
      case "|":
        H.multiplyScalar(-1);
        L.multiplyScalar(-1);
        break;
      case "[":
        stack.push({
          pos: pos.clone(),
          H: H.clone(),
          L: L.clone(),
          U: U.clone(),
          radius,
          step,
        });
        endStroke();
        if (branchTaper < 1) {
          radius *= branchTaper;
          step *= Math.min(1, branchTaper + 0.15);
        }
        break;
      case "]": {
        const st = stack.pop();
        if (!st) break;
        endStroke();
        pos.copy(st.pos);
        H.copy(st.H);
        L.copy(st.L);
        U.copy(st.U);
        radius = st.radius;
        step = st.step;
        break;
      }
      case "!":
        radius *= taper;
        step *= lengthDecay;
        break;
      default:
        break;
    }
  }

  endStroke();
  return strokes;
}
