import { describe, expect, it } from 'vitest'
import { profileArgument } from '../src/platform/process'
import { panelPosition } from '../src/shared/geometry'
import { idSchema, nameSchema, settingsSchema } from '../src/shared/schemas'
import { MacOSAdapter } from '../src/platform/MacOSAdapter'
import { WindowsAdapter } from '../src/platform/WindowsAdapter'
import { UsageMonitor } from '../src/main/services/UsageMonitor'
import type { Installation } from '../src/shared/types'
describe('platform paths and placement', () => {
  it('preserves spaces and Unicode in quoted and unquoted launch arguments', () => {
    expect(
      profileArgument(
        '/Applications/Claude.app/Contents/MacOS/Claude --user-data-dir=/Users/Test/Library/Application Support/Работа',
      ),
    ).toBe('/Users/Test/Library/Application Support/Работа')
    expect(
      profileArgument(
        '"C:\\Claude\\Claude.exe" --user-data-dir="C:\\Users\\Test User\\Claude Work" --no-sandbox',
      ),
    ).toBe('C:\\Users\\Test User\\Claude Work')
    expect(profileArgument('/Applications/Claude.app/Contents/MacOS/Claude')).toBeNull()
  })
  it('resolves macOS and conventional Windows session paths', async () => {
    expect(await new MacOSAdapter('/Users/test').profileSessionRoot('/Users/test/Profile')).toBe(
      '/Users/test/Profile/claude-code-sessions',
    )
    const adapter = new WindowsAdapter('C:\\Users\\Test', {
      LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local',
    })
    const installation: Installation = {
      executable: 'C:\\Claude.exe',
      version: 'unknown',
      kind: 'classic',
      defaultProfile: 'C:\\Users\\Test\\AppData\\Roaming\\Claude',
    }
    expect(await adapter.profileSessionRoot('C:\\Users\\Test\\Work Profile', installation)).toBe(
      'C:\\Users\\Test\\Work Profile\\claude-code-sessions',
    )
  })
  it('places the popup within negative-coordinate monitor bounds', () => {
    const work = { x: -1920, y: 24, width: 1920, height: 1056 }
    const position = panelPosition({ x: -50, y: 0, width: 24, height: 24 }, work, 390, 670)
    expect(position.x).toBe(-398)
    expect(position.y).toBe(32)
  })
  it('places the popup above a bottom Windows taskbar', () => {
    const position = panelPosition(
      { x: 1870, y: 1040, width: 24, height: 40 },
      { x: 0, y: 0, width: 1920, height: 1040 },
      390,
      670,
    )
    expect(position).toEqual({ x: 1522, y: 362 })
  })
})
describe('IPC input validation and unavailable quotas', () => {
  it('rejects traversal, control characters, extra settings and wrong types', () => {
    expect(idSchema.safeParse('../../Claude').success).toBe(false)
    expect(nameSchema.safeParse('Work\nAccount').success).toBe(false)
    expect(
      settingsSchema.safeParse({
        appearance: 'light',
        syncOnSwitch: true,
        launchAtLogin: false,
        path: '/etc',
      }).success,
    ).toBe(false)
    expect(
      settingsSchema.safeParse({ appearance: 'light', syncOnSwitch: 'yes', launchAtLogin: false })
        .success,
    ).toBe(false)
  })
  it('does not fabricate subscription usage', async () => {
    const monitor = new UsageMonitor(async () => {
      throw new Error('Must not request without a connection')
    })
    expect(await monitor.snapshot('unconnected')).toEqual({
      available: false,
      label: 'Connect usage in Settings → Usage.',
    })
  })
})
