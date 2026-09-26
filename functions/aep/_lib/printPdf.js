import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import qrcode from "qrcode-generator";
import { getSlotPosition, paginateLabels, profileCapacity, umToPt } from "./printProfiles.js";

function asString(value) {
  return String(value ?? "");
}

function truncate(text, maxLength) {
  const value = asString(text).trim();
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return ".".repeat(Math.max(0, maxLength));
  return `${value.slice(0, maxLength - 3)}...`;
}

export function qrModules(value) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const modules = [];
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) modules.push({ row, col });
    }
  }
  return { count, modules };
}

export function getQuietQrDrawPlan(value, size, quietModules = 4) {
  const matrix = qrModules(value);
  const totalModules = matrix.count + quietModules * 2;
  const cell = size / totalModules;
  const offset = quietModules * cell;
  return {
    matrixCount: matrix.count,
    quietModules,
    totalModules,
    cell,
    offset,
    modules: matrix.modules.map((module) => ({
      row: module.row,
      col: module.col,
      x: offset + module.col * cell,
      y: offset + (matrix.count - module.row - 1) * cell,
      width: Math.ceil(cell * 1000) / 1000,
      height: Math.ceil(cell * 1000) / 1000
    }))
  };
}

function drawQr(page, value, x, y, size) {
  const plan = getQuietQrDrawPlan(value, size);
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  for (const module of plan.modules) {
    page.drawRectangle({
      x: x + module.x,
      y: y + module.y,
      width: module.width,
      height: module.height,
      color: rgb(0, 0, 0)
    });
  }
}

function drawLabel(page, fonts, slotBox, label) {
  const padding = 3;
  const qrSize = Math.min(slotBox.height - padding * 2, slotBox.width * 0.58);
  const qrX = slotBox.x + padding;
  const qrY = slotBox.y + (slotBox.height - qrSize) / 2;
  const textX = qrX + qrSize + 4;
  const textWidth = Math.max(20, slotBox.x + slotBox.width - textX - padding);

  drawQr(page, label.url, qrX, qrY, qrSize);
  page.drawText("GAMMS AEP", {
    x: textX,
    y: slotBox.y + slotBox.height - 12,
    size: 7,
    font: fonts.bold,
    color: rgb(0.05, 0.05, 0.05),
    maxWidth: textWidth
  });
  page.drawText(truncate(label.productName ?? label.product?.name ?? "Producto", 22), {
    x: textX,
    y: slotBox.y + slotBox.height - 23,
    size: 5.5,
    font: fonts.regular,
    color: rgb(0.18, 0.18, 0.18),
    maxWidth: textWidth
  });
  page.drawText(`#${label.publicNumber}`, {
    x: textX,
    y: slotBox.y + 7,
    size: 8,
    font: fonts.bold,
    color: rgb(0, 0, 0),
    maxWidth: textWidth
  });
}

export function normalizePdfLabels(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    publicNumber: item.publicNumber ?? item.public_number,
    url: item.url,
    productName: item.productName ?? item.product_name ?? item.product?.name
  }));
}

export async function generateLabelsPdf({ labels, profile, startSlot = 1, drawGuides = false }) {
  const safeLabels = normalizePdfLabels(labels);
  if (safeLabels.length < 1 || safeLabels.length > 500 || safeLabels.some((item) => !item.publicNumber || !item.url)) {
    return { ok: false, code: "INVALID_LABEL_COUNT" };
  }

  const pages = paginateLabels(safeLabels, profile, startSlot);
  if (!pages.ok) return pages;

  const pdfDoc = await PDFDocument.create();
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  };
  const pageSize = [umToPt(profile.pageWidthUm), umToPt(profile.pageHeightUm)];

  for (const pageSlots of pages.pages) {
    const page = pdfDoc.addPage(pageSize);
    if (drawGuides) {
      for (let slot = 1; slot <= profileCapacity(profile); slot += 1) {
        const box = getSlotPosition(profile, slot);
        page.drawRectangle({
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          borderWidth: 0.2,
          borderColor: rgb(0.75, 0.75, 0.75),
          color: rgb(1, 1, 1),
          opacity: 0
        });
      }
    }
    for (const item of pageSlots) {
      drawLabel(page, fonts, getSlotPosition(profile, item.slot), item.label);
    }
  }

  const bytes = await pdfDoc.save();
  return { ok: true, bytes, pageCount: pages.pages.length };
}
