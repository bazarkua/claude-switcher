import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

export const exists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
export async function contained(root: string, path: string): Promise<void> {
  const rel = relative(resolve(root), resolve(path))
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Unsafe storage path.')
  let cursor = resolve(root)
  for (const part of ['', ...rel.split(/[\\/]/)]) {
    cursor = resolve(cursor, part)
    try {
      if ((await lstat(cursor)).isSymbolicLink())
        throw new Error('Symbolic links are not supported in managed storage.')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}
export async function regularText(path: string, maxBytes = 4 * 1024 * 1024): Promise<string> {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes)
    throw new Error('Unrecognized or oversized metadata file.')
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    return await file.readFile('utf8')
  } finally {
    await file.close()
  }
}
export async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  if (await exists(path)) {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error('Refusing to replace non-regular metadata.')
  }
  const temp = `${path}.${randomUUID()}.tmp`
  const file = await open(temp, 'wx', 0o600)
  try {
    await file.writeFile(content)
    await file.sync()
  } catch (error) {
    await file.close()
    await unlink(temp).catch(() => {})
    throw error
  }
  await file.close()
  try {
    await rename(temp, path)
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw error
  }
  // Directory fsync is unsupported on Windows; file contents are already flushed.
  const directory = await open(dirname(path), 'r').catch(() => null)
  if (directory) {
    await directory.sync().catch(() => {})
    await directory.close()
  }
}
export async function samePath(a: string, b: string): Promise<boolean> {
  return (await realpath(a)) === (await realpath(b))
}
export const jsonText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`
export const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, 'utf8'))
