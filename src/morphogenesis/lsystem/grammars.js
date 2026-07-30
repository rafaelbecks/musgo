/**
 * L-system grammar presets for organism-like forms.
 * Inspired by Lindenmayer systems / turtle interpretation
 * (see https://www.metafysica.nl/l_systems.html).
 */

export const LSYSTEM_PRESETS = [
  "shrimp",
  "shrimpMetafysica",
  "plant",
  "bush",
  "algae",
  "dragon",
];

export const LSYSTEM_PRESET_LABELS = {
  shrimp: "shrimp",
  shrimpMetafysica: "weird fish",
  plant: "plant (fern)",
  bush: "bush",
  algae: "algae",
  dragon: "dragon curve",
};

/** Presets that read better with body along +X after fit. */
export const LSYSTEM_HORIZONTAL_PRESETS = new Set([
  "shrimp",
  "shrimpMetafysica",
]);

/**
 * Build a grammar for the given preset + morph params.
 * Shrimp: iterations grow body + antennae; lsystemSegments = modules added per step.
 * Other presets: growth is driven by rewrite depth.
 */
export function resolveLSystemGrammar(preset, params = {}) {
  const segments = Math.max(1, Math.min(6, Math.round(params.lsystemSegments ?? 1)));
  const bodySeg = "F[+L]F[-L]";
  const bodyStep = bodySeg.repeat(segments);

  switch (preset) {
    case "shrimp":
      // Simplified custom shrimp (kept as-is). Not a port of the metafysica example.
      return {
        axiom: "A",
        angle: 16,
        rules: {
          A: "TBH",
          // Tail fan (terminals after one rewrite)
          T: "&&&FF[+F+F][-F-F]FFF",
          // Each iteration appends `segments` body modules, then continues
          B: `${bodyStep}B`,
          // Head once; antennae keep extending via X/Y
          H: "FF[^^^X][&&&Y]",
          X: "F+X",
          Y: "F-Y",
          // Leg with knee + claw (terminals)
          L: "F&F[+fF][-fF]",
        },
      };

    case "shrimpMetafysica":
      // Structural port of metafysica.nl / L-parser shrimp (lsys00n.ls).
      // https://www.metafysica.nl/l_systems.html
      // Original axiom [c|H]AP[CD][?(1.6)U], angle 10°, depth ~12.
      // Dropped L-parser-only ops: ?(scale), +(deg), ; : width, c/> color,
      // % cut, {} polygon fill. Z→F; +(5) at 10° → +++++ ; claw {} → branched tip.
      // Try iterations 8–12 for a recognizable arthropod.
      return {
        axiom: "[|H]AP[CD][U]",
        angle: 10,
        rules: {
          // Head crest — recursive paired whiskers (H=[^^^S]%[^^^S]>>>H)
          H: "[^^^S][^^^S]///H",
          S: "F!S",
          // Thorax stub (A=[?(1.4)F]F?(0.6)F?(1.7))
          A: "FFF",
          // Antennae pair (P→Q→ MN + claw L)
          P: "FQ",
          Q: "[^^^^^^^^^MN][&&&&&&&&&MN]",
          M: "F+M",
          N: "L--L",
          // Chela — polygon {--z++z++z…} ≈ branched tip
          L: "[--+F++F++F--+|--+F++F++F]",
          // Body segments with legs + tapering ridge (C=F[R][E]+(5)C)
          C: "F[R][E]+++++C",
          E: "F!E",
          R: "[^^^^^^^^^BL][&&&&&&&&&BL]",
          B: "F+!B",
          // Tail + claws (D=[+(5)F+(5);(0.1)DGI])
          D: "[+++++F+++++DGI]",
          G: "F!F!F!F!F!F!F",
          I: "[T++++F][O----F]",
          T: "F+^!T",
          O: "F-^!O",
          // Curved abdomen (U=F+(5)U)
          U: "F+++++U",
        },
      };

    case "plant":
      // Classic fern-like branching (ABOP-style)
      return {
        axiom: "X",
        angle: 25,
        rules: {
          X: "F+[[X]-X]-F[-FX]+X",
          F: "FF",
        },
      };

    case "bush":
      return {
        axiom: "F",
        angle: 22.5,
        rules: {
          F: "FF-[-F+F+F]+[+F-F-F]",
        },
      };

    case "algae":
      // Soft underwater fronds — recursive trifurcation
      return {
        axiom: "F",
        angle: 28,
        rules: {
          F: "F[+F]F[-F][&F]F",
        },
      };

    case "dragon":
      // Classic Heighway dragon curve (planar)
      return {
        axiom: "FX",
        angle: 90,
        rules: {
          X: "X+YF+",
          Y: "-FX-Y",
        },
      };

    default:
      return resolveLSystemGrammar("plant", params);
  }
}
