import { homedir } from 'node:os'
import { posix } from 'node:path'
const { join } = posix
import type { Installation } from '../shared/types'
import type { ClaudeProcess, PlatformAdapter } from './PlatformAdapter'
import { exists } from '../main/services/files'
import { exec, profileArgument } from './process'

export class MacOSAdapter implements PlatformAdapter {
  readonly name = 'macOS'
  constructor(readonly home = homedir()) {}
  async detect(override?: string): Promise<Installation | null> {
    for (const bundle of override
      ? [override]
      : ['/Applications/Claude.app', join(this.home, 'Applications/Claude.app')]) {
      const executable = join(bundle, 'Contents/MacOS/Claude')
      if (!(await exists(executable))) continue
      const { stdout } = await exec('/usr/libexec/PlistBuddy', [
        '-c',
        'Print :CFBundleShortVersionString',
        join(bundle, 'Contents/Info.plist'),
      ])
      return {
        executable,
        version: stdout.trim(),
        kind: 'mac',
        defaultProfile: join(this.home, 'Library/Application Support/Claude'),
      }
    }
    return null
  }
  async processes(installation: Installation): Promise<ClaudeProcess[]> {
    const { stdout } = await exec('/bin/ps', ['-axo', 'pid=,command='], {
      maxBuffer: 8 * 1024 * 1024,
    })
    return stdout.split('\n').flatMap((line) => {
      const match = line.match(/^\s*(\d+)\s+(.+)$/)
      if (!match || !match[2].startsWith(installation.executable) || match[2].includes('--type='))
        return []
      return [{ pid: Number(match[1]), profile: profileArgument(match[2]) }]
    })
  }
  async launch(installation: Installation, profile?: string): Promise<void> {
    const bundle = installation.executable.slice(0, -'/Contents/MacOS/Claude'.length)
    await exec(
      '/usr/bin/open',
      [
        ...(profile ? ['-n'] : []),
        '-a',
        bundle,
        ...(profile ? ['--args', `--user-data-dir=${profile}`] : []),
      ],
      { cwd: '/' },
    )
  }
  async close(_installation: Installation, processes: ClaudeProcess[]): Promise<void> {
    for (const p of processes) {
      // Apple Event quit is graceful and can be refused by Claude. Never escalate to kill.
      await exec('/usr/bin/osascript', [
        '-l',
        'JavaScript',
        '-e',
        `ObjC.import('AppKit'); const app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(${p.pid}); if (app) app.terminate;`,
      ]).catch(() => {
        throw new Error(
          'Quit Claude Desktop with ⌘Q, then try switching again. macOS did not allow a graceful quit.',
        )
      })
    }
  }
  async profileSessionRoot(profile: string): Promise<string> {
    return join(profile, 'claude-code-sessions')
  }
}
