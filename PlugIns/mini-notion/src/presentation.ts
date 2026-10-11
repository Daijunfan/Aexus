import type { CSSProperties } from 'react';

/** Cover URLs never become CSS class names. All previews use the same crop. */
export function coverPresentation(cover?: string | null, position = 50) {
  const image = !!cover && /^(asset:|https?:\/\/|data:image\/)/i.test(cover);
  const preset = cover && /^[a-z]+(?:-[a-z]+)?$/.test(cover) ? cover : '';
  return {
    className: image ? 'cover-custom' : preset ? `cover-${preset}` : '',
    style: {
      backgroundPosition: `center ${Math.max(0, Math.min(100, position))}%`,
      ...(image ? { backgroundImage: `url(${JSON.stringify(cover)})` } : {}),
    } as CSSProperties,
  };
}

/** Shared viewport constraint for menus, selects and image pickers. */
export function surfacePosition(x: number, y: number, width: number, height: number,
  viewport: { width: number; height: number }, above?: number) {
  const margin = 8, maxWidth = Math.max(0, viewport.width - margin * 2);
  const maxHeight = Math.max(0, viewport.height - margin * 2);
  const w = Math.min(width, maxWidth), h = Math.min(height, maxHeight);
  const top = y + h > viewport.height - margin && above !== undefined && above >= h + margin ? above - h : y;
  return { left: Math.max(margin, Math.min(x, viewport.width - w - margin)),
    top: Math.max(margin, Math.min(top, viewport.height - h - margin)), width: w, maxWidth, maxHeight };
}
