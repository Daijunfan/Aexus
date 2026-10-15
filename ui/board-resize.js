// A board row changes height only; widths and column count remain unchanged.
export const MIN_ROW_HEIGHT = 240
export const MAX_ROW_HEIGHT = 1000
const limit = height => Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, Math.round(height / 10) * 10))

export function dragRowHeight(initialHeight, deltaY) {
  return limit(initialHeight + deltaY)
}

export function keyRowHeight(currentHeight, key, step = 10) {
  if (key === 'Home') return MIN_ROW_HEIGHT
  if (key === 'End') return MAX_ROW_HEIGHT
  if (key === 'ArrowUp') return limit(currentHeight - step)
  if (key === 'ArrowDown') return limit(currentHeight + step)
  return null
}
