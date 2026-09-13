// Packs the rendered PNGs into a single multi-resolution .ico. Windows has
// accepted PNG-compressed icon directory entries since Vista, so this needs
// no BMP conversion or extra dependency — just the ICO container format.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const sizes = [256, 128, 64, 48, 32, 16];

const images = await Promise.all(
  sizes.map((size) => readFile(path.join(directory, "png", `icon-${size}.png`))),
);

const headerSize = 6;
const entrySize = 16;
let offset = headerSize + entrySize * images.length;

const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(images.length, 4);

const entries = [];
for (const [index, size] of sizes.entries()) {
  const image = images[index];
  const entry = Buffer.alloc(entrySize);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2); // color count
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(image.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += image.length;
  entries.push(entry);
}

const ico = Buffer.concat([header, ...entries, ...images]);
await writeFile(path.join(directory, "icon.ico"), ico);
process.stdout.write(`Wrote icon.ico (${ico.length} bytes, ${images.length} sizes)\n`);
