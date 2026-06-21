// Results image generator (PRD §5.7). Renders an SVG radar/spider chart of the
// three dimensions — each plotted as a fraction of its own max so the axes are
// comparable — then rasterises to PNG via sharp. Mirrors the web report card
// (AssessmentChat.tsx → AssessmentRadarChart + ResultsWidget).
// Fallback (dynamic_image_gen feature flag OFF, or render failure) lives in the
// state machine — this module only does the happy-path render.

import sharp from "sharp";
import fs from "fs";
import path from "path";

export interface CircleSegment {
  label: string;       // "Section 1"
  shortLabel: string;  // "CC"
  score: number;
  maxScore: number;
  bandLabel: string;
  colorHex: string;
}

export async function renderResultsCircle(
  segments: ReadonlyArray<CircleSegment>,
  opts: { size?: number; title?: string } = {},
): Promise<Buffer> {
  const size = opts.size ?? 800;
  const svg = buildSvg(segments, size, opts.title);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const BG = "#FCF8ED";        // warm cream card background
const TEXT_DARK = "#36211B"; // primary ink
const TEXT_MUTED = "#8A7868"; // muted label text
const RIM = "#E7D8B5";       // subtle border ring + inner guide lines
const RING_OUTER = "#D9C3A0"; // gold outermost ring
const PINK = "#FF3F64";      // data polygon
const ACCENT_YELLOW = "#FFDE59";

// 4-pointed sparkle star path (0,0 centered)
const STAR_PATH = "M 0,-10 C 1,-1 1,-1 10,0 C 1,1 1,1 0,10 C -1,1 -1,1 -10,0 C -1,-1 -1,-1 0,-10 Z";

function buildSvg(segments: ReadonlyArray<CircleSegment>, size: number, title?: string): string {
  const cx = size / 2;
  const cyR = size * 0.5;    // radar centre
  const R = size * 0.15;     // radar radius
  const n = segments.length;
  const rings = [0.25, 0.5, 0.75, 1];

  const angleOf = (i: number) => (-90 + (i * 360) / n) * (Math.PI / 180);
  const pointAt = (i: number, frac: number): [number, number] => {
    const a = angleOf(i);
    return [cx + R * frac * Math.cos(a), cyR + R * frac * Math.sin(a)];
  };
  const polyPoints = (frac: number | number[]) =>
    segments
      .map((_, i) =>
        pointAt(i, Array.isArray(frac) ? frac[i]! : frac)
          .map((v) => v.toFixed(1))
          .join(","),
      )
      .join(" ");

  const fracs = segments.map((s) => (s.maxScore > 0 ? Math.min(1, s.score / s.maxScore) : 0));

  // --- Radar geometry ---
  const ringPolys = rings
    .map((lvl, idx) => {
      const isOuter = idx === rings.length - 1;
      const dash = isOuter ? "" : ` stroke-dasharray="6 8"`;
      return `<polygon points="${polyPoints(lvl)}" fill="none" stroke="${isOuter ? RING_OUTER : RIM}" stroke-width="${isOuter ? 3 : 1.5}"${dash}/>`;
    })
    .join("\n");

  const spokes = segments
    .map((_, i) => {
      const [x, y] = pointAt(i, 1);
      return `<line x1="${cx}" y1="${cyR.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${RIM}" stroke-width="1.5"/>`;
    })
    .join("\n");

  const dataPoly = `<polygon points="${polyPoints(fracs)}" fill="${PINK}" fill-opacity="0.14" stroke="${PINK}" stroke-width="4"/>`;

  const labelLH = Math.round(size * 0.03);
  const axisLabels = segments
    .map((seg, i) => {
      const [lx, ly] = pointAt(i, 1.32);
      const a = angleOf(i);
      const anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
      const words = seg.label.split(" ");
      const startDy = -((words.length - 1) / 2) * labelLH;
      const tspans = words
        .map((w, wi) => `<tspan x="${lx.toFixed(1)}" dy="${wi === 0 ? startDy : labelLH}">${escape(w)}</tspan>`)
        .join("");
      return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle"
        font-family="'Montserrat', sans-serif" font-size="${Math.round(size * 0.024)}" font-weight="600" fill="${TEXT_DARK}">${tspans}</text>`;
    })
    .join("\n");

  const markerR = Math.round(size * 0.038);
  const markers = segments
    .map((seg, i) => {
      const [mx, my] = pointAt(i, fracs[i]!);
      const numColor = i === 2 ? TEXT_DARK : "#FFFFFF";
      return `
        <circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="${markerR}" fill="${seg.colorHex}" stroke="${BG}" stroke-width="3"/>
        <text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" dominant-baseline="central"
          font-family="'Montserrat', sans-serif" font-size="${Math.round(size * 0.03)}" font-weight="700" fill="${numColor}">${seg.score}</text>`;
    })
    .join("\n");

  // --- Header: logo (or text fallback) + subtitles ---
  let logoBlock = "";
  try {
    const logoAbsPath = path.join(process.cwd(), "public/logo.png");
    if (fs.existsSync(logoAbsPath)) {
      const logoDataUri = `data:image/png;base64,${fs.readFileSync(logoAbsPath, "base64")}`;
      const logoSize = Math.round(size * 0.14);
      logoBlock = `<image href="${logoDataUri}" x="${cx - logoSize / 2}" y="${Math.round(size * 0.025)}"
        width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet" />`;
    }
  } catch (err) {
    console.error("Failed to embed logo in SVG:", err);
  }
  const brandMark = title
    ? logoBlock ||
      `<g transform="translate(${cx}, ${Math.round(size * 0.085)})">
        <path d="${STAR_PATH}" fill="${ACCENT_YELLOW}" transform="translate(-82, -32) scale(0.75)"/>
        <text x="0" y="0" text-anchor="middle" font-family="'Fraunces', 'Playfair Display', serif"
          font-size="${Math.round(size * 0.052)}" fill="${TEXT_DARK}" font-weight="700">innergy</text>
      </g>`
    : "";

  const header = `
    ${brandMark}
    <text x="${cx}" y="${Math.round(size * 0.185)}" text-anchor="middle"
      font-family="'Montserrat', sans-serif" font-size="${Math.round(size * 0.018)}"
      fill="${TEXT_MUTED}" letter-spacing="3" font-weight="600">FULL SPECTRUM LEADERSHIP</text>
    <text x="${cx}" y="${Math.round(size * 0.225)}" text-anchor="middle"
      font-family="'Fraunces', 'Playfair Display', serif" font-size="${Math.round(size * 0.036)}"
      fill="${TEXT_DARK}" font-weight="700">Leadership Readiness</text>`;

  // --- Total readiness ---
  const overallScore = segments.reduce((sum, s) => sum + s.score, 0);
  const overallMax = segments.reduce((sum, s) => sum + s.maxScore, 0);
  const dividerX1 = Math.round(size * 0.14);
  const dividerX2 = Math.round(size * 0.86);
  const totalTop = Math.round(size * 0.63);
  const total = `
    <line x1="${dividerX1}" y1="${totalTop}" x2="${dividerX2}" y2="${totalTop}" stroke="${RIM}" stroke-width="1.5"/>
    <text x="${cx}" y="${totalTop + Math.round(size * 0.04)}" text-anchor="middle"
      font-family="'Montserrat', sans-serif" font-size="${Math.round(size * 0.016)}"
      fill="${TEXT_MUTED}" letter-spacing="4" font-weight="600">TOTAL READINESS</text>
    <text x="${cx}" y="${totalTop + Math.round(size * 0.09)}" text-anchor="middle"
      font-family="'Fraunces', 'Playfair Display', serif" font-size="${Math.round(size * 0.056)}"
      fill="${TEXT_DARK}" font-weight="700">${overallScore}<tspan dx="${Math.round(size * 0.01)}" font-family="'Montserrat', sans-serif" font-size="${Math.round(size * 0.03)}" font-weight="400" fill="${TEXT_MUTED}">/ ${overallMax}</tspan></text>`;

  // --- Legend rows: coloured dot + label (left), score / max (right) ---
  const rowsTop = Math.round(size * 0.745);
  const rowH = Math.round(size * 0.06);
  const rows = segments
    .map((seg, i) => {
      const y = rowsTop + i * rowH;
      return `
        <line x1="${dividerX1}" y1="${y}" x2="${dividerX2}" y2="${y}" stroke="${RIM}" stroke-width="1.5"/>
        <circle cx="${dividerX1 + 12}" cy="${y + rowH / 2}" r="7" fill="${seg.colorHex}"/>
        <text x="${dividerX1 + 32}" y="${y + rowH / 2}" dominant-baseline="middle"
          font-family="'Montserrat', sans-serif" font-size="${Math.round(size * 0.024)}"
          fill="${TEXT_DARK}" font-weight="500">${escape(seg.label)}</text>
        <text x="${dividerX2}" y="${y + rowH / 2}" text-anchor="end" dominant-baseline="middle"
          font-family="'Montserrat', sans-serif" font-size="${Math.round(size * 0.024)}"
          fill="${TEXT_DARK}" font-weight="700">${seg.score}<tspan dx="${Math.round(size * 0.008)}" fill="${TEXT_MUTED}" font-weight="400">/ ${seg.maxScore}</tspan></text>`;
    })
    .join("\n");
  const rowsBottom = rowsTop + n * rowH;
  const rowsClose = `<line x1="${dividerX1}" y1="${rowsBottom}" x2="${dividerX2}" y2="${rowsBottom}" stroke="${RIM}" stroke-width="1.5"/>`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <rect width="100%" height="100%" fill="${BG}"/>
      <rect x="8" y="8" width="${size - 16}" height="${size - 16}" rx="${Math.round(size * 0.04)}"
            fill="none" stroke="${RIM}" stroke-width="2"/>
      ${header}
      ${ringPolys}
      ${spokes}
      ${dataPoly}
      ${axisLabels}
      ${markers}
      ${total}
      ${rows}
      ${rowsClose}
    </svg>`;
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
