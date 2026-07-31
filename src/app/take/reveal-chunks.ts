// Splits one response's bubbles into the groups revealed between "Yes, go
// ahead" breaks.
//
// The readout arrives as a single burst — three dimension cards, the overall
// card carrying the chart, then the coaching CTA. Revealed in one go that is
// roughly twelve seconds of the page scrolling itself while the reader is
// still on the first card. Giving each result card its own group hands the
// pacing back to the reader.
//
// Boundaries: before every result card except the first (which stays with the
// preamble that introduces it, e.g. "Reading your team's spectrum…"), and
// immediately after the last one, so the CTA lands as its own beat rather than
// riding in on the back of the overall score.
//
// Extracted from AssessmentChat so the boundaries can be unit-tested — a
// mis-chunked reveal either strands the widget or gates a plain question turn.
export function chunkResultReveal<T>(
  items: T[],
  isResultCard: (item: T) => boolean,
): T[][] {
  const lastResult = items.reduce(
    (acc, item, i) => (isResultCard(item) ? i : acc),
    -1,
  );
  // No results in this turn (every question turn): one group, no breaks.
  if (lastResult < 0) return items.length > 0 ? [items] : [];

  const chunks: T[][] = [];
  let current: T[] = [];
  let currentHasResult = false;

  items.forEach((item, i) => {
    if (isResultCard(item) && currentHasResult) {
      chunks.push(current);
      current = [];
      currentHasResult = false;
    }
    current.push(item);
    if (isResultCard(item)) currentHasResult = true;
    if (i === lastResult) {
      chunks.push(current);
      current = [];
      currentHasResult = false;
    }
  });

  if (current.length > 0) chunks.push(current);
  return chunks;
}
