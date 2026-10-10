/** Internal pure helpers shared by knowledge extensions. */
export const array = value => Array.isArray(value) ? value : [];
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const text = value => typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ') : '';
export const key = value => text(value).toLowerCase();
// Two independent 32-bit hashes: stable across Node and browsers, no crypto dependency.
export const idFor = (prefix, value) => {
  let left = 0x811c9dc5, right = 0x9e3779b9;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    left = Math.imul(left ^ code, 16777619);
    right = Math.imul(right ^ code, 2246822519);
  }
  return prefix + '-' + (left >>> 0).toString(16).padStart(8, '0') +
    (right >>> 0).toString(16).padStart(8, '0');
};
export const strings = values => [...new Set(array(values).filter(v => typeof v === 'string' && v.trim()))];
export const union = (into, values) => { for (const value of values) if (!into.includes(value)) into.push(value); };

