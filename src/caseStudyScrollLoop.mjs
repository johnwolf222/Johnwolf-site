/**
 * Preserve a safe, continuous strip of the three repeated case-study cycles.
 * Native momentum can skip more than one copy in a single scroll event, so
 * one +/- height adjustment is not sufficient to stay away from blank edges.
 *
 * Every copy contains the same artwork in the same order. The canonical
 * scroll band is [half a cycle, one and a half cycles), matching the site's
 * approved continuous scroll position and its existing progress ring.
 */
export function wrapCaseStudyScrollTop(top, cycleHeight) {
  if (!Number.isFinite(top) || !Number.isFinite(cycleHeight) || cycleHeight <= 80)
    return top;
  const lower = cycleHeight * 0.5;
  const upper = lower + cycleHeight;
  if (top >= lower && top < upper) return top;
  return lower + (((top - lower) % cycleHeight) + cycleHeight) % cycleHeight;
}
