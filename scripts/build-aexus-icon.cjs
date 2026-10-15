#!/usr/bin/env node
'use strict';
// Deterministic Aexus icon builder.
//
// WHY THIS EXISTS
// Assets/Aexus.png is the single source of truth for every shipped icon:
// build.py copies it to artifacts/icon.png and Assets/Aexus.icns into the
// macOS bundle, build.cjs copies it to dist/ui/aexus.png for the toolbar and
// favicon, and Windows/build.py re-derives Aexus.ico from artifacts/icon.png.
// The original artwork is a 1254x1254 opaque canvas: a black rounded square
// ("squircle") with a white ribbon "A" and a four-point sparkle, sitting on a
// flat white margin. That white margin is baked in as *opaque* pixels, so the
// icon renders with a white outer frame on any non-white background.
//
// WHAT IT DOES
// Turns only the white margin that is connected to the canvas border into
// transparency, anti-aliased edge included, and regenerates every derived
// asset from that one result. The black body, the white "A" and the sparkle
// keep their exact source pixels; the enclosed white artwork is never made
// transparent because the flood fill starts at the border and cannot cross the
// black ring. Nothing is redesigned, rescaled or re-generated: the shape,
// proportions and canvas padding are the source's own.
//
// HOW THE ALPHA IS DERIVED
// The source is an opaque composite of white paper (L) behind black artwork, so
// a margin pixel is  P = a*0 + (1-a)*L. Inverting that gives the coverage
// a = (L - P)/L, which is exactly 0.5 at a half-covered edge pixel. Pixels in
// the transparent region are re-matted to the artwork colour (black) so the
// stored RGB is the foreground, not a white matte: compositing therefore
// reproduces the original look on a light background and shows no pale halo on
// a dark one. Noise in the flat margin (L is 252..255) would otherwise leave
// ~1% alpha everywhere, so coverage at or below NOISE_FLOOR is snapped to 0.
//
// USAGE
//   node scripts/build-aexus-icon.cjs
//   node scripts/build-aexus-icon.cjs --contact-sheet artifacts/full-acceptance-20261015
//   node scripts/build-aexus-icon.cjs --verify
//
// Needs the sharp that ships with the embedded AgentBoard/Aexus app (the repo
// root has no node_modules of its own) plus the macOS iconset/iconutil tools.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'Assets');
const SOURCE = path.join(ASSETS, 'Aexus.png');           // canonical, opaque artwork
const ORIGINAL = path.join(ASSETS, 'Aexus-original.png'); // untouched raw source copy
const ICNS = path.join(ASSETS, 'Aexus.icns');
const ICO = path.join(ASSETS, 'Aexus.ico');

// Margin coverage at or below this is source noise, not artwork.
const NOISE_FLOOR = 0.04;
// Width of the border ring sampled to measure the paper luminance.
const RING = 8;
// How far the transparent region may grow into the artwork so the anti-aliased
// edge keeps a smooth coverage ramp instead of a one-pixel step.
const DILATE = 4;
// Standard macOS iconset: file name -> pixel size. @2x files are listed after
// their 1x sibling because iconutil matches them by name.
const ICONSET = [
  ['icon_16x16.png', 16], ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32], ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256], ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512], ['icon_512x512@2x.png', 1024],
];
// Same size list and PNG-compressed entry format as Windows/build.py so the
// checked-in .ico matches what the Windows build regenerates.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const SHEET_SIZES = [16, 32, 64, 128];
const SHEET_LIGHT = { r: 238, g: 240, b: 244, label: 'light background #eef0f4' };
const SHEET_DARK = { r: 20, g: 22, b: 26, label: 'dark background #14161a' };

function loadSharp() {
  const candidates = [
    'sharp',
    path.join(ROOT, 'AgentBoard/Aexus/node_modules/sharp'),
  ];
  const failures = [];
  for (const candidate of candidates) {
    try { return createRequire(path.join(ROOT, 'scripts/'))(candidate); }
    catch (error) { failures.push(`${candidate}: ${error.code || error.message}`); }
  }
  throw Error('sharp is not available. Tried\n  ' + failures.join('\n  '));
}

const sharp = loadSharp();

// ---------------------------------------------------------------- pixel maths

