export function albumMediaUrl(mediaId: string, variant: "preview" | "original" = "preview", admin = false) {
  const params = new URLSearchParams({ variant });
  if (admin) params.set("admin", "1");
  return `/api/album/media/${mediaId}?${params.toString()}`;
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function publicAlbumUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return base ? `${base}/album` : "/album";
}

export function quickChartQrUrl(text: string, size = 280) {
  const params = new URLSearchParams({
    text,
    size: String(size),
    margin: "1",
    dark: "171814",
    light: "ffffff",
    ecLevel: "H",
    dotStyle: "rounded",
    finderStyle: "rounded",
  });
  return `https://quickchart.io/qr?${params.toString()}`;
}
