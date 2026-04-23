// Results circle image generator (PRD §5.7). Renders an SVG with three
// segments coloured by band, then rasterises to PNG via sharp.
// Fallback (dynamic_image_gen feature flag OFF, or render failure) lives
// in the state machine — this module only does the happy-path render.

import sharp from "sharp";

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

const BG = "#FBF3DE";        // warm cream page/background
const STROKE = "#FBF3DE";    // slice dividers — match bg for clean breaks
const TEXT_DARK = "#2A1E17"; // primary ink
const TEXT_MUTED = "#8A7868";
const RIM = "#E7D8B5";       // subtle border ring

function buildSvg(segments: ReadonlyArray<CircleSegment>, size: number, title?: string): string {
  const cx = size / 2;
  const cy = size * 0.46;
  const r = size * 0.28;
  const n = segments.length;

  const paths = segments
    .map((seg, i) => {
      const start = (i / n) * 2 * Math.PI - Math.PI / 2;
      const end = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const large = end - start > Math.PI ? 1 : 0;
      const d = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;

      // Label on slice — centered on the bisector, ~55% out from centre so
      // long band labels don't crowd the rim or the centre point where all
      // three wedges meet.
      const mid = (start + end) / 2;
      const tx = cx + r * 0.55 * Math.cos(mid);
      const ty = cy + r * 0.55 * Math.sin(mid);
      const scoreSize = Math.round(size * 0.065);
      const maxSize = Math.round(size * 0.028);

      return `
        <path d="${d}" fill="${seg.colorHex}" stroke="${STROKE}" stroke-width="6" stroke-linejoin="round"/>
        <text x="${tx.toFixed(2)}" y="${(ty - scoreSize * 0.15).toFixed(2)}"
              text-anchor="middle" dominant-baseline="middle"
              font-family="'Inter','Helvetica Neue',Arial,sans-serif"
              font-size="${scoreSize}" fill="#FFFFFF" font-weight="800" letter-spacing="-1">
          ${seg.score}
        </text>
        <text x="${tx.toFixed(2)}" y="${(ty + scoreSize * 0.65).toFixed(2)}"
              text-anchor="middle" dominant-baseline="middle"
              font-family="'Inter','Helvetica Neue',Arial,sans-serif"
              font-size="${maxSize}" fill="rgba(255,255,255,0.82)" font-weight="600" letter-spacing="0.4">
          / ${seg.maxScore}
        </text>`;
    })
    .join("\n");

  // Centre medallion — a small cream disc that hides the point where the
  // three wedges meet and gives a clean focal anchor.
  const medallion = `
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.22).toFixed(2)}" fill="${BG}" stroke="${RIM}" stroke-width="2"/>
    <text x="${cx}" y="${(cy - size * 0.01).toFixed(2)}" text-anchor="middle" dominant-baseline="middle"
          font-family="'Inter','Helvetica Neue',Arial,sans-serif" font-size="${Math.round(size * 0.018)}"
          fill="${TEXT_MUTED}" font-weight="600" letter-spacing="2">
      READOUT
    </text>
    <text x="${cx}" y="${(cy + size * 0.022).toFixed(2)}" text-anchor="middle" dominant-baseline="middle"
          font-family="Georgia,'Times New Roman',serif" font-size="${Math.round(size * 0.032)}"
          fill="${TEXT_DARK}" font-style="italic">
      innergy
    </text>`;

  // Title — centered at top above the circle.
  const titleBlock = title
    ? `
      <text x="${cx}" y="${Math.round(size * 0.08)}" text-anchor="middle"
            font-family="Georgia,'Times New Roman',serif" font-size="${Math.round(size * 0.042)}"
            fill="${TEXT_DARK}" font-weight="600">
        ${escape(title)}
      </text>
      <text x="${cx}" y="${Math.round(size * 0.115)}" text-anchor="middle"
            font-family="'Inter','Helvetica Neue',Arial,sans-serif" font-size="${Math.round(size * 0.02)}"
            fill="${TEXT_MUTED}" letter-spacing="3" font-weight="600">
        FULL SPECTRUM LEADERSHIP
      </text>`
    : "";

  // Legend — a three-row panel below the circle. Each row: coloured pill +
  // section label + score + band.
  const legendTop = Math.round(size * 0.78);
  const rowH = Math.round(size * 0.055);
  const legend = segments
    .map((seg, i) => {
      const y = legendTop + i * rowH;
      return `
        <g transform="translate(${Math.round(size * 0.12)}, ${y})">
          <circle cx="10" cy="${rowH / 2 - 2}" r="9" fill="${seg.colorHex}" stroke="${STROKE}" stroke-width="2"/>
          <text x="30" y="${rowH / 2 + 3}" dominant-baseline="middle"
                font-family="'Inter','Helvetica Neue',Arial,sans-serif" font-size="${Math.round(size * 0.024)}"
                fill="${TEXT_DARK}" font-weight="600">
            ${escape(seg.label)}
          </text>
          <text x="${Math.round(size * 0.45)}" y="${rowH / 2 + 3}" dominant-baseline="middle"
                font-family="'Inter','Helvetica Neue',Arial,sans-serif" font-size="${Math.round(size * 0.024)}"
                fill="${TEXT_DARK}" font-weight="700" letter-spacing="0.5">
            ${seg.score}<tspan fill="${TEXT_MUTED}" font-weight="500"> / ${seg.maxScore}</tspan>
          </text>
          <text x="${Math.round(size * 0.6)}" y="${rowH / 2 + 3}" dominant-baseline="middle"
                font-family="'Inter','Helvetica Neue',Arial,sans-serif" font-size="${Math.round(size * 0.021)}"
                fill="${TEXT_MUTED}" letter-spacing="1.5" font-weight="700">
            ${escape(seg.bandLabel.toUpperCase())}
          </text>
        </g>`;
    })
    .join("\n");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <rect width="100%" height="100%" fill="${BG}"/>
      <rect x="8" y="8" width="${size - 16}" height="${size - 16}" rx="${Math.round(size * 0.04)}"
            fill="none" stroke="${RIM}" stroke-width="2"/>
      ${titleBlock}
      ${paths}
      ${medallion}
      ${legend}
    </svg>`;
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
