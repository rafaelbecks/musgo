/**
 * Parallel string rewriting for deterministic context-free L-systems.
 * Symbols not present in `rules` are copied through unchanged.
 */

/**
 * @param {string} axiom
 * @param {Record<string, string>} rules
 * @param {number} iterations
 * @param {number} [maxLength=120000] safety cap on product string
 */
export function rewriteLSystem(axiom, rules, iterations, maxLength = 120000) {
  let current = axiom ?? "";
  const n = Math.max(0, Math.floor(iterations));

  for (let i = 0; i < n; i++) {
    let next = "";
    for (let c = 0; c < current.length; c++) {
      const ch = current[c];
      next += rules[ch] ?? ch;
      if (next.length > maxLength) {
        return next.slice(0, maxLength);
      }
    }
    current = next;
  }

  return current;
}
