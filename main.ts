/**
 * Entry program for make.fun "news-image-20261121".
 *
 * The repository ships a finished news image, entry.png, painted in code
 * with Python/PIL during the build (every letter, flag and pictogram is
 * drawn programmatically; no image model was used). This program does one
 * thing: it checks the bundled file is a legal entry image and publishes
 * it, byte for byte, as /output/entry.png.
 *
 * Checks performed before anything is written:
 *   - the PNG magic bytes are present,
 *   - the first chunk is IHDR and its dimensions are within 1024x1024,
 *   - the file is at most 1 MiB,
 *   - every chunk's CRC-32 matches and the file ends exactly at IEND.
 *
 * Node standard library only; no network access is needed or used.
 * Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for
 * /output:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "entry.png");
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const OUT_PATH = join(OUT_DIR, "entry.png");

const BYTE_LIMIT = 1_048_576;
const SIDE_LIMIT = 1_024;
const MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function fail(why) {
  throw new Error(`entry.png is not a legal entry image: ${why}`);
}

function crc32Table() {
  const tab = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tab[n] = c >>> 0;
  }
  return tab;
}

const TABLE = crc32Table();

function crc32(buf, start, end) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) {
    c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function validate(png) {
  if (png.length < 8 + 25) fail("file too short for a PNG header");
  for (let i = 0; i < MAGIC.length; i++) {
    if (png[i] !== MAGIC[i]) fail("missing PNG magic bytes");
  }
  if (png.toString("ascii", 12, 16) !== "IHDR") {
    fail("first chunk is not IHDR");
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width > SIDE_LIMIT || height > SIDE_LIMIT) {
    fail(`dimensions ${width}x${height} exceed ${SIDE_LIMIT}px`);
  }
  if (png.length > BYTE_LIMIT) {
    fail(`file is ${png.length} bytes, over the 1 MiB cap`);
  }
  // Walk every chunk: length, type, data, CRC; stop exactly at IEND.
  let pos = 8;
  let sawIend = false;
  while (pos + 8 <= png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString("ascii", pos + 4, pos + 8);
    if (pos + 12 + len > png.length) fail(`chunk ${type} runs past end of file`);
    const stored = png.readUInt32BE(pos + 8 + len);
    const actual = crc32(png, pos + 4, pos + 8 + len);
    if (stored !== actual) fail(`chunk ${type} has a bad CRC`);
    pos += 12 + len;
    if (type === "IEND") {
      sawIend = true;
      break;
    }
  }
  if (!sawIend) fail("no IEND chunk found");
  if (pos !== png.length) fail("trailing bytes after IEND");
  return { width, height };
}

const png = readFileSync(SOURCE);
const { width, height } = validate(png);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_PATH, png);

const digest = createHash("sha256").update(png).digest("hex");
console.log(
  JSON.stringify({
    entry: "news-image-20261121",
    output: OUT_PATH,
    width,
    height,
    bytes: png.length,
    sha256: digest,
  }),
);
