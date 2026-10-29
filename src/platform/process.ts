import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
export const exec = promisify(execFile)
export const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))
export function detached(executable: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      detached: true,
      stdio: 'ignore',
      cwd: '/',
      windowsHide: false,
      shell: false,
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
export function profileArgument(command: string): string | null {
  // ps prints argv without escaping spaces; Claude's profile flag is last in our launches.
  const match = command.match(/--user-data-dir=(?:"([^"]+)"|(.+?))(?=\s+--[a-z-]|$)/i)
  return match ? (match[1] ?? match[2]).trim() : null
}
