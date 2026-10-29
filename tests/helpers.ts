import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { SessionRecord, SessionStore } from '../src/main/services/SessionManager'
export const temporary = (): Promise<string> => mkdtemp(join(tmpdir(), 'claude-switcher-test-'))
export async function store(root: string): Promise<SessionStore> {
  const scope = `${randomUUID()}/${randomUUID()}`
  const directory = join(root, scope)
  await mkdir(directory, { recursive: true })
  return { directory, scope }
}
export const record = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  sessionId: `local_${randomUUID()}`,
  cliSessionId: randomUUID(),
  cwd: '/sample/project',
  lastActivityAt: Date.now() - 5000,
  title: 'An original Code conversation',
  ...overrides,
})
export async function metadata(store: SessionStore, value: SessionRecord): Promise<string> {
  const path = join(store.directory, `${value.sessionId}.json`)
  await writeFile(path, JSON.stringify(value))
  return path
}
export async function transcript(
  root: string,
  value: SessionRecord,
  text?: string,
): Promise<string> {
  await mkdir(join(root, 'encoded-project'), { recursive: true })
  const path = join(root, 'encoded-project', `${value.cliSessionId}.jsonl`)
  await writeFile(
    path,
    text ??
      `${JSON.stringify({ type: 'user', sessionId: value.cliSessionId, message: { role: 'user', content: 'Create a project.' } })}\n${JSON.stringify({ type: 'assistant', sessionId: value.cliSessionId, message: { role: 'assistant', content: 'Created.' } })}\n`,
  )
  return path
}
