import { validColor, readableColor, mixColor } from './color-contrast.mjs';
// Presentation-only palette tokens. They never change source or annotation colors.
export const PALETTES = Object.freeze({
  azure: { title:'晴空蓝', caption:'清晰 · 轻盈', light:'#1769aa', dark:'#8bc9ff', glow:'#7de0dd', fill:'#2278be', end:'#17629e' },
  mint: { title:'薄荷绿', caption:'平静 · 自然', light:'#116e60', dark:'#83dfc5', glow:'#b4e5ac', fill:'#167a66', end:'#0c6659' },
  violet: { title:'鸢尾紫', caption:'专注 · 灵感', light:'#7146b8', dark:'#c8afff', glow:'#cbb0ee', fill:'#7950bd', end:'#6040a1' },
  rose: { title:'蔷薇粉', caption:'柔和 · 温暖', light:'#a73c68', dark:'#ffa8cd', glow:'#f2bcaa', fill:'#b54976', end:'#973d65' },
  amber: { title:'日光金', caption:'明亮 · 质感', light:'#865915', dark:'#f3d08c', glow:'#f3c898', fill:'#91631d', end:'#795016' },
  coral: { title:'珊瑚橙', caption:'活力 · 轻快', light:'#ab432e', dark:'#ffb59f', glow:'#f2d191', fill:'#b34b34', end:'#97402d' },
  iris: { title:'暮光靛', caption:'沉静 · 通透', light:'#455cb0', dark:'#b2c1ff', glow:'#a5dce9', fill:'#5066bd', end:'#3e519d' },
  graphite: { title:'石墨灰', caption:'克制 · 利落', light:'#536071', dark:'#bfcbd9', glow:'#b5ccd6', fill:'#596779', end:'#465465' }
});
export const BACKDROPS = Object.freeze({ plain:'纯净', glow:'柔光', dots:'星点', contour:'涟漪' });
export const VISUAL_DEFAULTS = Object.freeze({ uiPalette:'azure', uiBackdrop:'glow', uiMotion:'system', uiCustomAccent:null, uiCustomGlow:null, uiBackgroundStrength:1 });
export function themeTokens(settings = {}) {
  const preset = PALETTES[settings.uiPalette] || PALETTES.azure;
  const dark = settings.theme === 'dark', warm = settings.theme === 'sepia';
  const surface = dark ? '#212e3d' : warm ? '#fffaf1' : '#ffffff';
  const seed = settings.uiCustomAccent;
  const p = validColor(seed) ? {...preset, light:readableColor(seed,surface), dark:readableColor(seed,surface), fill:readableColor(seed,'#ffffff'), end:readableColor(mixColor(seed,'#000000',.15),'#ffffff')} : {...preset};
  if(validColor(settings.uiCustomGlow))p.glow=settings.uiCustomGlow;
  return {
    '--accent':dark?p.dark:p.light, '--accent-fill':p.fill, '--accent-end':p.end,
    '--accent-ink':'#ffffff', '--accent-glow':p.glow,
    '--backdrop-strength':Number.isFinite(settings.uiBackgroundStrength)?Math.max(0,Math.min(1,settings.uiBackgroundStrength)):1,
    '--bg':dark?'#17212c':warm?'#f3ece0':'#edf3f8',
    '--surface':dark?'#212e3d':warm?'#fffaf1':'#ffffff',
    '--sidebar':dark?'#1c2835':warm?'#f8f1e6':'#f7fafd',
    '--paper':dark?'#253242':warm?'#fffaf0':'#ffffff',
    '--text':dark?'#e8eff7':warm?'#443c30':'#20334b',
    '--muted':dark?'#adbdcf':warm?'#78684f':'#65768a',
    '--line':dark?'#354659':warm?'#dfd5c5':'#dce6ef',
    '--accent-soft':`color-mix(in srgb, ${dark?p.dark:p.light} ${dark?15:9}%, ${dark?'#212e3d':warm?'#fffaf1':'#ffffff'})`,
    '--hover':dark?'#2b3a4c':warm?'#eee4d6':'#edf3f9',
    '--danger':dark?'#ffaaa9':'#b03746',
    '--shadow':dark?'0 12px 44px #00000045':'0 12px 42px #203b5718'
  };
}
export function applyTheme(element, settings) {
  for (const [key,value] of Object.entries(themeTokens(settings))) element.style.setProperty(key,value);
  element.dataset.uiPalette = Object.hasOwn(PALETTES,settings.uiPalette)?settings.uiPalette:'azure';
  element.dataset.uiBackdrop = Object.hasOwn(BACKDROPS,settings.uiBackdrop)?settings.uiBackdrop:'glow';
}
export function avatarTone(id) {
  let hash=0;for(const char of String(id)) hash=(hash*31+char.codePointAt(0))>>>0;
  return Object.keys(PALETTES)[hash%Object.keys(PALETTES).length];
}
export function contrast(a,b) {
  const luminance=hex=>{const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
  const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
