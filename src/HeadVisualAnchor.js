/**
 * The camera pivot and the 16:9 artboard are not the center of the visible
 * head. Measure the alpha silhouette already used to occlude paper sheets.
 * This keeps one shared visual center without WebGL GPU readbacks.
 */
export function silhouetteVisualCenter(pixels, width, height, threshold = 48) {
  if (!pixels || width < 1 || height < 1 ||
      pixels.length < width * height * 4) return null;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < threshold) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return {
    x: (minX + maxX + 1) / (2 * width),
    y: (minY + maxY + 1) / (2 * height),
  };
}

/**
 * Convert a visible alpha-mask center to the paper renderer's centered
 * viewport coordinates, removing head scroll translation to avoid
 * applying the same vertical camera movement twice.
 */
export function headVisualOrbitOffset(rect, visualCenter, viewportWidth,
  viewportHeight, headTranslationX = 0, headTranslationY = 0) {
  if (!visualCenter || !rect || rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: rect.left + rect.width * visualCenter.x -
      viewportWidth * 0.5 - headTranslationX,
    y: rect.top + rect.height * visualCenter.y -
      viewportHeight * 0.5 - headTranslationY,
  };
}
