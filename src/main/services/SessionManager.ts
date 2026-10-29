import { readdir, lstat, open } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createInterface } from 'node:readline'
import { join, basename } from 'node:path'
import { z } from 'zod'
import { contained, exists, regularText } from './files'

export const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export const recordSchema = z.object({
  sessionId: z.string().regex(/^local_[a-f0-9-]{36}$/i),
  cliSessionId: z.uuid(),
  cwd: z.string().min(1).max(32768),
  lastActivityAt: z
    .number()
    .finite()
    .min(978307200000)
    .refine(
      (value) => value <= Date.now() + 86400000,
      'Session timestamp is too far in the future.',
    ),
  createdAt: z.number().finite().optional(),
  lastFocusedAt: z.number().finite().optional(),
  originCwd: z.string().optional(),
  title: z.string().max(10000).optional(),
  titleSource: z.string().optional(),
  model: z.string().optional(),
  effort: z.string().optional(),
  isArchived: z.boolean().optional(),
  completedTurns: z.number().finite().optional(),
  titleTurn: z.number().finite().optional(),
  transcriptUnavailable: z.boolean().optional(),
  previousCliSessionIds: z.array(z.uuid()).max(1000).optional(),
  sessionType: z.never().optional(),
  sshConfig: z.never().optional(),
}) // Unknown fields are stripped: never move nested MCP config or token-bearing state.
export type SessionRecord = z.infer<typeof recordSchema>
export type SessionStore = { directory: string; scope: string }
export type DiscoveredRecord = { path: string; data: SessionRecord }
export class SessionManager {
  constructor(readonly projectsRoot: string) {}
  async stores(root: string): Promise<SessionStore[]> {
    if (!(await exists(root))) return []
    const stores: SessionStore[] = []
    await contained(join(root, '..'), root)
    for (const account of await readdir(root, { withFileTypes: true })) {
      if (!account.isDirectory() || !uuidPattern.test(account.name)) continue
      const accountRoot = join(root, account.name)
      for (const org of await readdir(accountRoot, { withFileTypes: true })) {
        if (!org.isDirectory() || !uuidPattern.test(org.name)) continue
        const directory = join(accountRoot, org.name)
        await contained(root, directory)
        stores.push({ directory, scope: `${account.name}/${org.name}` })
      }
    }
    return stores
  }
  async records(store: SessionStore): Promise<{ records: DiscoveredRecord[]; malformed: number }> {
    const records: DiscoveredRecord[] = []
    let malformed = 0
    for (const entry of await readdir(store.directory, { withFileTypes: true })) {
      if (!/^local_[a-f0-9-]{36}\.json$/i.test(entry.name)) continue
      try {
        const path = join(store.directory, entry.name)
        const data = recordSchema.parse(JSON.parse(await regularText(path)))
        if (basename(path) !== `${data.sessionId}.json`)
          throw new Error('Session identifier mismatch.')
        records.push({ path, data })
      } catch {
        malformed++
      }
    }
    return { records, malformed }
  }
  async transcriptPaths(): Promise<Map<string, string[]>> {
    const found = new Map<string, string[]>()
    if (!(await exists(this.projectsRoot))) return found
    for (const project of await readdir(this.projectsRoot, { withFileTypes: true })) {
      if (!project.isDirectory()) continue
      const root = join(this.projectsRoot, project.name)
      await contained(this.projectsRoot, root)
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
        const id = entry.name.slice(0, -6)
        if (uuidPattern.test(id)) found.set(id, [...(found.get(id) ?? []), join(root, entry.name)])
      }
    }
    return found
  }
  async validateTranscript(path: string, id: string): Promise<boolean> {
    await contained(this.projectsRoot, path)
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size === 0 || info.size > 128 * 1024 * 1024)
      return false
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    const lines = createInterface({ input: handle.createReadStream(), crlfDelay: Infinity })
    let turns = 0
    try {
      for await (const line of lines) {
        if (!line.trim()) continue
        const value: unknown = JSON.parse(line)
        if (!value || typeof value !== 'object') return false
        const record = value as Record<string, unknown>
        if ((record.type === 'user' || record.type === 'assistant') && record.sessionId === id)
          turns++
      }
      return turns > 0
    } catch {
      return false
    } finally {
      lines.close()
      await handle.close().catch(() => {})
    }
  }
}
