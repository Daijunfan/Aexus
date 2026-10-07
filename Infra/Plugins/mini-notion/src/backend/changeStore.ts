import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicWrite } from '../../electron/storage.cjs';

type Entry = { id: string };
type Index = { format: 'mininotion.history/v2'; entries: { id: string; hash: string }[] };
const hashOf = (body: string) => createHash('sha256').update(body).digest('hex');
/** Segmented undo history: updating one edit does not rewrite every prior patch.
 * The old changes.json remains an untouched compatibility backup. */
export class ChangeStore<T extends Entry> {
  private index: string;
  private objects: string;
  private refs = new Map<string, string>();
  private saves = 0;
  constructor(private directory: string) {
    this.index = path.join(directory, 'changes-index.json');
    this.objects = path.join(directory, 'cache', 'changes');
  }
  load(): T[] {
    if (!fs.existsSync(this.index)) {
      const legacy = path.join(this.directory, 'changes.json');
      const entries = fs.existsSync(legacy) ? JSON.parse(fs.readFileSync(legacy, 'utf8')) : [];
      if (!Array.isArray(entries)) throw new Error('操作历史格式无效');
      if (entries.length) this.save(entries);
      return entries;
    }
    const value = JSON.parse(fs.readFileSync(this.index, 'utf8')) as Index;
    if (value.format !== 'mininotion.history/v2' || !Array.isArray(value.entries)) throw new Error('操作历史索引无效');
    return value.entries.map(ref => {
      if (!/^[a-f0-9]{64}$/.test(ref.hash)) throw new Error('操作历史对象标识无效');
      const body = fs.readFileSync(path.join(this.objects, ref.hash + '.json'), 'utf8');
      if (hashOf(body) !== ref.hash) throw new Error('操作历史校验失败');
      const entry = JSON.parse(body) as T;
      if (entry.id !== ref.id) throw new Error('操作历史身份不一致');
      this.refs.set(entry.id, ref.hash); return entry;
    });
  }
  save(entries: T[], changed?: Set<string>) {
    fs.mkdirSync(this.objects, { recursive: true });
    const refs = new Map<string, string>();
    const items = entries.map(entry => {
      let hash = changed && !changed.has(entry.id) ? this.refs.get(entry.id) : undefined;
      if (!hash) {
        const body = JSON.stringify(entry); hash = hashOf(body);
        const file = path.join(this.objects, hash + '.json');
        if (!fs.existsSync(file)) atomicWrite(file, body);
        else if (hashOf(fs.readFileSync(file,'utf8')) !== hash) throw new Error('操作历史对象损坏');
      }
      refs.set(entry.id, hash); return { id: entry.id, hash };
    });
    if (fs.existsSync(this.index)) atomicWrite(this.index + '.previous', fs.readFileSync(this.index, 'utf8'));
    atomicWrite(this.index, { format: 'mininotion.history/v2', entries: items });
    this.refs = refs;
    if (++this.saves % 64 === 0) { try { this.collect(); } catch { /* retry housekeeping later */ } }
  }
  private collect() {
    const keep = new Set<string>();
    for (const file of [this.index, this.index + '.previous']) {
      if (!fs.existsSync(file)) continue;
      const value = JSON.parse(fs.readFileSync(file, 'utf8')) as Index;
      for (const entry of value.entries) keep.add(entry.hash);
    }
    for (const name of fs.readdirSync(this.objects))
      if (/^[a-f0-9]{64}\.json$/.test(name) && !keep.has(name.slice(0,-5))) fs.unlinkSync(path.join(this.objects,name));
  }
}
