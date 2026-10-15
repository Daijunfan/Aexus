// Migrated from Aexus, GPL-3.0-only.
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var stdin_exports = {};
__export(stdin_exports, {
  TerminalOutput: () => TerminalOutput
});
module.exports = __toCommonJS(stdin_exports);
class TerminalOutput {
  constructor(limit = 256e3) {
    this.limit = limit;
  }
  cursor = 0;
  length = 0;
  chunks = [];
  append(data) {
    if (!data) return;
    this.cursor += data.length;
    if (data.length >= this.limit) {
      this.chunks = [data.slice(-this.limit)];
      this.length = this.limit;
    } else {
      const last = this.chunks.length - 1;
      if (last >= 0 && this.chunks[last].length + data.length <= 4096) this.chunks[last] += data;
      else this.chunks.push(data);
      this.length += data.length;
      while (this.length > this.limit) {
        const excess = this.length - this.limit, first2 = this.chunks[0];
        if (first2.length <= excess) {
          this.chunks.shift();
          this.length -= first2.length;
        } else {
          this.chunks[0] = first2.slice(excess);
          this.length -= excess;
        }
      }
    }
    const first = this.chunks[0]?.charCodeAt(0);
    if (first >= 56320 && first <= 57343) {
      this.chunks[0] = this.chunks[0].slice(1);
      this.length--;
      if (!this.chunks[0]) this.chunks.shift();
    }
  }
  read(cursor = 0, maxChars = this.limit) {
    const start = this.cursor - this.length, reset = cursor < start;
    let skip = Math.max(0, cursor - start);
    if (skip >= this.length) return { output: "", cursor: this.cursor, reset };
    const result = [];let remaining = maxChars, taken = 0;
    for (const chunk of this.chunks) {
      if (skip >= chunk.length) skip -= chunk.length;
      else {
        const part = (skip ? chunk.slice(skip) : chunk).slice(0, remaining);
        result.push(part);remaining -= part.length;taken += part.length;
        skip = 0;
        if (!remaining) break;
      }
    }
    let output = result.join("");
    const last = output.charCodeAt(output.length - 1);
    if (last >= 0xD800 && last <= 0xDBFF) {output=output.slice(0,-1);taken--;}
    return { output, cursor: Math.max(cursor,start)+taken, reset };
  }
}
