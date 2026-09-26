import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("generate-qr keeps public_number and SVG filename aligned with --start", async () => {
  const outDir = await mkdtemp(resolve(tmpdir(), "gamms-aep-qr-"));

  try {
    await execFileAsync(process.execPath, [
      "scripts/aep/generate-qr.mjs",
      "--count=3",
      "--start=99",
      `--out=${outDir}`
    ]);

    const manifest = await readFile(resolve(outDir, "manifest.csv"), "utf8");
    const rows = manifest.trim().split("\n").slice(1).map((line) => line.split(","));

    assert.deepEqual(rows.map((row) => row[0]), ["99", "100", "101"]);
    assert.deepEqual(rows.map((row) => row[4]), ["099.svg", "100.svg", "101.svg"]);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