// Mean of the RGB channels: the artwork is greyscale, so this is the coverage
// axis and avoids the slight per-channel noise of the generated source.
function luminance(data, channels) {
  const pixels = data.length / channels;
  const lum = new Float32Array(pixels);
  for (let i = 0, p = 0; i < data.length; i += channels, p++) {
    lum[p] = (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return lum;
}

function medianPaperLevel(lum, width, height) {
  const ring = [];
  for (let y = 0; y < RING; y++) {
    for (let x = 0; x < width; x++) { ring.push(lum[y * width + x]); ring.push(lum[(height - 1 - y) * width + x]); }
  }
  for (let x = 0; x < RING; x++) {
    for (let y = 0; y < height; y++) { ring.push(lum[y * width + x]); ring.push(lum[y * width + width - 1 - x]); }
  }
  ring.sort((a, b) => a - b);
  return ring[ring.length >> 1];
}

// Flood fill from the canvas border across everything lighter than the halfway
// luminance. The black ring around the artwork stops the fill, so the enclosed
// white of the "A" and the sparkle can never be reached.
function outsideMask(lum, width, height, paperLevel) {
  const threshold = paperLevel * 0.5;
  const mask = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let top = 0;
  const visit = (x, y) => {
    const p = y * width + x;
    if (mask[p] || lum[p] < threshold) return;
    mask[p] = 1; stack[top++] = p;
  };
  for (let x = 0; x < width; x++) { visit(x, 0); visit(x, height - 1); }
  for (let y = 0; y < height; y++) { visit(0, y); visit(width - 1, y); }
  while (top > 0) {
    const p = stack[--top];
    const x = p % width, y = (p - x) / width;
    if (x > 0) visit(x - 1, y);
    if (x < width - 1) visit(x + 1, y);
    if (y > 0) visit(x, y - 1);
    if (y < height - 1) visit(x, y + 1);
  }
  return mask;
}

function dilate(mask, width, height, radius) {
  let current = mask;
  for (let step = 0; step < radius; step++) {
    const next = new Uint8Array(current);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (current[p]) continue;
        const near = (x > 0 && current[p - 1]) || (x < width - 1 && current[p + 1]) ||
          (y > 0 && current[p - width]) || (y < height - 1 && current[p + width]) ||
          (x > 0 && y > 0 && current[p - width - 1]) || (x < width - 1 && y > 0 && current[p - width + 1]) ||
          (x > 0 && y < height - 1 && current[p + width - 1]) || (x < width - 1 && y < height - 1 && current[p + width + 1]);
        if (near) next[p] = 1;
      }
    }
    current = next;
  }
  return current;
}

// Complement of the transparent region, used to prove the fill stayed outside.
function componentStats(mask, width, height) {
  const seen = new Uint8Array(width * height);
  const components = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] || seen[start]) continue;
    let size = 0, x0 = width, y0 = height, x1 = -1, y1 = -1;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % width, y = (p - x) / width;
      size++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && !mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < width - 1 && !mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && !mask[p - width] && !seen[p - width]) { seen[p - width] = 1; stack.push(p - width); }
      if (y < height - 1 && !mask[p + width] && !seen[p + width]) { seen[p + width] = 1; stack.push(p + width); }
    }
    components.push({ size, x0, y0, x1, y1 });
  }
  components.sort((a, b) => b.size - a.size);
  return components;
}

