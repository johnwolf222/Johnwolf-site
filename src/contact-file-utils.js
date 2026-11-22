// Client-side selection rules only. The upload endpoint must independently
// validate files, types, limits and permissions before accepting attachments.
export const MAX_PROJECT_FILES = 3;
export function mergeProjectFiles(current, incoming, max = MAX_PROJECT_FILES) {
  const selected = [...current];
  const additional = Array.from(incoming || []).filter(file =>
    file && typeof file.name === 'string' && Number.isFinite(file.size));
  for (const file of additional) {
    const duplicate = selected.some(existing =>
      existing.name === file.name && existing.size === file.size &&
      existing.lastModified === file.lastModified);
    if (duplicate) continue;
    if (selected.length >= max) {
      return {files: current, error: 'Please select no more than three files. Remove one before adding another.'};
    }
    selected.push(file);
  }
  return {files: selected, error: ''};
}

export function formatProjectFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
