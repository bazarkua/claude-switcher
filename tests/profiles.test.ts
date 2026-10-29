import { afterEach, describe, expect, it } from 'vitest'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ProfileManager } from '../src/main/services/ProfileManager'
import { exists } from '../src/main/services/files'
import { temporary } from './helpers'
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
const manager = async (): Promise<ProfileManager> => {
  const root = await temporary()
  roots.push(root)
  const manager = new ProfileManager(root)
  await manager.initialize()
  return manager
}
describe('isolated profiles', () => {
  it('creates, persists, selects and renames Unicode accounts with spaces', async () => {
    const profiles = await manager()
    const profile = await profiles.create('  Работа & Personal  ')
    await profiles.active(profile.id)
    await profiles.rename(profile.id, 'Work account')
    const restored = new ProfileManager(profiles.root)
    await restored.initialize()
    expect(restored.get(profile.id)).toMatchObject({
      name: 'Work account',
      connection: 'unverified',
    })
    expect(restored.snapshot().activeId).toBe(profile.id)
    expect(await exists(restored.directory(profile.id))).toBe(true)
  })
  it('serializes concurrent creates without losing an account', async () => {
    const profiles = await manager()
    await Promise.all([profiles.create('Work'), profiles.create('Personal')])
    expect(profiles.snapshot().profiles).toHaveLength(2)
  })
  it('rejects duplicate names and malformed identifiers', async () => {
    const profiles = await manager()
    await profiles.create('Work')
    await expect(profiles.create('work')).rejects.toThrow('already exists')
    await expect(profiles.create('  ')).rejects.toThrow()
    expect(() => profiles.get('../../Claude')).toThrow()
    expect(() => profiles.get(randomUUID())).toThrow('no longer exists')
  })
  it('retains all profile files when removing an account', async () => {
    const profiles = await manager()
    const account = await profiles.create('Personal')
    const path = join(profiles.directory(account.id), 'untouched.json')
    await writeFile(path, 'original')
    await profiles.active(account.id)
    await profiles.remove(account.id)
    expect(await readFile(path, 'utf8')).toBe('original')
    expect(profiles.snapshot().activeId).toBeUndefined()
  })
  it('preserves a malformed store and refuses to replace it with empty data', async () => {
    const profiles = await manager()
    await writeFile(join(profiles.root, 'profiles.json'), 'broken')
    await expect(new ProfileManager(profiles.root).initialize()).rejects.toThrow()
    expect(await readFile(join(profiles.root, 'profiles.json'), 'utf8')).toBe('broken')
  })
})
