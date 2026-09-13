// Converts an 8-bit RGB (PNG color type 2) file to RGBA (color type 6) with a
// fully opaque alpha channel, in place. Playwright's screenshot encoder drops
// the alpha channel entirely when a page has no transparency to preserve, but
// Tauri's tray-icon loader (and some of its window-icon paths) require RGBA
// — hence this, rather than pulling in a whole image library for one channel.
//
// PNG scanlines are filtered (each byte stored as a delta against
// neighbouring bytes, per one of five filter types, chosen per row) before
// compression — not stored as plain pixel bytes. Skipping the un/refilter
// step and just splicing an alpha byte into the raw inflated stream produces
// exactly the diagonal-banding corruption this earlier version shipped with;
// the fix is to fully reconstruct actual pixel bytes first (bpp=3), build the
// new RGBA buffer, then re-filter (as "None" — simplest and always correct,
// only costing a little extra deflate size on icon-sized images) at bpp=4.
import { readFile, writeFile } from "node:fs/promises";
import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Reconstructs the actual pixel bytes from filtered scanline data (PNG spec
// §9.3) into one flat buffer, one row after another, no filter bytes.
function unfilter(raw, width, height, bpp) {
  const rowBytes = width * bpp;
  const stride = rowBytes + 1;
  const out = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const filterType = raw[y * stride];
    const inRow = y * stride + 1;
    const outRow = y * rowBytes;
    const prevRow = y > 0 ? (y - 1) * rowBytes : -1;
    for (let i = 0; i < rowBytes; i++) {
      const x = raw[inRow + i];
      const a = i >= bpp ? out[outRow + i - bpp] : 0;
      const b = prevRow >= 0 ? out[prevRow + i] : 0;
      const c = prevRow >= 0 && i >= bpp ? out[prevRow + i - bpp] : 0;
      let value;
      switch (filterType) {
        case 0: value = x; break;
        case 1: value = x + a; break;
        case 2: value = x + b; break;
        case 3: value = x + ((a + b) >> 1); break;
        case 4: value = x + paeth(a, b, c); break;
        default: throw new Error(`Unsupported PNG filter type ${filterType}.`);
      }
      out[outRow + i] = value & 0xff;
    }
  }
  return out;
}

// Filter type 0 (None) on every row: always valid, trivially correct, and
// the deflate size difference is irrelevant at icon dimensions.
function addFilterBytes(raw, width, height, bpp) {
  const rowBytes = width * bpp;
  const stride = rowBytes + 1;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    out[y * stride] = 0;
    raw.copy(out, y * stride + 1, y * rowBytes, y * rowBytes + rowBytes);
  }
  return out;
}

export async function convertToRgba(file) {
  const png = await readFile(file);
  const signature = png.subarray(0, 8);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  const idatParts = [];
  const otherChunks = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === "IDAT") {
      idatParts.push(data);
    } else if (type !== "IEND") {
      otherChunks.push({ type, data });
    }
    offset += 12 + length;
  }

  if (colorType === 6) return false; // already RGBA
  if (colorType !== 2 || bitDepth !== 8) {
    throw new Error(`${file}: expected 8-bit RGB (color type 2), got color type ${colorType} at bit depth ${bitDepth}.`);
  }
  if (interlace !== 0) throw new Error(`${file}: interlaced PNGs are not supported by this converter.`);

  const filtered = zlib.inflateSync(Buffer.concat(idatParts));
  const rgb = unfilter(filtered, width, height, 3);

  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    rgb.copy(rgba, pixel * 4, pixel * 3, pixel * 3 + 3);
    rgba[pixel * 4 + 3] = 255;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const idat = zlib.deflateSync(addFilterBytes(rgba, width, height, 4), { level: 9 });
  const rebuilt = Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    ...otherChunks.map(({ type, data }) => chunk(type, data)),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  await writeFile(file, rebuilt);
  return true;
}

for (const file of process.argv.slice(2)) {
  const converted = await convertToRgba(file);
  process.stdout.write(`${file}: ${converted ? "converted to RGBA" : "already RGBA"}\n`);
}
