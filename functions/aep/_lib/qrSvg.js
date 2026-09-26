import qrcode from "qrcode-generator";

export function renderQrSvg(value) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();

  const count = qr.getModuleCount();
  const margin = 4;
  const total = count + margin * 2;
  const parts = [`<rect x="0" y="0" width="${total}" height="${total}" fill="#FFFFFF"/>`];

  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!qr.isDark(row, col)) continue;
      parts.push(`<rect x="${col + margin}" y="${row + margin}" width="1" height="1" fill="#1D1D1F"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">${parts.join("")}</svg>`;
}
