import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { idSchema, nameSchema, settingsSchema, storeSchema } from '../../shared/schemas'
import type { Profile, Settings, Store } from '../../shared/types'
import { atomicWrite, contained, exists, jsonText, regularText } from './files'

const initial = (): Store => ({
  version: 1,
  profiles: [],
  settings: { appearance: 'system', syncOnSwitch: true, launchAtLogin: false },
})
export class ProfileManager {
  private store: Store = initial()
  private queue = Promise.resolve()
  constructor(readonly root: string) {}
  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    if (await exists(join(this.root, 'profiles.json')))
      this.store = storeSchema.parse(
        JSON.parse(await regularText(join(this.root, 'profiles.json'))),
      )
  }
  snapshot(): Store {
    return structuredClone(this.store)
  }
  directory(id: string): string {
    return join(this.root, 'profiles', idSchema.parse(id))
  }
  get(id: string): Profile {
    idSchema.parse(id)
    const profile = this.store.profiles.find((p) => p.id === id)
    if (!profile) throw new Error('That account no longer exists. Add it again to continue.')
    return structuredClone(profile)
  }
  private mutate(fn: (next: Store) => Promise<void> | void): Promise<void> {
    const operation = this.queue.then(async () => {
      const next = this.snapshot()
      await fn(next)
      await contained(this.root, join(this.root, 'profiles.json'))
      await atomicWrite(join(this.root, 'profiles.json'), jsonText(next))
      this.store = next
    })
    this.queue = operation.catch(() => {})
    return operation
  }
  async create(name: string): Promise<Profile> {
    const profile: Profile = {
      id: randomUUID(),
      name: nameSchema.parse(name),
      color: 'peach',
      createdAt: new Date().toISOString(),
      connection: 'unverified',
    }
    await this.mutate(async (next) => {
      if (next.profiles.length >= 20) throw new Error('You can manage up to 20 accounts.')
      if (next.profiles.some((p) => p.name.toLowerCase() === profile.name.toLowerCase()))
        throw new Error('An account with that name already exists.')
      profile.color = (['peach', 'lavender', 'slate'] as const)[next.profiles.length % 3]
      await contained(this.root, this.directory(profile.id))
      await mkdir(this.directory(profile.id), { recursive: true, mode: 0o700 })
      next.profiles.push(profile)
    })
    return profile
  }
  async rename(id: string, name: string): Promise<void> {
    this.get(id)
    const parsed = nameSchema.parse(name)
    await this.mutate((next) => {
      if (next.profiles.some((p) => p.id !== id && p.name.toLowerCase() === parsed.toLowerCase()))
        throw new Error('An account with that name already exists.')
      next.profiles.find((p) => p.id === id)!.name = parsed
    })
  }
  async remove(id: string): Promise<void> {
    this.get(id)
    await this.mutate((next) => {
      next.profiles = next.profiles.filter((p) => p.id !== id)
      if (next.activeId === id) delete next.activeId
    })
    // Deliberately retain the isolated directory and its original conversations.
  }
  async active(id: string): Promise<void> {
    this.get(id)
    await this.mutate((next) => {
      next.activeId = id
    })
  }
  async settings(value: Settings): Promise<void> {
    const parsed = settingsSchema.parse(value)
    await this.mutate((next) => {
      next.settings = parsed
    })
  }
  async scope(id: string, scope?: string): Promise<Profile> {
    this.get(id)
    await this.mutate((next) => {
      const p = next.profiles.find((p) => p.id === id)!
      p.connection = scope ? 'local-account-detected' : 'unverified'
      p.scope = scope
    })
    return this.get(id)
  }
}
