// The complete approved service vocabulary, repeated across all five rows.
export const ABOUT_CAPABILITIES = Object.freeze([
  'Brand Identity', 'Visual Design', 'Logo Development', 'UI/UX Design',
  'Product Design', 'Research', 'Creative Direction', 'Brand Strategy',
  'Art Direction', 'Web Design', 'Packaging Design', 'Illustration',
  'Brand Evaluation', 'Concept Development', 'Stationery Design',
  'Print Design & Prepress', 'Visual Storytelling', 'Design Systems',
  'Digital Prototyping', 'Typography', 'Marketing Collateral Design',
  'Creative Consulting',
]);
export const CAPABILITY_DIRECTIONS = Object.freeze([-1, 1, -1, 1, -1]);
export const CAPABILITY_STARTS = Object.freeze([0, 4, 8, 12, 16]);

// Three repeating copies support scroll-seekable, time-independent movement.
export function marqueeOffset(scrollDistance, sequenceWidth, direction, speed = 0.8) {
  if (!Number.isFinite(sequenceWidth) || sequenceWidth <= 0) return 0;
  const distance = Math.max(0, Number.isFinite(scrollDistance) ? scrollDistance : 0);
  const phase = (distance * speed) % sequenceWidth;
  return -sequenceWidth + (direction === 1 ? phase : -phase);
}