// Build the transparent-margin RGBA raster plus the numbers the report quotes.
async function unmatted(inputPath) {
  const source = fs.readFileSync(inputPath);
  const { data, info } = await sharp(source).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const lum = luminance(data, channels);
  const paperLevel = medianPaperLevel(lum, width, height);
  if (paperLevel < 250) {
    throw Error(`${path.relative(ROOT, inputPath)} no longer sits on a white margin (paper level ${paperLevel}); refusing to guess.`);
  }
  const outside = outsideMask(lum, width, height, paperLevel);
  const region = dilate(outside, width, height, DILATE);
  const components = componentStats(outside, width, height);
  if (components.length !== 1) {
    throw Error(`Outside of the artwork is ${components.length} regions, expected 1: the fill leaked (or the artwork is broken).`);
  }
  const artwork = components[0];
  const out = Buffer.from(data);
  let zero = 0, partial = 0, opaque = 0, darkestTransparent = Infinity, midCoverage = 0;
  for (let p = 0, i = 3; p < width * height; p++, i += channels) {
    if (!region[p]) { opaque++; continue; }
    let coverage = (paperLevel - lum[p]) / paperLevel;
    if (coverage <= NOISE_FLOOR) coverage = 0;
    if (coverage > 1) coverage = 1;
    const alpha = Math.round(coverage * 255);
    if (alpha === 0) { zero++; if (lum[p] < darkestTransparent) darkestTransparent = lum[p]; }
    else if (alpha === 255) opaque++;
    else { partial++; if (alpha === Math.round(0.5 * 255)) midCoverage++; }
    if (alpha < 255) { out[i - 3] = 0; out[i - 2] = 0; out[i - 1] = 0; }
    out[i] = alpha;
  }
  // Nothing but the alpha channel may move: every pixel that stays opaque has
  // to keep the artwork's exact RGB, and every pixel that becomes transparent
  // has to be re-matted to the artwork colour rather than left as white.
  let keptPixels = 0, keptDifferences = 0, matteLeftovers = 0;
  for (let p = 0, i = 0; p < width * height; p++, i += channels) {
    if (out[i + 3] === 255) {
      keptPixels++;
      if (out[i] !== data[i] || out[i + 1] !== data[i + 1] || out[i + 2] !== data[i + 2]) keptDifferences++;
    } else if (out[i] || out[i + 1] || out[i + 2]) matteLeftovers++;
  }
  if (keptDifferences !== 0) throw Error(`${keptDifferences} opaque pixels no longer match the source artwork.`);
  if (matteLeftovers !== 0) throw Error(`${matteLeftovers} transparent pixels still carry a white matte.`);

  const checks = {
    size: `${width}x${height}`,
    paperLevel,
    opaquePixelsMatchingSourceExactly: keptPixels,
    opaquePixelRgbDifferences: keptDifferences,
    transparentRegionPixels: width * height - artwork.size,
    artworkPixels: artwork.size,
    artworkBounds: `${artwork.x0},${artwork.y0} .. ${artwork.x1},${artwork.y1}`,
    canvasPaddingPixels: artwork.x0,
    canvasPaddingPercent: Number(((artwork.x0 / width) * 100).toFixed(2)),
    artworkShare: Number(((artwork.size / (width * height)) * 100).toFixed(2)),
    fullyTransparentPixels: zero,
    antiAliasedEdgePixels: partial,
    fullyOpaquePixels: opaque,
    halfCoverageEdgePixels: midCoverage,
    darkestPixelMadeTransparent: darkestTransparent,
  };
  // The enclosed artwork must be untouched: sample the source's own white
  // interior and require opaque white there.
  const probe = (x, y) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  checks.interiorProbes = { 'sparkle centre': [627, 627], 'ribbon left': [400, 627], 'ribbon right': [850, 627] };
  checks.interiorProbePixels = Object.fromEntries(Object.entries(checks.interiorProbes).map(([name, [x, y]]) => {
    const [r, g, b, a] = probe(x, y);
    if (a !== 255) throw Error(`Interior pixel ${name} (${x},${y}) is not opaque; the fill reached the artwork.`);
    if (r < 250 || g < 250 || b < 250) throw Error(`Interior pixel ${name} (${x},${y}) is not white anymore.`);
    return [name, `rgba(${r},${g},${b},${a}) opaque white`];
  }));
  if (partial < 1000) throw Error(`Only ${partial} anti-aliased edge pixels; the transparent margin looks wrong.`);
  if (darkestTransparent < 240) {
    throw Error(`A dark pixel (luminance ${darkestTransparent}) was made transparent; refusing to erase artwork.`);
  }
  return { data: out, width, height, channels, checks };
}

// ------------------------------------------------------------------- outputs

// palette:false is required, not cosmetic. Left to itself libvips may emit an
// indexed PNG, and palette quantisation rewrites the colour of fully
// transparent pixels (and can band the anti-aliased edge), which breaks the
// "source pixels are preserved" guarantee. Truecolour keeps the raster exact.
const PNG_OPTIONS = { compressionLevel: 9, palette: false, adaptiveFiltering: false };

function png(buffer, width, height, channels) {
  return sharp(buffer, { raw: { width, height, channels } }).png(PNG_OPTIONS).toBuffer();
}

function resizePng(buffer, size, kernel) {
  return sharp(buffer).resize(size, size, { fit: 'fill', kernel, premultiply: true }).png(PNG_OPTIONS).toBuffer();
}

