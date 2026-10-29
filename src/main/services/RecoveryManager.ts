import { join, relative, isAbsolute } from 'node:path'
import { mkdir, unlink, readdir } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { atomicWrite, contained, exists, jsonText, regularText } from './files'

const hash = (text: string): string => createHash('sha256').update(text).digest('hex')
const journalSchema = z.object({
  id: z.uuid(), status: z.enum(['pending', 'committed', 'rolled-back']),
  entries: z.array(z.object({ destination: z.string(), backup: z.string().nullable(), beforeHash: z.string().nullable(), afterHash: z.string() })),
})
type Journal = z.infer<typeof journalSchema>
export class RecoveryManager {
  private journal: Journal | null = null
  readonly backupsRoot: string
  constructor(readonly root: string, readonly allowedDestinations: () => Promise<string[]>) { this.backupsRoot = join(root, 'backups') }
  private async validDestination(path: string): Promise<void> {
    for (const root of await this.allowedDestinations()) {
      const rel = relative(root, path)
      if (rel && !rel.startsWith('..') && !isAbsolute(rel) && /^[a-f0-9-]{36}[/\\][a-f0-9-]{36}[/\\]local_[a-f0-9-]{36}\.json$/i.test(rel)) {
        await contained(root, path)
        return
      }
    }
    throw new Error('Recovery destination is outside managed Code session storage.')
  }
  async pending(): Promise<boolean> {
    if (!(await exists(join(this.root, 'journal.json')))) return false
    const j = journalSchema.parse(JSON.parse(await regularText(join(this.root, 'journal.json'))))
    return j.status === 'pending'
  }
  async begin(): Promise<void> {
    if (await this.pending()) throw new Error('An interrupted synchronization needs recovery. Open Settings to restore it first.')
    this.journal = { id: randomUUID(), status: 'pending', entries: [] }
    await mkdir(join(this.backupsRoot, this.journal.id), { recursive: true, mode: 0o700 })
    await this.persist()
  }
  private async persist(): Promise<void> { await atomicWrite(join(this.root, 'journal.json'), jsonText(this.journal)) }
  async replace(destination: string, text: string): Promise<void> {
    if (!this.journal || this.journal.status !== 'pending') throw new Error('No active synchronization journal.')
    await this.validDestination(destination)
    const before = await exists(destination) ? await regularText(destination) : null
    const backup = before !== null ? join(this.backupsRoot, this.journal.id, `${this.journal.entries.length}.json`) : null
    if (backup) await atomicWrite(backup, before!)
    this.journal.entries.push({ destination, backup, beforeHash: before === null ? null : hash(before), afterHash: hash(text) })
    await this.persist() // write-ahead journal survives termination before rename
    if ((await exists(destination) ? hash(await regularText(destination)) : null) !== (before === null ? null : hash(before))) throw new Error('Claude changed a session record during synchronization. Quit every Claude window and retry.')
    await atomicWrite(destination, text)
  }
  async commit(): Promise<void> {
    if (!this.journal) return
    this.journal.status = 'committed'
    await this.persist()
    await atomicWrite(join(this.backupsRoot, this.journal.id, 'manifest.json'), jsonText(this.journal))
  }
  async rollback(): Promise<void> {
    const path = join(this.root, 'journal.json')
    if (!(await exists(path))) return
    const journal = journalSchema.parse(JSON.parse(await regularText(path)))
    if (journal.status !== 'pending') return
    // Validate every destination before restoring anything. Preserve files modified after a crash.
    for (const entry of journal.entries) {
      await this.validDestination(entry.destination)
      const current = await exists(entry.destination) ? hash(await regularText(entry.destination)) : null
      if (current !== entry.afterHash && current !== entry.beforeHash) throw new Error('A session changed after the interruption. Recovery stopped to preserve newer data. Your backups are available in Settings.')
      if (entry.backup) {
        await contained(join(this.backupsRoot, journal.id), entry.backup)
        if (hash(await regularText(entry.backup)) !== entry.beforeHash) throw new Error('A recovery backup failed validation. No restore was attempted.')
      }
    }
    for (const entry of [...journal.entries].reverse()) {
      if (entry.backup) await atomicWrite(entry.destination, await regularText(entry.backup))
      else if (await exists(entry.destination)) await unlink(entry.destination)
    }
    journal.status = 'rolled-back'
    this.journal = journal
    await this.persist()
    await atomicWrite(join(this.backupsRoot, journal.id, 'manifest.json'), jsonText(journal))
  }
  async count(): Promise<number> { return await exists(this.backupsRoot) ? (await readdir(this.backupsRoot)).length : 0 }
}
