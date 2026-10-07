export function ColorSwatch({ color, background = false }: { color: string; background?: boolean }) {
  return <span aria-hidden="true" className="block-color-sample"
    style={{ background: color === 'default' ? (background ? 'var(--bg)' : 'var(--text)') : `var(--bn-colors-highlights-${color}-${background ? 'background' : 'text'})` }} />;
}
