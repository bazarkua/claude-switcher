import { Menu, Tray, nativeImage, screen, type BrowserWindow, type Rectangle } from 'electron'
import { join } from 'node:path'
export function panelPosition(tray: Rectangle, work: Rectangle, width: number, height: number): { x: number; y: number } {
  const x = Math.round(Math.max(work.x + 8, Math.min(tray.x + tray.width / 2 - width / 2, work.x + work.width - width - 8)))
  const below = tray.y + tray.height + 8
  const above = tray.y - height - 8
  const y = Math.round(Math.max(work.y + 8, Math.min(below + height <= work.y + work.height ? below : above, work.y + work.height - height - 8)))
  return { x, y }
}
export function createTray(window: BrowserWindow, resources: string, onQuit: () => void, isMac: boolean): Tray {
  const icon = nativeImage.createFromPath(join(resources, isMac ? 'trayTemplate.png' : 'tray.png'))
  if (isMac) icon.setTemplateImage(true)
  const tray = new Tray(icon)
  tray.setToolTip('Claude Switcher')
  const show = (): void => {
    const bounds = tray.getBounds()
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y })
    const { width, height } = window.getBounds()
    const point = panelPosition(bounds, display.workArea, width, height)
    window.setPosition(point.x, point.y)
    window.show(); window.focus()
  }
  tray.on('click', () => { if (window.isVisible()) window.hide(); else show() })
  tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate([{ label: 'Open Claude Switcher', click: show }, { type: 'separator' }, { label: 'Quit Claude Switcher', click: onQuit }])))
  return tray
}
