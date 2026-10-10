import {deflateRawSync} from "node:zlib";

const table = Uint32Array.from({length: 256}, (_, index) => {
  let crc = index;
  for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  return crc >>> 0;
});
const crc32 = bytes => {
  let value = 0xffffffff;
  for (const byte of bytes) value = table[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

export const wrapWord = body =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:body>' + body + '</w:body></w:document>';

const entry = (name, body, options = {}) => {
  const file = Buffer.from(body);
  const method = options.stored ? 0 : options.method ?? 8;
  const compressed = method === 8 ? deflateRawSync(file) : file;
  const nameBytes = Buffer.from(name);
  const flags = (options.descriptor ? 8 : 0) | (options.encrypted ? 1 : 0);
  const crc = crc32(file);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(flags, 6);
  local.writeUInt16LE(method, 8);
  if (!options.descriptor) {
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.length, 22);
  }
  local.writeUInt16LE(nameBytes.length, 26);
  const descriptor = options.descriptor ? Buffer.alloc(16) : Buffer.alloc(0);
  if (options.descriptor) {
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(compressed.length, 8);
    descriptor.writeUInt32LE(file.length, 12);
  }
  return {nameBytes, file, compressed, method, flags, crc, local,
    localData: Buffer.concat([local, nameBytes, compressed, descriptor])};
};

export function makeDocx(xml, options = {}) {
  const items = [
    ...(options.noManifest ? [] : [entry("[Content_Types].xml", '<?xml version="1.0"?><Types/>', {stored: true})]),
    entry("word/document.xml", xml, options),
  ];
  if (options.duplicateDocument) items.push(entry("word/document.xml", xml, options));
  let offset = 0;
  const parts = [], directory = [];
  for (const item of items) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(item.flags, 8);
    central.writeUInt16LE(item.method, 10);
    central.writeUInt32LE(options.badCrc && item.nameBytes.toString() === "word/document.xml" ? (item.crc ^ 1) >>> 0 : item.crc, 16);
    central.writeUInt32LE(item.compressed.length, 20);
    central.writeUInt32LE(options.fakeExtractedSize !== undefined && item.nameBytes.toString() === "word/document.xml" ? options.fakeExtractedSize : item.file.length, 24);
    central.writeUInt16LE(item.nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, item.nameBytes);
    parts.push(item.localData);
    offset += item.localData.length;
  }
  const index = Buffer.concat(directory);
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(items.length, 8);
  footer.writeUInt16LE(items.length, 10);
  footer.writeUInt32LE(index.length, 12);
  footer.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, index, footer]);
}
