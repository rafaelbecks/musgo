/**
 * Pull dialogue out of an SRT file.
 * Cue numbers and timecode lines are discarded; text is kept in file order.
 * @param {string} source
 * @returns {string[]}
 */
export function parseSrt(source) {
  const lines = String(source ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  /** @type {string[]} */
  const cues = [];
  /** @type {string[]} */
  let buf = [];

  function flush() {
    if (!buf.length) return;
    const rows = buf.map((line) => line.trim()).filter(Boolean);
    buf = [];
    if (!rows.length) return;

    let start = 0;
    if (/^\d+$/.test(rows[0]) && rows[1]?.includes("-->")) start = 1;

    const body = [];
    for (let i = start; i < rows.length; i++) {
      if (rows[i].includes("-->")) continue;
      body.push(rows[i]);
    }

    const text = cleanCueText(body.join("\n"));
    if (text) cues.push(text);
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      flush();
      continue;
    }

    const next = lines[i + 1]?.trim() ?? "";
    const hasDialogue = buf.some((line) => {
      const row = line.trim();
      return row && !/^\d+$/.test(row) && !row.includes("-->");
    });
    if (/^\d+$/.test(trimmed) && next.includes("-->") && hasDialogue) {
      flush();
    }

    buf.push(lines[i]);
  }

  flush();
  return cues;
}

function cleanCueText(raw) {
  return raw
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
