/** Small, versioned palette data shared by schema, renderer and theme previews. */
export const colorThemes = {
  classic: { name: '留白', accent: '#0b6bcb', companion: '#8994c9', light: '#ffffff', dark: '#191919' },
  ocean: { name: '晴空', accent: '#1978b7', companion: '#36b4b0', light: '#f7fbff', dark: '#131e2a' },
  aurora: { name: '极光', accent: '#326ec6', companion: '#36b396', light: '#f8fbff', dark: '#172331' },
  iris: { name: '鸢尾', accent: '#7455bf', companion: '#ca8ebc', light: '#fbf9ff', dark: '#211b31' },
  rose: { name: '樱桃', accent: '#b44476', companion: '#eca175', light: '#fff9fb', dark: '#2b1c28' },
  sunset: { name: '落日', accent: '#a65b30', companion: '#e6ac58', light: '#fffbf6', dark: '#28211c' },
  mint: { name: '薄荷', accent: '#1d795f', companion: '#80b95c', light: '#f7fcfa', dark: '#162620' },
  graphite: { name: '石墨', accent: '#59657b', companion: '#8996b8', light: '#fafbfc', dark: '#1c2028' },
} as const;
export type ColorTheme = keyof typeof colorThemes;
export const colorThemeNames = Object.keys(colorThemes) as ColorTheme[];
export const wallpapers = { none: '纯净', glow: '流光', dots: '微点', grid: '方格' } as const;
export type Wallpaper = keyof typeof wallpapers;
