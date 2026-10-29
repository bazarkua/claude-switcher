import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ProfileManager } from '../src/main/services/ProfileManager'
import { SwitchCoordinator } from '../src/main/services/SwitchCoordinator'
import { SwitchLock } from '../src/main/services/SwitchLock'
import type { PlatformAdapter, ClaudeProcess } from '../src/platform/PlatformAdapter'
import type { Installation, Progress } from '../src/shared/types'
import { temporary, store, record, metadata, transcript } from './helpers'
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  vi.restoreAllMocks()
})
async function fixture() {
  const root = await temporary()
  roots.push(root)
  const profiles = new ProfileManager(join(root, 'managed'))
  await profiles.initialize()
  const a = await profiles.create('Personal')
  const b = await profiles.create('Work')
  const install: Installation = {
    executable: '/fixture/Claude',
    version: '4.29.0',
    kind: 'mac',
    defaultProfile: join(root, 'default'),
  }
  let running: ClaudeProcess[] = []
  const platform: PlatformAdapter = {
    name: 'Fixture',
    home: root,
    detect: vi.fn(async () => install),
    processes: vi.fn(async () => running),
    launch: vi.fn(async (_install, profile) => {
      running = [{ pid: 1234, profile: profile ?? null }]
    }),
    close: vi.fn(async () => {
      running = []
    }),
    profileSessionRoot: async (profile) => join(profile, 'claude-code-sessions'),
  }
  const progress: Progress[] = []
  const confirmClose = vi.fn(async () => true)
  const coordinator = new SwitchCoordinator(profiles, platform, {
    installation: platform.detect,
    confirmClose,
    progress: (value) => progress.push(value),
  })
  return {
    root,
    profiles,
    a,
    b,
    platform,
    install,
    coordinator,
    progress,
    confirmClose,
    setRunning: (list: ClaudeProcess[]) => {
      running = list
    },
  }
}
describe('serialized account switching', () => {
  it('verifies a launched profile and avoids relaunching the current one', async () => {
    const f = await fixture()
    await f.coordinator.switch(f.a.id)
    expect(f.profiles.snapshot().activeId).toBe(f.a.id)
    expect(f.progress.map((p) => p.stage)).toEqual([
      'VALIDATING',
      'CHECKING_ACTIVITY',
      'SNAPSHOTTING',
      'SYNCHRONIZING',
      'LAUNCHING_TARGET',
      'VERIFYING',
      'COMPLETED',
    ])
    expect(f.coordinator.lastSync?.status).toBe('unavailable')
    await f.coordinator.switch(f.a.id)
    expect(f.platform.launch).toHaveBeenCalledTimes(1)
  })
  it('rejects concurrent switches and releases the lock after failure', async () => {
    const f = await fixture()
    const first = f.coordinator.switch(f.a.id)
    await expect(f.coordinator.switch(f.b.id)).rejects.toThrow('already in progress')
    await first
    await expect(f.coordinator.switch(randomUUID())).rejects.toThrow('no longer exists')
    await f.coordinator.switch(f.a.id)
    expect(f.coordinator.isBusy).toBe(false)
  })
  it('requires user confirmation before closing existing Claude windows', async () => {
    const f = await fixture()
    f.setRunning([{ pid: 333, profile: null }])
    f.confirmClose.mockResolvedValue(false)
    await expect(f.coordinator.switch(f.a.id)).rejects.toThrow('canceled')
    expect(f.platform.close).not.toHaveBeenCalled()
    expect(f.platform.launch).not.toHaveBeenCalled()
    expect(f.profiles.snapshot().activeId).toBeUndefined()
  })
  it('closes gracefully before launch and reports the selected account only after verification', async () => {
    const f = await fixture()
    f.setRunning([{ pid: 333, profile: null }])
    await f.coordinator.switch(f.b.id)
    expect(f.confirmClose).toHaveBeenCalledTimes(1)
    expect(f.platform.close).toHaveBeenCalledTimes(1)
    expect(f.profiles.snapshot().activeId).toBe(f.b.id)
  })
  it('does not infer an active account from multiple organization stores', async () => {
    const f = await fixture()
    const root = join(f.profiles.directory(f.a.id), 'claude-code-sessions')
    await mkdir(join(root, randomUUID(), randomUUID()), { recursive: true })
    expect((await f.coordinator.inspect(f.a.id)).connection).toBe('local-account-detected')
    await mkdir(join(root, randomUUID(), randomUUID()), { recursive: true })
    expect((await f.coordinator.inspect(f.a.id)).scope).toBeUndefined()
  })
  it('fails actionably when installation is missing', async () => {
    const f = await fixture()
    vi.mocked(f.platform.detect).mockResolvedValue(null)
    await expect(f.coordinator.switch(f.a.id)).rejects.toThrow('not found')
    expect(f.platform.launch).not.toHaveBeenCalled()
  })
  it('restores metadata and reopens the previous profile after a failed launch', async () => {
    const f = await fixture()
    const source = await store(join(f.install.defaultProfile, 'claude-code-sessions'))
    const target = await store(join(f.profiles.directory(f.b.id), 'claude-code-sessions'))
    const a = record()
    await metadata(source, a)
    const path = await metadata(target, {
      ...a,
      title: 'Original target',
      lastActivityAt: a.lastActivityAt - 1000,
    })
    const before = await readFile(path, 'utf8')
    await transcript(f.coordinator.sessions.projectsRoot, a)
    await f.profiles.active(f.a.id)
    f.setRunning([{ pid: 333, profile: f.profiles.directory(f.a.id) }])
    vi.mocked(f.platform.launch).mockRejectedValueOnce(new Error('Fixture launch failed'))
    await expect(f.coordinator.switch(f.b.id)).rejects.toThrow('Fixture launch failed')
    expect(await readFile(path, 'utf8')).toBe(before)
    expect(await f.coordinator.recovery.pending()).toBe(false)
    expect(f.profiles.snapshot().activeId).toBe(f.a.id)
    expect(f.platform.launch).toHaveBeenLastCalledWith(f.install, f.profiles.directory(f.a.id))
  })
})
describe('cross-process switch lock', () => {
  it('blocks live owners and reclaims a dead owner', async () => {
    const root = await temporary()
    roots.push(root)
    const first = new SwitchLock(root)
    const release = await first.acquire()
    await expect(new SwitchLock(root).acquire()).rejects.toThrow('Another')
    await release()
    await writeFile(join(root, 'switch.lock'), '2147483647')
    const releaseStale = await new SwitchLock(root).acquire()
    await releaseStale()
  })
})
