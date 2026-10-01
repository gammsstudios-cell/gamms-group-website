import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { formatFriendlyCustomerId } from "./customerProfile.js";
import { normalizePhysicalQrInput } from "./physicalQr.js";

test("friendly customer labels use the real cust_ prefix", () => {
  assert.equal(formatFriendlyCustomerId("cust_a7f2abcdef"), "Cliente #A7F2");
  assert.equal(formatFriendlyCustomerId("cust_b8c3abcdef"), "Cliente #B8C3");
  assert.equal(formatFriendlyCustomerId(null), "Cliente #0000");
});

test("staff physical QR input accepts manual public numbers without weakening route tokens", () => {
  assert.deepEqual(normalizePhysicalQrInput("127"), { type: "publicNumber", value: 127 });
  assert.deepEqual(normalizePhysicalQrInput("#127"), { type: "publicNumber", value: 127 });
  assert.equal(normalizePhysicalQrInput("https://example.com/aep/promo/r/MANUALQR0001").type, "token");
  assert.equal(normalizePhysicalQrInput("GAMMS-AEP-QR:MANUALQR0001").type, "token");
});

test("Control Center exposes variable discounts and manual beverage code UX", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");
  assert.doesNotMatch(source, /Canje POS 50%/);
  assert.match(source, /Escanea el QR o escribe el c.digo #127/);
  assert.match(source, /Identidad e impresi.n/);
  assert.match(source, /Conectar impresora t.rmica/);
  assert.match(source, /Imprimir QR cliente/);
});

test("Print Studio visibly labels the manual beverage code", () => {
  const controlCenter = readFileSync(resolve(process.cwd(), "functions/aep/controlcenter/[[path]].js"), "utf8");
  const pdf = readFileSync(resolve(process.cwd(), "functions/aep/_lib/printPdf.js"), "utf8");
  assert.match(controlCenter, /Codigo: #\\\$\{numberText\}/);
  assert.match(pdf, /Codigo: #\$\{label\.publicNumber\}/);
});

test("customer promo page renders configured discount and configurable purchase progress", () => {
  const promo = readFileSync(resolve(process.cwd(), "functions/aep/promo/r/[token].js"), "utf8");
  assert.doesNotMatch(promo, /50% DESBLOQUEADO|50% disponible|50% de descuento/);
  assert.match(promo, /function discountShort\(value\)/);
  assert.match(promo, /data\.reward\.discountPercent/);
  assert.match(promo, /data\.claim && data\.claim\.discountPercent/);
  assert.match(promo, /const everyN = Math\.max\(2,/);
  assert.match(promo, /const requiredBeforeReward = Math\.max\(1, everyN - 1\)/);
});

test("assisted customer API supports lookup by the visible customer code", () => {
  const source = readFileSync(resolve(process.cwd(), "functions/aep/api/admin/assisted/customers.js"), "utf8");
  assert.match(source, /function customerIdSearchPattern\(query\)/);
  assert.match(source, /cust_\$\{friendly\[1\]\}%/);
  assert.match(source, /c\.id LIKE \?/);
});
