// Deterministic color derivation; accept only six-digit RGB, never CSS fragments.
export const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export function mixColor(a, b, amount) {
  const channels = value => [1, 3, 5].map(at => parseInt(value.slice(at, at + 2), 16));
  const x = channels(a), y = channels(b), t = Math.max(0, Math.min(1, amount));
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
export function contrast(a, b) {
  const luminance = hex => {
    const c = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255)
      .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
export function readableColor(seed, background, minimum = 4.6) {
  if (contrast(seed, background) >= minimum) return seed;
  const toward = contrast('#000000', background) > contrast('#ffffff', background) ? '#000000' : '#ffffff';
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) {
    const middle = (lo + hi) / 2;
    if (contrast(mixColor(seed, toward, middle), background) >= minimum) hi = middle;
    else lo = middle;
  }
  return mixColor(seed, toward, hi);
}
