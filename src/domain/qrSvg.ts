import { create } from "qrcode/lib/core/qrcode";

/**
 * A QR code as a standalone SVG string, for pages made on the phone (the Build Record's for-sale sheet, D-68).
 * Same encoder and quiet zone as the QrCode component; nothing is sent anywhere to make it.
 */
export function qrSvg(value: string, size = 160): string {
  const m = create(value, { errorCorrectionLevel: "M" }).modules;
  let d = "";
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.get(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  const n = m.size + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
