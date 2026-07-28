// Parsers for the bot's result messages.
//
// The bot emits `dimension_result` + `overall_result` as plain template text
// (so WhatsApp gets readable markdown-style `*bold*`). On the web we detect
// that shape and render a richer card + chart instead of the raw string.
//
// Extracted from AssessmentChat so the shapes can be unit-tested: a parser
// that silently fails just drops the chart, with no error anywhere.

export type DimensionResult = { title: string; score: string; max: string; band: string; body: string };

export function parseDimensionResult(text: string): DimensionResult | null {
  const lines = text.split("\n").map((l) => l.trim());
  const header = lines[0];
  if (!header) return null;

  // New format: *Title* — Score / Max · Band
  const headerMatch = header.match(/^\*(.+)\*\s*[—\-]\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*·\s*(.+)$/);
  if (headerMatch) {
    const title = headerMatch[1]!.trim();
    const score = headerMatch[2]!;
    const max = headerMatch[3]!;
    const band = headerMatch[4]!.trim();
    const body = lines.slice(1).join("\n").trim();
    return { title, score, max, band, body };
  }

  // Fallback to old format if needed
  const title = header.match(/^\*(.+)\*$/)?.[1];
  if (!title) return null;
  const scoreLine = lines.find((l) => /^Your score:/i.test(l));
  const bandLine = lines.find((l) => /^Band:/i.test(l));
  if (!scoreLine || !bandLine) return null;
  const m = scoreLine.match(/Your score:\s*(\S+)\s*\/\s*(\S+)/i);
  if (!m) return null;
  const band = bandLine.replace(/^Band:\s*/i, "").trim();
  const startIdx = lines.indexOf(bandLine) + 1;
  const body = lines.slice(startIdx).join("\n").trim();
  return { title, score: m[1]!, max: m[2]!, band, body };
}

export type OverallResult = {
  title: string;
  sections: Array<{ label: string; score: string; max: string }>;
  overallScore?: string;
  overallMax?: string;
  bandLabel?: string;
  body: string;
  dimensions?: Array<{ name: string; score: number; maxScore: number; band: string }>;
};

export function parseOverallResult(text: string): OverallResult | null {
  const lines = text.split("\n").map((l) => l.trim());
  const header = lines[0];
  if (!header) return null;

  // Title is usually *BOLD*
  const titleMatch = header.match(/^\*(.+)\*$/);
  if (!titleMatch) return null;
  const title = titleMatch[1]!.trim();

  const sections: OverallResult["sections"] = [];
  let overallScore: string | undefined;
  let overallMax: string | undefined;
  let bandLabel: string | undefined;
  const interpretationLines: string[] = [];
  let seenAll = false;

  for (const line of lines.slice(1)) {
    if (!line) continue;

    // Matches "OVERALL: 10 / 20" or "Total: 10 / 20"
    const overallMatch = line.match(/^(?:OVERALL|Total)\s*[:—\-]\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i);
    // Matches "Readiness Level: XYZ" or "Band: XYZ"
    const bandMatch = line.match(/^(?:Readiness Level|Band)\s*[:—\-]\s*(.+)/i);

    // Any "<label>: 10 / 20" line before the total is a dimension row. Kept
    // label-agnostic on purpose: dimension names are DB content, so matching a
    // literal "Section N" would silently drop the chart for any instrument
    // that titles its dimensions differently (e.g. the team diagnostic's
    // "Cognitive Clarity"). Guards: only before the total line, short label,
    // and the whole line must be just "label: n / m" so prose can't match.
    const secMatch =
      overallMatch || bandMatch || seenAll
        ? null
        : line.match(
          /^([A-Za-z][A-Za-z0-9 '&./-]{0,39}?)\s*[:—\-]\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/,
        );

    if (overallMatch) {
      overallScore = overallMatch[1];
      overallMax = overallMatch[2];
      seenAll = true;
    } else if (bandMatch) {
      bandLabel = bandMatch[1]!.trim();
      seenAll = true;
    } else if (secMatch) {
      sections.push({ label: secMatch[1]!.trim(), score: secMatch[2]!, max: secMatch[3]! });
    } else if (seenAll) {
      interpretationLines.push(line);
    }
  }

  if (sections.length === 0 && !overallScore) return null;

  return {
    title,
    sections,
    overallScore,
    overallMax,
    bandLabel,
    body: interpretationLines.join("\n").trim(),
    dimensions: sections.map((s) => ({
      name: s.label,
      score: parseFloat(s.score),
      maxScore: parseFloat(s.max),
      band: "", // Not used in small chart
    })),
  };
}

