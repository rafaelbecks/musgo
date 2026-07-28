/**
 * L-system grammar presets for organism-like forms.
 * Inspired by Lindenmayer systems / turtle interpretation
 * (see https://www.metafysica.nl/l_systems.html).
 */

export const LSYSTEM_PRESETS = ["shrimp", "plant", "bush", "algae"];

export const LSYSTEM_PRESET_LABELS = {
  shrimp: "shrimp",
  plant: "plant (fern)",
  bush: "bush",
  algae: "algae",
};

/**
 * Build a grammar for the given preset + morph params.
 * Shrimp: iterations grow body + antennae; lsystemSegments = modules added per step.
 * Plant/bush/algae: growth is driven by rewrite depth.
 */
export function resolveLSystemGrammar(preset, params = {}) {
  const segments = Math.max(1, Math.min(6, Math.round(params.lsystemSegments ?? 1)));
  const bodySeg = "F[+L]F[-L]";
  const bodyStep = bodySeg.repeat(segments);

  switch (preset) {
    case "shrimp":
      // Recursive body/antennae so iterations keep changing the form
      // (cf. metafysica shrimp: C→…C, U→F+…U).
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

    default:
      return resolveLSystemGrammar("plant", params);
  }
}
