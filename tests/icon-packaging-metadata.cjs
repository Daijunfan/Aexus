// Basic icon packaging metadata check.
//
// This only compares hashes and alpha metadata of the packaged copies against the
// accepted source assets. It makes no image-quality or design judgement; those
// belong to the owner of Assets/. Run after `python3 build.py`.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const ROOT = path.resolve(__dirname, '..');
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const checks = [];
const check = (name, passed, detail) => checks.push({ name, passed: !!passed, detail: detail === undefined ? '' : String(detail) });

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw Error('not a PNG');
  let offset = 8, header = null; const data = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), bitDepth: body[8], colorType: body[9], interlace: body[12] };
    if (type === 'IDAT') data.push(body);
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (!header) throw Error('PNG without IHDR');
  if (header.interlace !== 0) throw Error('interlaced PNG unsupported');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[header.colorType];
  if (!channels || header.bitDepth !== 8) throw Error('unsupported PNG colour type ' + header.colorType + '/' + header.bitDepth);
  const raw = zlib.inflateSync(Buffer.concat(data));
  const stride = header.width * channels, out = Buffer.alloc(stride * header.height);
  let position = 0;
  for (let y = 0; y < header.height; y++) {
    const filter = raw[position++];
    const line = raw.subarray(position, position + stride); position += stride;
    const target = out.subarray(y * stride, (y + 1) * stride);
    const prior = y === 0 ? Buffer.alloc(stride) : out.subarray((y - 1) * stride, y * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? target[x - channels] : 0, b = prior[x], c = x >= channels ? prior[x - channels] : 0, value = line[x];
      target[x] = (filter === 0 ? value : filter === 1 ? value + a : filter === 2 ? value + b
        : filter === 3 ? value + ((a + b) >> 1) : value + paeth(a, b, c)) & 0xff;
    }
  }
  return {
    width: header.width, height: header.height, colorType: header.colorType, hasAlpha: channels === 4 || channels === 2,
    pixel: (x, y) => { const at = y * stride + x * channels; return { r: out[at], g: out[at + 1], b: out[at + 2], a: channels >= 4 ? out[at + 3] : 255 } }
  };
}
function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
const corners = image => [[0, 0], [image.width - 1, 0], [0, image.height - 1], [image.width - 1, image.height - 1]].map(([x, y]) => image.pixel(x, y).a);

const source = path.join(ROOT, 'Assets/Aexus.png');
const sourceHash = sha(fs.readFileSync(source));
const sourceImage = decodePng(fs.readFileSync(source));
check('Assets/Aexus.png carries an alpha channel', sourceImage.hasAlpha, 'colorType=' + sourceImage.colorType);
check('Assets/Aexus.png is transparent at all four corners', corners(sourceImage).every(alpha => alpha === 0), 'cornerAlpha=' + corners(sourceImage).join(','));
const brightPartial = (() => {
  let bright = 0;
  for (let y = 0; y < sourceImage.height; y++) for (let x = 0; x < sourceImage.width; x++) {
    const pixel = sourceImage.pixel(x, y);
    if (pixel.a > 0 && pixel.a < 200 && pixel.r + pixel.g + pixel.b > 600) bright++;
  }
  return bright;
})();
check('Assets/Aexus.png has no bright pixel with partial alpha (no pale halo on a dark background)', brightPartial === 0, 'brightPartial=' + brightPartial);

// Every packaged copy must be byte-identical to the accepted source asset.
const copies = [
  ['artifacts/icon.png', sourceHash],
  ['dist/ui/aexus.png', sourceHash],
  ['artifacts/Aexus.app/Contents/Resources/Aexus.icns', sha(fs.readFileSync(path.join(ROOT, 'Assets/Aexus.icns')))]
];
for (const [relative, expected] of copies) {
  const file = path.join(ROOT, relative);
  if (!fs.existsSync(file)) { check(relative + ' exists', false, 'missing'); continue }
  const actual = sha(fs.readFileSync(file));
  check(relative + ' matches the accepted asset byte for byte', actual === expected, actual.slice(0, 16) + (actual === expected ? ' match' : ' != ' + expected.slice(0, 16)));
}

// The icns container must carry transparent, alpha-bearing bitmaps at every scale.
try {
  const icns = fs.readFileSync(path.join(ROOT, 'Assets/Aexus.icns'));
  const entries = [];
  let offset = 8;
  while (offset + 8 <= icns.length) {
    const type = icns.toString('ascii', offset, offset + 4), size = icns.readUInt32BE(offset + 4);
    if (size < 8 || offset + size > icns.length) break;
    entries.push({ type, body: icns.subarray(offset + 8, offset + size) });
    offset += size;
  }
  check('Assets/Aexus.icns holds multiple image entries', entries.length >= 5, 'entries=' + entries.length + ' types=' + entries.map(entry => entry.type).join(','));
  const pngs = entries.filter(entry => entry.body.length > 8 && entry.body.readUInt32BE(0) === 0x89504e47);
  check('Every PNG-bearing icns entry is transparent at the corners', pngs.length > 0 && pngs.every(entry => corners(decodePng(entry.body)).every(alpha => alpha === 0)),
    'pngEntries=' + pngs.length + '/' + entries.length);
} catch (error) { check('Assets/Aexus.icns is readable', false, error.message) }

try {
  const ico = fs.readFileSync(path.join(ROOT, 'Assets/Aexus.ico'));
  const count = ico.readUInt16LE(4), entries = [];
  for (let index = 0; index < count; index++) {
    const at = 6 + index * 16;
    entries.push({ width: ico[at] || 256, height: ico[at + 1] || 256, bits: ico.readUInt16LE(at + 6), size: ico.readUInt32LE(at + 8), offset: ico.readUInt32LE(at + 12) });
  }
  check('Assets/Aexus.ico is a real icon container with several sizes', count >= 5, 'entries=' + count + ' sizes=' + entries.map(entry => entry.width).join(','));
  check('Every Assets/Aexus.ico entry is 32bpp so the transparency survives', entries.every(entry => entry.bits === 32), 'bits=' + [...new Set(entries.map(entry => entry.bits))].join(','));
  const embedded = entries.map(entry => ico.subarray(entry.offset, entry.offset + entry.size)).filter(body => body.length > 8 && body.readUInt32BE(0) === 0x89504e47);
  check('Every PNG-compressed ico entry is transparent at the corners', embedded.length === 0 || embedded.every(body => corners(decodePng(body)).every(alpha => alpha === 0)), 'pngEntries=' + embedded.length + '/' + count);
} catch (error) { check('Assets/Aexus.ico is readable', false, error.message) }

const failed = checks.filter(entry => !entry.passed);
for (const entry of checks) console.log((entry.passed ? 'PASS ' : 'FAIL ') + entry.name + (entry.detail ? ' — ' + entry.detail : ''));
console.log('ICON_PACKAGING_METADATA', checks.length - failed.length + '/' + checks.length, failed.length ? 'FAIL' : 'PASS');
process.exit(failed.length ? 1 : 0);
