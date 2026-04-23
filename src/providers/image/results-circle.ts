// Results circle image generator (PRD §5.7). Renders an SVG with three
// segments coloured by band, then rasterises to PNG via sharp.
// Fallback (dynamic_image_gen feature flag OFF, or render failure) lives
// in the state machine — this module only does the happy-path render.

import sharp from "sharp";

export interface CircleSegment {
  label: string;       // "Cognitive Clarity"
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

function buildSvg(segments: ReadonlyArray<CircleSegment>, size: number, title?: string): string {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
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
      const mid = (start + end) / 2;
      const tx = cx + r * 0.6 * Math.cos(mid);
      const ty = cy + r * 0.6 * Math.sin(mid);
      return `
        <path d="${d}" fill="${seg.colorHex}" stroke="#ffffff" stroke-width="4"/>
        <text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" text-anchor="middle" dominant-baseline="middle"
              font-family="Inter, Arial, sans-serif" font-size="${Math.round(size * 0.05)}" fill="#ffffff" font-weight="700">
          ${seg.score}
        </text>`;
    })
    .join("\n");

  const legend = segments
    .map(
      (seg, i) =>
        `<g transform="translate(${Math.round(size * 0.08)}, ${Math.round(size * 0.82 + i * size * 0.045)})">
           <rect width="18" height="18" rx="3" fill="${seg.colorHex}" />
           <text x="26" y="14" font-family="Inter, Arial, sans-serif" font-size="${Math.round(size * 0.025)}" fill="#111827">
             ${seg.label} — ${seg.score}/${seg.maxScore} · ${seg.bandLabel}
           </text>
         </g>`,
    )
    .join("\n");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <rect width="100%" height="100%" fill="#f8fafc"/>
      ${title ? `<text x="${cx}" y="${Math.round(size * 0.08)}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${Math.round(size * 0.035)}" fill="#1f2937">${escape(title)}</text>` : ""}
      ${paths}
      ${legend}
    </svg>`;
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
