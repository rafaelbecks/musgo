/**
 * Tweakable splash fern background parameters.
 * Angle ping-pongs min→max→min at constant speed (no sine stall at the ends).
 */

/** L-system rewrite depth (plant grammar). */
export const FERN_ITERATIONS = 6;

/** Overall fern scale relative to the shorter viewport side. */
export const FERN_SIZE = 0.7;

/**
 * Vertical anchor of the fern base, as a fraction of viewport height.
 * 0 = top, 1 = bottom. Lower moves the plant up.
 */
export const FERN_ANCHOR_Y = 0.87;

/**
 * Sway speed in full cycles per second (min→max→min).
 * 0.2 ≈ one sway every 5s.
 */
export const FERN_MODULATION_HZ = 0.08;

/** Angle range (degrees). Playback always starts at FERN_ANGLE_MIN. */
export const FERN_ANGLE_MIN = 15;
export const FERN_ANGLE_MAX = 40;

/** Discrete angle samples (Path2D cache). More = finer steps. */
export const FERN_ANGLE_SAMPLES = 100;

/** Cap devicePixelRatio for the fern canvas (1 is plenty for a soft BG). */
export const FERN_DPR = 1;

/** Line appearance. */
export const FERN_STROKE_COLOR = "rgba(255, 255, 255, 0.6)";
export const FERN_LINE_WIDTH = 1;
