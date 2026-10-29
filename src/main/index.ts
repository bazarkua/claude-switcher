import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell, type IpcMainInvokeEvent, type Tray } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { ZodError } from 'zod'
import type { Diagnostics, Reply, Settings, Snapshot } from '../shared/types'
import { idSchema, nameSchema, settingsSchema } from '../shared/schemas'
import { ProfileManager } from './services/ProfileManager'
import { SwitchCoordinator } from './services/SwitchCoordinator'
import { MacOSAdapter } from '../platform/MacOSAdapter'
import { WindowsAdapter } from '../platform/WindowsAdapter'
import type { PlatformAdapter } from '../platform/PlatformAdapter'
import { atomicWrite, exists, jsonText, regularText } from './services/files'
import { createTray } from './tray'

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'
const testRoot = !app.isPackaged && process.env.NODE_ENV === 'test' ? process.env.CLAUDE_SWITCHER_TEST_ROOT : undefined
if (testRoot) app.setPath('userData', testRoot)
const single = app.requestSingleInstanceLock()
if (!single) app.quit()
let window: BrowserWindow
let tray: Tray | undefined
let coordinator: SwitchCoordinator
let quitting = false
let modal = false
let override: string | undefined

function safeError(error: unknown): string {
  if (error instanceof ZodError) return error.issues[0]?.message ?? 'Invalid request.'
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code)
    if (code === 'EACCES' || code === 'EPERM') return 'Permission denied. Check that Claude Switcher can access its local profiles and Code history.'
    if (code === 'ENOSPC') return 'There is not enough disk space to safely back up your session metadata.'
    if (code === 'ENOENT') return 'A required local file is missing. Open diagnostics and check your Claude installation.'
    return `A local operation failed (${code}). Your original conversations are preserved.`
  }
  return error instanceof Error ? error.message : 'The operation could not be completed.'
}
async function main(): Promise<void> {
  if (!single) return
  if (!isMac && !isWindows) throw new Error('Claude Switcher supports macOS and Windows.')
  const root = join(app.getPath('userData'), 'managed')
  const profiles = new ProfileManager(root)
  await profiles.initialize()
  const platform: PlatformAdapter = isMac ? new MacOSAdapter() : new WindowsAdapter()
  const overridePath = join(root, 'installation.json')
  if (await exists(overridePath)) {
    const parsed: unknown = JSON.parse(await regularText(overridePath))
    if (typeof parsed === 'string') override = parsed
  }
  const detect = async (): ReturnType<PlatformAdapter['detect']> => testRoot ? null : platform.detect(override)
  coordinator = new SwitchCoordinator(profiles, platform, {
    installation: detect,
    confirmClose: async () => {
      modal = true
      try {
        const result = await dialog.showMessageBox(window, {
          type: 'warning', title: 'Ready to switch accounts?',
          message: 'Finish or stop every Claude request first.',
          detail: 'Claude does not expose a reliable generation status. Confirm that all tasks, including Code and Cowork, have stopped. Claude Switcher will ask every Claude window to quit, then open your selected profile.',
          buttons: ['Cancel', 'All tasks have stopped'], defaultId: 0, cancelId: 0,
        })
        return result.response === 1
      } finally { modal = false }
    },
    progress: value => { if (!window.isDestroyed()) window.webContents.send('switcher:progress', value) },
  })
  const resources = app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources')
  const applyAppearance = (settings: Settings): void => { nativeTheme.themeSource = settings.appearance }
  applyAppearance(profiles.snapshot().settings)
  window = new BrowserWindow({
    width: 390, height: 670, show: false, frame: false, resizable: false,
    transparent: true, roundedCorners: true, hasShadow: true, skipTaskbar: true,
    alwaysOnTop: true, title: 'Claude Switcher',
    ...(isMac ? { vibrancy: 'popover' as const, visualEffectState: 'active' as const } : { backgroundMaterial: 'acrylic' as const }),
    backgroundColor: '#00000000', icon: join(resources, 'icon.png'),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  })
  const devURL = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
  const rendererURL = devURL ?? pathToFileURL(join(__dirname, '../renderer/index.html')).href
  const trusted = (event: IpcMainInvokeEvent): boolean => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame?.url === rendererURL
  const handle = (channel: string, fn: (...args: unknown[]) => Promise<unknown>): void => {
    ipcMain.handle(`switcher:${channel}`, async (event, ...args): Promise<Reply<unknown>> => {
      if (!trusted(event)) return { ok: false, error: 'Untrusted request.' }
      try { return { ok: true, value: await fn(...args) } }
      catch (error) {
        const message = safeError(error)
        // Structured diagnostics never include raw paths, arguments, records, or auth content.
        console.error(JSON.stringify({ event: 'operation-failed', operation: channel, code: error instanceof ZodError ? 'INVALID_INPUT' : 'LOCAL_OPERATION' }))
        return { ok: false, error: message }
      }
    })
  }
  const idle = (): void => { if (coordinator.isBusy) throw new Error('Wait for the current switch to finish.') }
  handle('snapshot', async (): Promise<Snapshot> => {
    const installation = await detect()
    return { ...profiles.snapshot(), installation: { found: !!installation, version: installation?.version }, progress: coordinator.progress, lastSync: coordinator.lastSync, recoveryPending: await coordinator.recovery.pending() }
  })
  handle('add', async name => { idle(); return profiles.create(nameSchema.parse(name)) })
  handle('rename', async (id, name) => { idle(); await profiles.rename(idSchema.parse(id), nameSchema.parse(name)) })
  handle('remove', async id => { idle(); await profiles.remove(idSchema.parse(id)) })
  handle('inspect', async id => { idle(); return coordinator.inspect(idSchema.parse(id)) })
  handle('switch', async id => coordinator.switch(idSchema.parse(id)))
  handle('open', async id => {
    if (id !== undefined) return coordinator.switch(idSchema.parse(id))
    const active = profiles.snapshot().activeId
    if (active) return coordinator.switch(active)
    idle()
    const installation = await detect()
    if (!installation) throw new Error('Claude Desktop was not found. Choose its location in Settings.')
    const running = await platform.processes(installation)
    if (!running.length) await platform.launch(installation)
  })
  handle('settings', async value => {
    idle()
    const settings = settingsSchema.parse(value)
    if (!testRoot && settings.launchAtLogin !== profiles.snapshot().settings.launchAtLogin) {
      if (!app.isPackaged) throw new Error('Launch at login is available after installing the packaged app.')
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, openAsHidden: true, args: ['--hidden'] })
    }
    await profiles.settings(settings); applyAppearance(settings)
  })
  handle('diagnostics', async (): Promise<Diagnostics> => {
    const installation = await detect()
    const stores = installation ? await coordinator.stores(installation) : []
    return {
      os: `${platform.name} (${process.arch})`,
      installation: { found: !!installation, version: installation?.version, kind: installation?.kind },
      activeProfile: profiles.snapshot().profiles.find(p => p.id === profiles.snapshot().activeId)?.name ?? null,
      transcriptDirectory: testRoot ? false : await exists(coordinator.sessions.projectsRoot), sessionStores: stores.length,
      compatibility: installation?.version === '4.29.0' ? '4.29.0 local schema inspected. Live continuation unverified.' : 'Version-dependent. Only recognized records are synchronized.',
      lastSync: coordinator.lastSync, lastError: coordinator.lastError, recoveryPending: await coordinator.recovery.pending(),
    }
  })
  handle('recover', async () => coordinator.recover())
  handle('backups', async () => { await mkdir(coordinator.recovery.backupsRoot, { recursive: true, mode: 0o700 }); const error = await shell.openPath(coordinator.recovery.backupsRoot); if (error) throw new Error('The backup folder could not be opened.') })
  handle('installation', async () => {
    idle(); modal = true
    try {
      const result = await dialog.showOpenDialog(window, { title: 'Choose Claude Desktop', properties: ['openFile'], filters: [{ name: 'Claude Desktop', extensions: [isMac ? 'app' : 'exe'] }] })
      if (result.canceled) return
      const chosen = result.filePaths[0]
      if (!(await platform.detect(chosen))) throw new Error('Choose the official Claude Desktop application.')
      await atomicWrite(overridePath, jsonText(chosen)); override = chosen
    } finally { modal = false }
  })
  ipcMain.on('switcher:dismiss', event => { if (event.sender === window.webContents) window.hide() })
  ipcMain.on('switcher:quit', event => { if (event.sender === window.webContents && !coordinator.isBusy) { quitting = true; app.quit() } })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.on('blur', () => { if (!modal && !testRoot && !coordinator.isBusy) window.hide() })
  window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide() } })
  window.webContents.on('before-input-event', (event, input) => { if (input.key === 'Escape') { event.preventDefault(); window.hide() } })
  tray = createTray(window, resources, () => { if (!coordinator.isBusy) { quitting = true; app.quit() } }, isMac)
  app.dock?.hide()
  app.on('second-instance', () => { window.show(); window.focus() })
  window.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) { window.show(); window.focus() } })
  if (devURL) await window.loadURL(devURL)
  else await window.loadFile(join(__dirname, '../renderer/index.html'))
}
app.on('before-quit', event => {
  if (coordinator?.isBusy) { event.preventDefault(); return }
  quitting = true
  tray?.destroy()
})
app.on('window-all-closed', () => {})
app.whenReady().then(main).catch(error => { dialog.showErrorBox('Claude Switcher could not start', safeError(error)); quitting = true; app.quit() })