async function writeIcns(raster) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aexus-icon-'));
  const iconset = path.join(dir, 'Aexus.iconset');
  fs.mkdirSync(iconset);
  try {
    for (const [name, size] of ICONSET) {
      fs.writeFileSync(path.join(iconset, name), await resizePng(raster, size, 'lanczos3'));
    }
    execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', ICNS]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function writeIco(raster) {
  const images = [];
  const sizes = [];
  for (const size of ICO_SIZES) {
    images.push(await resizePng(raster, size, 'lanczos3'));
    sizes.push(size);
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (let i = 0; i < images.length; i++) {
    const entry = Buffer.alloc(16);
    const dimension = sizes[i] < 256 ? sizes[i] : 0;
    entry.writeUInt8(dimension, 0); entry.writeUInt8(dimension, 1);
    entry.writeUInt8(0, 2); entry.writeUInt8(0, 3);  // palette entries, reserved
    entry.writeUInt16LE(1, 4);                        // colour planes
    entry.writeUInt16LE(32, 6);                       // bits per pixel, with alpha
    entry.writeUInt32LE(images[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += images[i].length;
    entries.push(entry);
  }
  fs.writeFileSync(ICO, Buffer.concat([header, ...entries, ...images]));
}

async function writeContactSheet(raster, dir, everything) {
  fs.mkdirSync(dir, { recursive: true });
  const zoomOf = size => Math.max(1, Math.floor(192 / size));
  const pad = 14;
  const gap = 18;
  const cellWidth = Math.max(...SHEET_SIZES.map(size => Math.max(size, size * zoomOf(size)))) + pad * 2;
  const header = 132;
  const labelColumn = 150;
  // Each cell stacks the icon at its real size over an integer nearest-neighbour
  // zoom, so a reviewer can judge both the shipped pixels and the edge detail.
  const cellHeight = Math.max(...SHEET_SIZES.map(size => size + (zoomOf(size) > 1 ? gap + size * zoomOf(size) : 0))) + pad * 2;
  const rowHeight = cellHeight;
  // Two rows of the fixed icon plus one row of the untouched original, so the
  // white frame that prompted this work stays visible next to the result.
  const rows = [
    { token: 'AFTER', caption: 'light background', buffer: raster, backdrop: SHEET_LIGHT },
    { token: 'AFTER', caption: 'dark background', buffer: raster, backdrop: SHEET_DARK },
    { token: 'BEFORE', caption: 'dark background', buffer: everything.originalRaster, backdrop: SHEET_DARK },
  ];
  const width = labelColumn + cellWidth * SHEET_SIZES.length;
  const height = header + rowHeight * rows.length;
  const label = (x, y, text, fill, size, weight) =>
    `<text x="${x}" y="${y}" font-family="Helvetica,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${text}</text>`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
  svg += `<rect width="${width}" height="${height}" fill="#ffffff"/>`;
  svg += label(24, 40, 'Aexus icon · white outer margin removed, anti-aliased edge kept', '#101216', 20, 'bold');
  svg += label(24, 64, 'Top of each cell: the icon at its real size. Below it: the same render zoomed with nearest neighbour.', '#6b7280', 13, 'normal');
  svg += label(24, 84, 'BEFORE rows use the untouched Assets/Aexus-original.png; AFTER rows use the regenerated Assets/Aexus.png.', '#6b7280', 13, 'normal');
  for (let c = 0; c < SHEET_SIZES.length; c++) {
    const x = labelColumn + c * cellWidth + cellWidth / 2;
    const zoom = zoomOf(SHEET_SIZES[c]);
    svg += `<text x="${x}" y="${header - 16}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="15" font-weight="bold" fill="#101216">${SHEET_SIZES[c]} px${zoom > 1 ? ` · ${zoom}x` : ''}</text>`;
  }
  for (let r = 0; r < rows.length; r++) {
    const y = header + r * rowHeight;
    svg += `<rect x="0" y="${y}" width="${labelColumn}" height="${rowHeight}" fill="#f5f6f8"/>`;
    svg += `<rect x="${labelColumn}" y="${y}" width="${width - labelColumn}" height="${rowHeight}" fill="rgb(${rows[r].backdrop.r},${rows[r].backdrop.g},${rows[r].backdrop.b})"/>`;
    svg += label(16, y + rowHeight / 2 - 10, rows[r].token, '#101216', 16, 'bold');
    svg += label(16, y + rowHeight / 2 + 10, rows[r].caption, '#6b7280', 13, 'normal');
  }
  svg += '</svg>';
  const composites = [];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < SHEET_SIZES.length; c++) {
      const size = SHEET_SIZES[c];
      const zoom = zoomOf(size);
      const native = await resizePng(rows[r].buffer, size, 'lanczos3');
      const stacked = size + (zoom > 1 ? gap + size * zoom : 0);
      const top = header + r * rowHeight + (rowHeight - stacked) / 2;
      const centre = labelColumn + c * cellWidth + cellWidth / 2;
      const nativeLeft = Math.round(centre - size / 2);
      composites.push({ input: native, top: Math.round(top), left: nativeLeft });
      if (zoom > 1) {
        const zoomed = await sharp(native).resize(size * zoom, size * zoom, { kernel: 'nearest' }).png(PNG_OPTIONS).toBuffer();
        composites.push({ input: zoomed, top: Math.round(top + size + gap), left: Math.round(centre - (size * zoom) / 2) });
      }
    }
  }
  const out = path.join(dir, 'icon-contact-sheet-20261015.png');
  await sharp(Buffer.from(svg)).composite(composites).png(PNG_OPTIONS).toFile(out);
  return out;
}

// ------------------------------------------------------------------ verify

async function verifyOutputs() {
  const report = {};
  const raster = fs.readFileSync(SOURCE);
  const decoded = await sharp(raster).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = decoded.info;
  const at = (x, y) => {
    const i = (y * width + x) * channels;
    return [decoded.data[i], decoded.data[i + 1], decoded.data[i + 2], decoded.data[i + 3]];
  };
  report['Assets/Aexus.png'] = {
    format: `${decoded.info.width}x${decoded.info.height} rgba`,
    topLeftPixel: at(0, 0), bottomRightPixel: at(width - 1, height - 1),
    outsideIsTransparent: at(0, 0)[3] === 0 && at(width - 1, height - 1)[3] === 0,
    sparkleCentre: at(627, 627), sparkleStayedOpaqueWhite: at(627, 627).join() === '255,255,255,255',
  };
  // ICNS: every PNG entry must carry an alpha channel and a transparent corner.
  // iconutil stores the two smallest scales as RLE-compressed "ARGB" instead of
  // PNG, so those are proven by decoding the whole file back with iconutil.
  const icns = fs.readFileSync(ICNS);
  const icnsEntries = [];
  let offset = 8;
  while (offset < icns.length) {
    const type = icns.toString('latin1', offset, offset + 4);
    const size = icns.readUInt32BE(offset + 4);
    const body = icns.subarray(offset + 8, offset + size);
    if (body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      const meta = await sharp(body).metadata();
      const raw = await sharp(body).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
      icnsEntries.push({
        type, bytes: size, image: `${meta.width}x${meta.height}`,
        colourType: meta.channels === 4 ? 'RGBA (colour type 6)' : `colour type ${meta.channels}`,
        topLeftAlpha: raw.data[3],
      });
      if (meta.hasAlpha !== true) throw Error(`ICNS entry ${type} has no alpha channel.`);
      if (raw.data[3] !== 0) throw Error(`ICNS entry ${type} has an opaque corner (alpha ${raw.data[3]}).`);
    } else {
      icnsEntries.push({ type, bytes: size, image: type === 'ic04' ? '16x16' : type === 'ic05' ? '32x32' : 'metadata', colourType: body.subarray(0, 4).toString('latin1') === 'ARGB' ? 'RLE ARGB' : 'metadata', topLeftAlpha: 'proven by round trip' });
    }
    offset += size;
  }
  const roundTripDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aexus-icns-check-'));
  const roundTrip = [];
  try {
    const iconset = path.join(roundTripDir, 'Aexus.iconset');
    execFileSync('/usr/bin/iconutil', ['-c', 'iconset', ICNS, '-o', iconset]);
    for (const name of fs.readdirSync(iconset).sort()) {
      const file = path.join(iconset, name);
      const meta = await sharp(file).metadata();
      const raw = await sharp(file).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
      const centre = ((raw.info.height >> 1) * raw.info.width + (raw.info.width >> 1)) * raw.info.channels + 3;
      const cornerAlpha = raw.data[3];
      const centreAlpha = raw.data[centre];
      roundTrip.push({ file: name, image: `${meta.width}x${meta.height}`, hasAlpha: meta.hasAlpha === true, cornerAlpha, centreAlpha });
      if (meta.hasAlpha !== true) throw Error(`ICNS round trip ${name} lost its alpha channel.`);
      if (cornerAlpha !== 0) throw Error(`ICNS round trip ${name} has an opaque corner (alpha ${cornerAlpha}).`);
      if (centreAlpha !== 255) throw Error(`ICNS round trip ${name} has a transparent centre (alpha ${centreAlpha}).`);
    }
  } finally {
    fs.rmSync(roundTripDir, { recursive: true, force: true });
  }
  report['Assets/Aexus.icns'] = { bytes: icns.length, entries: icnsEntries, decodedByIconutil: roundTrip };
  // ICO: PNG entries with alpha, corner transparent at every size.
  const ico = fs.readFileSync(ICO);
  const count = ico.readUInt16LE(4);
  const icoEntries = [];
  for (let i = 0; i < count; i++) {
    const base = 6 + i * 16;
    const w = ico.readUInt8(base) || 256;
    const h = ico.readUInt8(base + 1) || 256;
    const bpp = ico.readUInt16LE(base + 6);
    const bytes = ico.readUInt32LE(base + 8);
    const start = ico.readUInt32LE(base + 12);
    const image = ico.subarray(start, start + bytes);
    if (!image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) throw Error(`ICO entry ${i} is not PNG data.`);
    const raw = await sharp(image).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const meta = await sharp(image).metadata();
    icoEntries.push({ size: `${w}x${h}`, bitsPerPixel: bpp, bytes, declaredImage: `${meta.width}x${meta.height}`, topLeftAlpha: raw.data[3], hasAlpha: meta.hasAlpha === true });
    if (meta.hasAlpha !== true) throw Error(`ICO entry ${w}x${h} has no alpha channel.`);
    if (raw.data[3] !== 0) throw Error(`ICO entry ${w}x${h} has an opaque corner (alpha ${raw.data[3]}).`);
  }
  report['Assets/Aexus.ico'] = { bytes: ico.length, entries: icoEntries };
  return report;
}

// -------------------------------------------------------------------- main

async function main() {
  const argv = process.argv.slice(2);
  const sheetIndex = argv.indexOf('--contact-sheet');
  const sheetDir = sheetIndex >= 0 ? path.resolve(ROOT, argv[sheetIndex + 1]) : null;

  // Copy the raw artwork aside once, before the first rewrite, so the original
  // is always available and every later run reads it as the source of truth.
  if (!fs.existsSync(ORIGINAL)) {
    const meta = await sharp(SOURCE).metadata();
    if (meta.hasAlpha) throw Error('Assets/Aexus-original.png is missing and Assets/Aexus.png already has alpha; cannot recover the original.');
    fs.copyFileSync(SOURCE, ORIGINAL);
    console.log(`preserved raw source -> ${path.relative(ROOT, ORIGINAL)}`);
  }

  const { data, width, height, channels, checks } = await unmatted(ORIGINAL);
  fs.writeFileSync(SOURCE, await png(data, width, height, channels));
  const raster = fs.readFileSync(SOURCE);
  // The written file must decode back to the exact raster that was computed:
  // no palette quantisation, no colour management, no re-compression drift.
  const reread = await sharp(raster).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  if (Buffer.compare(reread.data, data) !== 0) {
    throw Error('Assets/Aexus.png does not decode back to the computed raster; the encoder altered pixels.');
  }
  checks.sourcePixelsRoundTripExact = `${data.length} bytes identical`;
  await writeIcns(raster);
  await writeIco(raster);
  for (const file of [SOURCE, ICNS, ICO, ORIGINAL]) {
    console.log(`${path.relative(ROOT, file)} ${fs.statSync(file).size} bytes`);
  }
  console.log('pixel checks: ' + JSON.stringify(checks, null, 2));
  if (argv.includes('--verify')) console.log('verification: ' + JSON.stringify(await verifyOutputs(), null, 2));
  if (sheetDir) {
    const originalRaster = await sharp(ORIGINAL).png().toBuffer();
    console.log('contact sheet: ' + path.relative(ROOT, await writeContactSheet(raster, sheetDir, { originalRaster })));
  }
}

main().catch(error => { console.error(error.message); process.exit(1); });
