import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { SessionManager } from '../src/main/services/SessionManager'
import { SessionSync } from '../src/main/services/SessionSync'
import { RecoveryManager } from '../src/main/services/RecoveryManager'
import { atomicWrite, contained, exists } from '../src/main/services/files'
import { temporary, metadata, record, store, transcript } from './helpers'
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await temporary()
  roots.push(root)
  const sourceRoot = join(root, 'default/claude-code-sessions')
  const targetRoot = join(root, 'managed/claude-code-sessions')
  const source = await store(sourceRoot)
  const target = await store(targetRoot)
  const sessions = new SessionManager(join(root, 'projects'))
  const recovery = new RecoveryManager(root, async () => [targetRoot])
  return {
    root,
    sourceRoot,
    targetRoot,
    source,
    target,
    sessions,
    recovery,
    sync: new SessionSync(sessions, recovery),
  }
}
describe('Code session discovery and parsing', () => {
  it('discovers only account/org stores and handles missing roots', async () => {
    const f = await fixture()
    expect(await f.sessions.stores(f.sourceRoot)).toEqual([f.source])
    expect(await f.sessions.stores(join(f.root, 'missing'))).toEqual([])
    await mkdir(join(f.sourceRoot, 'unrecognized/other'), { recursive: true })
    expect(await f.sessions.stores(f.sourceRoot)).toHaveLength(1)
  })
  it('rejects malformed JSON, missing CLI references and mismatched ids', async () => {
    const f = await fixture()
    const a = record()
    const path = await metadata(f.source, a)
    await writeFile(path, '{')
    expect((await f.sessions.records(f.source)).malformed).toBe(1)
    await writeFile(path, JSON.stringify({ ...a, cliSessionId: undefined }))
    expect((await f.sessions.records(f.source)).records).toHaveLength(0)
    await writeFile(path, JSON.stringify({ ...a, sessionId: `local_${randomUUID()}` }))
    expect((await f.sessions.records(f.source)).malformed).toBe(1)
  })
  it('validates JSONL content without modifying transcripts', async () => {
    const f = await fixture()
    const a = record()
    const path = await transcript(f.sessions.projectsRoot, a)
    const before = await readFile(path, 'utf8')
    expect(await f.sessions.validateTranscript(path, a.cliSessionId)).toBe(true)
    expect(await f.sessions.validateTranscript(path, randomUUID())).toBe(false)
    expect(await readFile(path, 'utf8')).toBe(before)
    await writeFile(path, '{\n')
    expect(await f.sessions.validateTranscript(path, a.cliSessionId)).toBe(false)
  })
})
describe('safe session synchronization', () => {
  it('merges newest metadata, deduplicates and is idempotent', async () => {
    const f = await fixture()
    const a = record()
    await metadata(f.source, a)
    const another = await store(f.sourceRoot)
    await metadata(another, { ...a, title: 'Newer', lastActivityAt: a.lastActivityAt + 1000 })
    const transcriptPath = await transcript(f.sessions.projectsRoot, a)
    const before = await readFile(transcriptPath, 'utf8')
    const result = await f.sync.synchronize([f.source, another, f.target], f.target)
    expect(result).toMatchObject({ status: 'synced', copied: 1, skipped: 0 })
    await f.recovery.commit()
    expect(
      JSON.parse(await readFile(join(f.target.directory, `${a.sessionId}.json`), 'utf8')).title,
    ).toBe('Newer')
    expect((await f.sync.synchronize([f.source, another, f.target], f.target)).copied).toBe(0)
    expect(await readFile(transcriptPath, 'utf8')).toBe(before)
  })
  it('never overwrites newer or malformed target metadata or deletion markers', async () => {
    const f = await fixture()
    const a = record()
    const b = record()
    const c = record()
    for (const value of [a, b, c]) {
      await metadata(f.source, value)
      await transcript(f.sessions.projectsRoot, value)
    }
    const target = await metadata(f.target, {
      ...a,
      title: 'Newest target',
      lastActivityAt: a.lastActivityAt + 1500,
    })
    const malformed = join(f.target.directory, `${b.sessionId}.json`)
    await writeFile(malformed, '{broken')
    await writeFile(join(f.target.directory, `deleted_${c.sessionId.slice(6)}`), 'unknown')
    const result = await f.sync.synchronize([f.source, f.target], f.target)
    expect(result.copied).toBe(0)
    expect(JSON.parse(await readFile(target, 'utf8')).title).toBe('Newest target')
    expect(await readFile(malformed, 'utf8')).toBe('{broken')
    expect(await exists(join(f.target.directory, `${c.sessionId}.json`))).toBe(false)
  })
  it('requires a real transcript and a known target scope', async () => {
    const f = await fixture()
    await metadata(f.source, record())
    expect(await f.sync.synchronize([f.source], undefined)).toMatchObject({
      status: 'unavailable',
      copied: 0,
    })
    expect(await f.sync.synchronize([f.source], f.target)).toMatchObject({
      status: 'unavailable',
      copied: 0,
      skipped: 1,
    })
  })
  it('copies only allowed reference fields, leaving source metadata untouched', async () => {
    const f = await fixture()
    const a = record()
    const path = await metadata(f.source, a)
    await writeFile(
      path,
      JSON.stringify({
        ...a,
        remoteMcpServersConfig: [{ secret: 'fixture-only' }],
        unknownField: 'leave behind',
      }),
    )
    await transcript(f.sessions.projectsRoot, a)
    await f.sync.synchronize([f.source], f.target)
    const copied = JSON.parse(
      await readFile(join(f.target.directory, `${a.sessionId}.json`), 'utf8'),
    )
    expect(copied.remoteMcpServersConfig).toBeUndefined()
    expect(copied.unknownField).toBeUndefined()
    expect(JSON.parse(await readFile(path, 'utf8')).unknownField).toBe('leave behind')
  })
})
describe('atomic storage and interruption recovery', () => {
  it('atomically replaces metadata without temporary files remaining', async () => {
    const f = await fixture()
    const path = join(f.root, 'atomic.json')
    await atomicWrite(path, '{"before":true}')
    await atomicWrite(path, '{"after":true}')
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ after: true })
  })
  it('backs up and rolls back an interrupted transaction after a restart', async () => {
    const f = await fixture()
    const a = record()
    const path = await metadata(f.target, a)
    const before = await readFile(path, 'utf8')
    await f.recovery.begin()
    await f.recovery.replace(path, JSON.stringify({ ...a, title: 'Changed' }))
    const restarted = new RecoveryManager(f.root, async () => [f.targetRoot])
    expect(await restarted.pending()).toBe(true)
    await restarted.rollback()
    expect(await readFile(path, 'utf8')).toBe(before)
    expect(await restarted.pending()).toBe(false)
  })
  it('removes only newly added reference files on rollback', async () => {
    const f = await fixture()
    const path = join(f.target.directory, `local_${randomUUID()}.json`)
    await f.recovery.begin()
    await f.recovery.replace(path, '{}')
    await f.recovery.rollback()
    expect(await exists(path)).toBe(false)
  })
  it('refuses rollback if Claude wrote newer data after an interruption', async () => {
    const f = await fixture()
    const a = record()
    const path = await metadata(f.target, a)
    await f.recovery.begin()
    await f.recovery.replace(path, '{"changed":true}')
    await writeFile(path, '{"newer":true}')
    await expect(f.recovery.rollback()).rejects.toThrow('preserve newer data')
    expect(await readFile(path, 'utf8')).toBe('{"newer":true}')
  })
  it('blocks path traversal, symlinks and default-profile writes', async () => {
    const f = await fixture()
    await f.recovery.begin()
    await expect(
      f.recovery.replace(join(f.source.directory, `local_${randomUUID()}.json`), '{}'),
    ).rejects.toThrow('outside managed')
    await expect(contained(f.root, join(f.root, '../outside'))).rejects.toThrow('Unsafe')
    const link = join(f.target.directory, `local_${randomUUID()}.json`)
    await symlink(join(f.root, 'outside'), link)
    await expect(atomicWrite(link, '{}')).rejects.toThrow('non-regular')
  })
})
