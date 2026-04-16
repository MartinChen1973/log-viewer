export function formatBytes(n) {
  const x = Number(n) || 0;
  if (x < 1024) return x + " B";
  if (x < 1024 * 1024) return (x / 1024).toFixed(1) + " KB";
  return (x / (1024 * 1024)).toFixed(1) + " MB";
}
