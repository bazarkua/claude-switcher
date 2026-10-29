import { BrowserWindow, session, dialog, type Session } from 'electron'
import { join } from 'node:path'
import { z } from 'zod'
import { idSchema } from '../../shared/schemas'
import { atomicWrite, exists, regularText, jsonText } from './files'
import { usageOrganizations, type UsageOrganization, type UsageFetch } from './UsageMonitor'

const connectionSchema = z.record(
  z.uuid(),
  z.object({ uuid: z.uuid(), name: z.string().max(300).optional() }),
)
const allowedHosts = new Set([
  'claude.ai',
  'auth.claude.ai',
  'accounts.google.com',
  'appleid.apple.com',
])
export function usageNavigationAllowed(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      allowedHosts.has(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
    )
  } catch {
    return false
  }
}
export class UsageConnection {
  private connections: Record<string, UsageOrganization> = {}
  private connecting = false
  constructor(private readonly root: string) {}
  async initialize(): Promise<void> {
    const path = join(this.root, 'usage-connections.json')
    if (await exists(path))
      this.connections = connectionSchema.parse(JSON.parse(await regularText(path)))
  }
  organization(id: string): UsageOrganization | undefined {
    return this.connections[id]
  }
  private browserSession(id: string): Session {
    return session.fromPartition(`persist:claude-switcher-usage-${idSchema.parse(id)}`)
  }
  fetch: UsageFetch = async (id, path) => {
    if (!/^\/api\/organizations(?:\/[a-f0-9-]{36}\/usage)?$/.test(path))
      throw new Error('Invalid usage request.')
    const response = await this.browserSession(id).fetch(`https://claude.ai${path}`, {
      method: 'GET',
      credentials: 'include',
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    // Never return remote errors, cookies, or authentication response bodies to the UI.
    let body: unknown = null
    if (response.ok) {
      const text = await response.text()
      if (text.length > 1_048_576) throw new Error('Oversized usage response.')
      body = JSON.parse(text)
    }
    const retryHeader = response.headers.get('retry-after')
    const seconds = Number(retryHeader)
    const retryAfter = Number.isFinite(seconds) && seconds > 0 ? seconds : undefined
    return { status: response.status, body, retryAfter }
  }
  async connect(id: string, name: string, expectedOrganization?: string): Promise<void> {
    idSchema.parse(id)
    if (this.connecting) throw new Error('Finish the existing usage sign-in first.')
    this.connecting = true
    try {
      const browserSession = this.browserSession(id)
      browserSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      )
      browserSession.setPermissionCheckHandler(() => false)
      const login = new BrowserWindow({
        width: 960,
        height: 760,
        title: `Usage for ${name} — sign in, then close this window`,
        webPreferences: {
          session: browserSession,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      })
      login.webContents.on('page-title-updated', (event) => event.preventDefault())
      login.webContents.on('will-navigate', (event, url) => {
        if (!usageNavigationAllowed(url)) event.preventDefault()
      })
      login.webContents.on('will-redirect', (event, url) => {
        if (!usageNavigationAllowed(url)) event.preventDefault()
      })
      login.webContents.setWindowOpenHandler(({ url }) => {
        if (usageNavigationAllowed(url)) void login.loadURL(url).catch(() => {})
        return { action: 'deny' }
      })
      const closed = new Promise<void>((resolve) => login.once('closed', () => resolve()))
      try {
        await login.loadURL('https://claude.ai/settings/usage')
      } catch {
        if (!login.isDestroyed()) login.destroy()
        throw new Error('Could not open Claude sign-in. Try connecting usage again.')
      }
      await closed
      const response = await this.fetch(id, '/api/organizations')
      if (response.status !== 200)
        throw new Error('Usage sign-in did not complete. Connect again and sign in to Claude.')
      let organizations = usageOrganizations.parse(response.body)
      if (expectedOrganization)
        organizations = organizations.filter((org) => org.uuid === expectedOrganization)
      if (!organizations.length)
        throw new Error(
          'The signed-in web account does not match this profile’s organization, or has no organization.',
        )
      const choice = await dialog.showMessageBox({
        type: 'question',
        title: `Connect usage for ${name}`,
        message: 'Choose the organization belonging to this Claude account.',
        detail:
          'This web sign-in is separate from Claude Desktop. Confirm it is the same account before connecting.',
        buttons: ['Cancel', ...organizations.map((org) => org.name || org.uuid)],
        defaultId: 0,
        cancelId: 0,
      })
      if (!choice.response) throw new Error('Usage connection cancelled.')
      this.connections[id] = organizations[choice.response - 1]
      await atomicWrite(join(this.root, 'usage-connections.json'), jsonText(this.connections))
    } finally {
      this.connecting = false
    }
  }
  async disconnect(id: string): Promise<void> {
    idSchema.parse(id)
    if (this.connecting) throw new Error('Finish the usage sign-in before disconnecting.')
    delete this.connections[id]
    await atomicWrite(join(this.root, 'usage-connections.json'), jsonText(this.connections))
    await this.browserSession(id).clearStorageData()
    await this.browserSession(id).clearCache()
  }
}
