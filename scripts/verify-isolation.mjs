import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
const exec = promisify(execFile)
if (process.platform !== 'darwin') throw new Error('This smoke test currently supports macOS only.')
const profile = await mkdtemp(join(tmpdir(), 'claude-switcher-isolation-'))
await exec(
  '/usr/bin/open',
  ['-n', '-a', '/Applications/Claude.app', '--args', `--user-data-dir=${profile}`],
  { cwd: '/' },
)
let pid
let initialized = false
for (let i = 0; i < 40; i++) {
  const { stdout } = await exec('/bin/ps', ['-axo', 'pid=,command='])
  const line = stdout
    .split('\n')
    .find(
      (line) =>
        line.includes('/Applications/Claude.app/Contents/MacOS/Claude') &&
        line.includes(`--user-data-dir=${profile}`) &&
        !line.includes('--type='),
    )
  pid = line?.trim().match(/^\d+/)?.[0]
  const names = await readdir(profile)
  initialized = names.includes('Preferences') || names.includes('Local State')
  if (pid && initialized) break
  await pause(250)
}
console.log(
  JSON.stringify(
    {
      isolatedProcess: !!pid,
      profileInitialized: initialized,
      profileDirectory: profile,
      liveAuthentication: 'not tested',
      continuation: 'not tested',
    },
    null,
    2,
  ),
)
if (pid)
  await exec('/usr/bin/osascript', [
    '-l',
    'JavaScript',
    '-e',
    `ObjC.import('AppKit'); const app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(${Number(pid)}); if (app) app.terminate;`,
  ])
if (!pid || !initialized) process.exitCode = 1
