#!/usr/bin/env node
// Generate PNG icons for PWA from pure Node.js (no external dependencies)
// Usage: node generate-icons.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(size) {
  // Build a minimal valid PNG with a red rounded-rect background and white "S"
  // We'll create a simple solid-color icon since drawing text in raw pixels
  // without a library is impractical. The icon will be Claro red (#DA291C).

  const width = size;
  const height = size;

  // Create raw pixel data (RGBA) - fill with Claro red
  const rawData = Buffer.alloc(height * (1 + width * 4)); // +1 per row for filter byte

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawData[rowOffset] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 4;

      // Calculate distance from center for the "S" letter area
      const cx = x - width / 2;
      const cy = y - height / 2;
      const radius = width * 0.35;

      // Rounded rectangle mask
      const cornerR = width * 0.15;
      const inRect = x >= cornerR && x < width - cornerR ||
                     y >= cornerR && y < height - cornerR;
      const inCornerTL = Math.hypot(x - cornerR, y - cornerR) <= cornerR;
      const inCornerTR = Math.hypot(x - (width - cornerR), y - cornerR) <= cornerR;
      const inCornerBL = Math.hypot(x - cornerR, y - (height - cornerR)) <= cornerR;
      const inCornerBR = Math.hypot(x - (width - cornerR), y - (height - cornerR)) <= cornerR;
      const inShape = inRect || inCornerTL || inCornerTR || inCornerBL || inCornerBR;

      if (!inShape) {
        // Transparent outside rounded rect
        rawData[px] = 0;
        rawData[px + 1] = 0;
        rawData[px + 2] = 0;
        rawData[px + 3] = 0;
        continue;
      }

      // Simple "S" shape using geometric regions
      const nx = (x - width * 0.3) / (width * 0.4);  // normalized 0-1 within letter area
      const ny = (y - height * 0.2) / (height * 0.6); // normalized 0-1 within letter area
      let isLetter = false;

      if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) {
        const thick = 0.22;
        // Top bar
        if (ny < thick && nx >= 0.15) isLetter = true;
        // Middle bar
        if (ny >= 0.5 - thick / 2 && ny <= 0.5 + thick / 2) isLetter = true;
        // Bottom bar
        if (ny > 1 - thick && nx <= 0.85) isLetter = true;
        // Left top vertical
        if (nx < thick + 0.15 && nx >= 0.15 && ny < 0.5) isLetter = true;
        // Right bottom vertical
        if (nx > 1 - thick && ny > 0.5) isLetter = true;
      }

      if (isLetter) {
        // White
        rawData[px] = 255;
        rawData[px + 1] = 255;
        rawData[px + 2] = 255;
        rawData[px + 3] = 255;
      } else {
        // Claro Red #DA291C
        rawData[px] = 0xDA;
        rawData[px + 1] = 0x29;
        rawData[px + 2] = 0x1C;
        rawData[px + 3] = 255;
      }
    }
  }

  // Compress pixel data
  const compressed = zlib.deflateSync(rawData);

  // Build PNG file
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData) >>> 0);
    return Buffer.concat([len, typeBuffer, data, crc]);
  }

  // CRC32 implementation
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
      }
    }
    return c ^ 0xFFFFFFFF;
  }

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = chunk('IHDR', ihdr);
  const idatChunk = chunk('IDAT', compressed);
  const iendChunk = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const dir = path.join(__dirname, 'client/public/icons');
fs.mkdirSync(dir, { recursive: true });

[192, 512].forEach(size => {
  const png = createPNG(size);
  const filePath = path.join(dir, `icon-${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Created ${filePath} (${png.length} bytes)`);
});

console.log('Done! PNG icons generated.');
