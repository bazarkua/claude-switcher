import { Menu, Tray, nativeImage, screen, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { panelPosition } from '../shared/geometry'
export function createTray(
  window: BrowserWindow,
  resources: string,
  onQuit: () => void,
  isMac: boolean,
): Tray {
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
    window.show()
    window.focus()
  }
  tray.on('click', () => {
    if (window.isVisible()) window.hide()
    else show()
  })
  tray.on('right-click', () =>
    tray.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Claude Switcher', click: show },
        { type: 'separator' },
        { label: 'Quit Claude Switcher', click: onQuit },
      ]),
    ),
  )
  return tray
}
