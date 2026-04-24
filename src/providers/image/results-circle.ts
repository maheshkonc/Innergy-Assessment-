// Results circle image generator (PRD §5.7). Renders an SVG with three
// segments coloured by band, then rasterises to PNG via sharp.
// Fallback (dynamic_image_gen feature flag OFF, or render failure) lives
// in the state machine — this module only does the happy-path render.

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

const BG = "#FCF8ED";        // warm cream page/background
const STROKE = "#FCF8ED";    // slice dividers — match bg for clean breaks
const TEXT_DARK = "#36211B"; // primary ink
const TEXT_MUTED = "#8A7868"; // using hex for now, could be 0.6 opacity
const RIM = "#E7D8B5";       // subtle border ring
const ACCENT_YELLOW = "#FFDE59";

// 4-pointed sparkle star path (0,0 centered)
const STAR_PATH = "M 0,-10 C 1,-1 1,-1 10,0 C 1,1 1,1 0,10 C -1,1 -1,1 -10,0 C -1,-1 -1,-1 0,-10 Z";

function buildSvg(segments: ReadonlyArray<CircleSegment>, size: number, title?: string): string {
  const cx = size / 2;
  const cy = size * 0.46;
  const r = size * 0.28;
  const ri = r * 0.55; // Inner radius for donut
  const n = segments.length;

  const paths = segments
    .map((seg, i) => {
      const start = (i / n) * 2 * Math.PI - Math.PI / 2;
      const end = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);

      const x1i = cx + ri * Math.cos(start);
      const y1i = cy + ri * Math.sin(start);
      const x2i = cx + ri * Math.cos(end);
      const y2i = cy + ri * Math.sin(end);

      const large = end - start > Math.PI ? 1 : 0;
      // Donut slice path
      const d = `
        M ${x1.toFixed(2)} ${y1.toFixed(2)}
        A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}
        L ${x2i.toFixed(2)} ${y2i.toFixed(2)}
        A ${ri} ${ri} 0 ${large} 0 ${x1i.toFixed(2)} ${y1i.toFixed(2)}
        Z
      `;

      return `<path d="${d}" fill="${seg.colorHex}" stroke="${STROKE}" stroke-width="4" stroke-linejoin="round"/>`;
    })
    .join("\n");

  // Centre medallion — matches ApexChart donut labels
  const medallion = `
    <circle cx="${cx}" cy="${cy}" r="${(ri * 0.95).toFixed(2)}" fill="${BG}" stroke="${RIM}" stroke-width="1"/>
    <text x="${cx}" y="${(cy - 8).toFixed(2)}" text-anchor="middle" dominant-baseline="middle"
          font-family="'Montserrat', sans-serif" font-size="${Math.round(size * 0.012)}"
          fill="${TEXT_MUTED}" font-weight="600" letter-spacing="1">
      READOUT
    </text>
    <text x="${cx}" y="${(cy + 10).toFixed(2)}" text-anchor="middle" dominant-baseline="middle"
          font-family="'Montserrat', sans-serif" font-size="${Math.round(size * 0.024)}"
          fill="${TEXT_DARK}" font-weight="700" letter-spacing="2">
      REPORT
    </text>`;

  // Logo image — heavily cropped to match brand detailing
  let logoBlock = "";
  try {
    const logoRelPath = "public/logo.png";
    const logoAbsPath = path.join(process.cwd(), logoRelPath);
    if (fs.existsSync(logoAbsPath)) {
      const logoBase64 = fs.readFileSync(logoAbsPath, "base64");
      const logoDataUri = `data:image/png;base64,${logoBase64}`;
      const logoW = Math.round(size * 0.22);
      const logoH = Math.round(size * 0.08); // Even more cropped
      logoBlock = `
        <svg x="${cx - logoW / 2}" y="${Math.round(size * 0.045)}" width="${logoW}" height="${logoH}" viewBox="20 35 60 30" preserveAspectRatio="xMidYMid slice">
          <image href="${logoDataUri}" x="0" y="0" width="100" height="100" />
        </svg>
        <text x="${cx}" y="${Math.round(size * 0.125)}" text-anchor="middle"
              font-family="'Montserrat', sans-serif" font-size="${Math.round(size * 0.016)}"
              fill="${TEXT_MUTED}" letter-spacing="3" font-weight="600">
          FULL SPECTRUM LEADERSHIP
        </text>`;
    }
  } catch (err) {
    console.error("Failed to embed logo in SVG:", err);
  }

  // Fallback to text if logo image is missing or failed
  const titleBlock = title ? (logoBlock || `
      <g transform="translate(${cx}, ${Math.round(size * 0.081)})">
        <path d="${STAR_PATH}" fill="${ACCENT_YELLOW}" transform="translate(-82, -32) scale(0.75)"/>
        <text x="0" y="0" text-anchor="middle"
              font-family="'Fraunces', 'Playfair Display', serif" font-size="${Math.round(size * 0.052)}"
              fill="${TEXT_DARK}" font-weight="700">
          innergy
        </text>
      </g>
      <text x="${cx}" y="${Math.round(size * 0.125)}" text-anchor="middle"
            font-family="'Montserrat', sans-serif" font-size="${Math.round(size * 0.02)}"
            fill="${TEXT_MUTED}" letter-spacing="3" font-weight="600">
        FULL SPECTRUM LEADERSHIP
      </text>`)
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
                font-family="'Montserrat', sans-serif" font-size="${Math.round(size * 0.024)}"
                fill="${TEXT_DARK}" font-weight="600">
            ${escape(seg.label)}
          </text>
          <text x="${Math.round(size * 0.45)}" y="${rowH / 2 + 3}" dominant-baseline="middle"
                font-family="'Montserrat', sans-serif" font-size="${Math.round(size * 0.024)}"
                fill="${TEXT_DARK}" font-weight="700" letter-spacing="0.5">
            ${seg.score}<tspan fill="${TEXT_MUTED}" font-weight="500"> / ${seg.maxScore}</tspan>
          </text>
          <text x="${Math.round(size * 0.6)}" y="${rowH / 2 + 3}" dominant-baseline="middle"
                font-family="'Montserrat', sans-serif" font-size="${Math.round(size * 0.021)}"
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
