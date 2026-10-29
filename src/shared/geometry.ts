type Rectangle = { x: number; y: number; width: number; height: number }
export function panelPosition(
  tray: Rectangle,
  work: Rectangle,
  width: number,
  height: number,
): { x: number; y: number } {
  const x = Math.round(
    Math.max(
      work.x + 8,
      Math.min(tray.x + tray.width / 2 - width / 2, work.x + work.width - width - 8),
    ),
  )
  const below = tray.y + tray.height + 8
  const above = tray.y - height - 8
  const y = Math.round(
    Math.max(
      work.y + 8,
      Math.min(
        below + height <= work.y + work.height ? below : above,
        work.y + work.height - height - 8,
      ),
    ),
  )
  return { x, y }
}
