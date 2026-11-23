/**
 * Render the approved 21-sheet Home/Projects system only while it can
 * actually be seen. One final exit frame clears the GPU/DOM scene.
 * The shared head is owned by HomepageHead and always remains live.
 */
export function needsPaperFrame(progress, handoff, visible, previouslyVisible) {
  if (!Number.isFinite(progress) || !Number.isFinite(handoff)) return true;
  return progress < .99 || handoff < .995 ||
    Boolean(visible) || Boolean(previouslyVisible);
}
