import {
  _electron as electron,
  test,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
let app: ElectronApplication
let page: Page
let root: string
const capture = async (path: string): Promise<void> => {
  const maximumHeight = await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return Math.min(820, screen.getDisplayMatching(window.getBounds()).workArea.height - 16)
  })
  await expect
    .poll(() =>
      page.evaluate(
        (maximumHeight) =>
          innerHeight ===
          Math.min(
            maximumHeight,
            Math.max(
              220,
              Math.ceil(document.querySelector('main')!.getBoundingClientRect().height),
            ),
          ),
        maximumHeight,
      ),
    )
    .toBe(true)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
  await page.screenshot({ path, animations: 'disabled' })
}
const addAccount = async (name: string): Promise<void> => {
  await page.locator('header').getByRole('button', { name: 'Add account', exact: true }).click()
  await page.getByLabel('Account name').fill(name)
  await page.getByRole('button', { name: 'Add & sign in' }).click()
  await expect(page.locator('.primary')).toBeEnabled()
  await expect(page.getByRole('alert')).toContainText('not found')
  await page.getByRole('button', { name: 'Dismiss message' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
}
test.beforeEach(async () => {
  const testInfo = test.info()
  root = await mkdtemp(join(tmpdir(), 'claude-switcher-electron-'))
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      CLAUDE_SWITCHER_TEST_ROOT: root,
      ELECTRON_RENDERER_URL: '',
    },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  if (!/^(renders|creates)/.test(testInfo.title)) {
    await addAccount('Personal')
    await addAccount(testInfo.title.startsWith('removes') ? 'Studio' : 'Work')
  }
})
test.afterEach(async () => {
  await app?.close()
  if (root) await rm(root, { recursive: true, force: true })
})
test('renders the approved sandboxed tray panel without invented accounts', async () => {
  await expect(page.getByRole('heading', { name: 'Switch account' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Add your first account' })).toBeVisible()
  await expect(page.locator('.primary')).toBeEnabled()
  expect(
    await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require),
  ).toBe('undefined')
  const security = await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents as unknown as {
      getLastWebPreferences(): {
        sandbox: boolean
        contextIsolation: boolean
        nodeIntegration: boolean
      }
    }
    const prefs = contents.getLastWebPreferences()
    return {
      sandbox: prefs.sandbox,
      contextIsolation: prefs.contextIsolation,
      nodeIntegration: prefs.nodeIntegration,
    }
  })
  expect(security).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false })
  await capture('docs/app-light.png')
})
test('creates and selects profiles through real IPC, without sample usage or stale current badges', async () => {
  await addAccount('Personal')
  await addAccount('Work')
  await expect(page.locator('.primary')).toHaveText('Switch to Work')
  await expect(page.getByLabel('Select Work')).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Select Personal').click()
  await expect(page.locator('.primary')).toHaveText('Switch to Personal')
  await expect(page.getByText('Unavailable', { exact: true })).toHaveCount(4)
  await expect(page.getByText('Current', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.locator('.account')).toHaveCount(2)
  expect(await page.evaluate(() => document.querySelector('main')?.scrollLeft)).toBe(0)
  const state = await page.evaluate(() => window.claudeSwitcher.snapshot())
  expect(state.ok && state.value.usage.available).toBe(false)
  await capture('docs/app-profiles.png')
})
test('keeps menus inside the window and manages accounts in Settings', async () => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Profiles', exact: true }).click()
  await expect(page.getByText('Sign-in unverified', { exact: true })).toHaveCount(2)
  await page.getByRole('button', { name: 'Manage Work' }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  expect(
    await page.getByRole('menu').evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return (
        bounds.left >= 0 &&
        bounds.top >= 0 &&
        bounds.right <= innerWidth &&
        bounds.bottom <= innerHeight
      )
    }),
  ).toBe(true)
  await page.getByRole('menuitem', { name: 'Rename account' }).click()
  await page.getByLabel('Account name').fill('Studio')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByRole('button', { name: 'Manage Studio' })).toBeEnabled()
  await page.getByRole('button', { name: 'Close settings', exact: true }).click()
  await expect(page.getByLabel('Select Studio')).toBeVisible()
  const bad = await page.evaluate(() => window.claudeSwitcher.removeProfile('../../Claude'))
  expect(bad.ok).toBe(false)
  const badSize = await page.evaluate(() => window.claudeSwitcher.resizePanel(100000))
  expect(badSize.ok).toBe(false)
})
test('uses neutral colors across settings and dialogs and exposes credential-free diagnostics', async () => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'General', exact: true }).click()
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(
    await page
      .locator('.segmented')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(30, 30, 30)')
  await page.locator('header').getByRole('button', { name: 'Add account', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(
    await page
      .getByRole('button', { name: 'Cancel', exact: true })
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(59, 59, 59)')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await capture('docs/app-settings.png')
  await page.getByRole('button', { name: 'Close settings', exact: true }).click()
  await capture('docs/app-dark.png')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Usage', exact: true }).click()
  await expect(
    page.getByText('No percentages or reset times are estimated.', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'General', exact: true }).click()
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeVisible()
  await expect(page.getByText('Not found', { exact: true })).toHaveCount(2)
  expect(
    JSON.stringify(await page.evaluate(() => window.claudeSwitcher.diagnostics())),
  ).not.toContain('token')
})
test('removes list entries while preserving the profile directory', async () => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Profiles', exact: true }).click()
  const state = await page.evaluate(() => window.claudeSwitcher.snapshot())
  const id = state.ok && state.value.profiles.find((profile) => profile.name === 'Studio')!.id
  await page.getByRole('button', { name: 'Manage Studio' }).click()
  await page.getByRole('menuitem', { name: 'Remove from list' }).click()
  await expect(page.getByRole('button', { name: 'Manage Studio' })).toHaveCount(0)
  const { access } = await import('node:fs/promises')
  await access(join(root, 'managed', 'profiles', String(id)))
})
