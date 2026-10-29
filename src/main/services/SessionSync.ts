import { join } from 'node:path'
import type { SyncResult } from '../../shared/types'
import { exists, jsonText } from './files'
import { SessionManager, type SessionStore, type DiscoveredRecord } from './SessionManager'
import type { RecoveryManager } from './RecoveryManager'

export class SessionSync {
  constructor(readonly sessions: SessionManager, readonly recovery: RecoveryManager) {}
  async synchronize(sources: SessionStore[], target: SessionStore | undefined): Promise<SyncResult> {
    const result: SyncResult = { status: 'unavailable', copied: 0, skipped: 0, message: 'Sign in and create a Code conversation in this account to enable local history sync.', at: new Date().toISOString() }
    if (!target) return result
    const winners = new Map<string, DiscoveredRecord>()
    const targetFiles = new Map((await this.sessions.records(target)).records.map(r => [r.data.sessionId, r]))
    for (const store of sources) {
      const { records, malformed } = await this.sessions.records(store)
      result.skipped += malformed
      for (const record of records) {
        const previous = winners.get(record.data.sessionId)
        if (!previous || record.data.lastActivityAt > previous.data.lastActivityAt) winners.set(record.data.sessionId, record)
      }
    }
    const paths = await this.sessions.transcriptPaths()
    const writes: { destination: string; content: string }[] = []
    for (const [id, record] of winners) {
      const destination = join(target.directory, `${id}.json`)
      const current = targetFiles.get(id)
      const marker = join(target.directory, `deleted_${id.slice(6)}`)
      if (await exists(marker)) { result.skipped++; continue }
      if (current && current.data.lastActivityAt >= record.data.lastActivityAt) continue
      // A malformed target is never replaced. Account/organization are never guessed.
      if (!current && await exists(destination)) { result.skipped++; continue }
      const candidates = paths.get(record.data.cliSessionId) ?? []
      let valid = false
      for (const path of candidates) if (await this.sessions.validateTranscript(path, record.data.cliSessionId)) { valid = true; break }
      if (!valid) { result.skipped++; continue }
      // Preserve target-owned metadata and copy only validated, non-secret reference fields.
      let base: Record<string, unknown> = {}
      if (current) {
        const { regularText } = await import('./files')
        base = JSON.parse(await regularText(destination)) as Record<string, unknown>
      }
      writes.push({ destination, content: jsonText({ ...base, ...record.data }) })
    }
    if (writes.length) {
      await this.recovery.begin()
      for (const write of writes) await this.recovery.replace(write.destination, write.content)
      // Caller commits only after launch verification, so launch failure can roll back.
    }
    result.status = winners.size ? 'synced' : 'unavailable'
    result.copied = writes.length
    result.message = result.status === 'synced'
      ? `Local Code history checked. ${writes.length} reference${writes.length === 1 ? '' : 's'} synchronized${result.skipped ? `, ${result.skipped} skipped` : ''}. Authenticated continuation is unverified.`
      : 'This Claude version has no recognized local Code records. Switching is available without history sync.'
    return result
  }
}
