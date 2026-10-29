import { homedir } from 'node:os'
import { win32 } from 'node:path'
import { readdir } from 'node:fs/promises'
import type { Installation } from '../shared/types'
import type { ClaudeProcess, PlatformAdapter } from './PlatformAdapter'
import { exists } from '../main/services/files'
import { exec, profileArgument } from './process'
const ps = async (script: string): Promise<string> => (await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { maxBuffer: 8 * 1024 * 1024, windowsHide: true })).stdout.trim()

export class WindowsAdapter implements PlatformAdapter {
  readonly name = 'Windows'
  constructor(readonly home = homedir(), private env = process.env) {}
  async detect(override?: string): Promise<Installation | null> {
    const local = this.env.LOCALAPPDATA ?? win32.join(this.home, 'AppData/Local')
    const roaming = this.env.APPDATA ?? win32.join(this.home, 'AppData/Roaming')
    if (override && await exists(override)) return { executable: override, version: 'unknown', kind: 'classic', defaultProfile: win32.join(roaming, 'Claude') }
    const raw = await ps("Get-AppxPackage -Name '*Claude*' | Select-Object -First 1 InstallLocation,PackageFamilyName,Version | ConvertTo-Json -Compress")
    if (raw) {
      const p = JSON.parse(raw) as { InstallLocation: string; PackageFamilyName: string; Version: string }
      for (const candidate of ['app/Claude.exe', 'Claude.exe']) {
        const executable = win32.join(p.InstallLocation, candidate)
        if (await exists(executable)) return { executable, version: String(p.Version), kind: 'msix', defaultProfile: win32.join(local, 'Packages', p.PackageFamilyName, 'LocalCache/Roaming/Claude') }
      }
    }
    for (const root of [win32.join(local, 'AnthropicClaude'), win32.join(local, 'Programs/Claude'), win32.join(this.env.ProgramFiles ?? 'C:\\Program Files', 'Claude')]) {
      const dirs = [root]
      if (await exists(root)) {
        const entries = await readdir(root, { withFileTypes: true })
        dirs.push(...entries.filter(e => e.isDirectory() && /^app-/.test(e.name)).sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true })).map(e => win32.join(root, e.name)))
      }
      for (const dir of dirs) {
        const executable = win32.join(dir, 'Claude.exe')
        if (await exists(executable)) return { executable, version: 'unknown', kind: 'classic', defaultProfile: win32.join(roaming, 'Claude') }
      }
    }
    return null
  }
  async processes(): Promise<ClaudeProcess[]> {
    const raw = await ps("Get-CimInstance Win32_Process -Filter \"Name='Claude.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress")
    if (!raw) return []
    const rows = JSON.parse(raw) as { ProcessId: number; CommandLine: string } | { ProcessId: number; CommandLine: string }[]
    const list = Array.isArray(rows) ? rows : [rows]
    if (list.some(p => !p.CommandLine)) throw new Error('Windows could not inspect Claude processes. Quit Claude manually and try again.')
    return list.filter(p => !p.CommandLine.includes('--type=')).map(p => ({ pid: p.ProcessId, profile: profileArgument(p.CommandLine) }))
  }
  async launch(installation: Installation, profile?: string): Promise<void> {
    const { spawn } = await import('node:child_process')
    await new Promise<void>((resolve, reject) => {
      const child = spawn(installation.executable, profile ? [`--user-data-dir=${profile}`] : [], { detached: true, stdio: 'ignore', windowsHide: false, shell: false })
      child.once('error', reject); child.once('spawn', () => { child.unref(); resolve() })
    })
  }
  async close(_installation: Installation, processes: ClaudeProcess[]): Promise<void> {
    for (const p of processes) await ps(`$p = Get-Process -Id ${p.pid} -ErrorAction SilentlyContinue; if ($p) { $null = $p.CloseMainWindow() }`)
  }
  async profileSessionRoot(profile: string, installation: Installation): Promise<string> {
    if (installation.kind === 'msix') {
      const local = this.env.LOCALAPPDATA ?? win32.join(this.home, 'AppData/Local')
      const rel = win32.relative(local, profile)
      if (!rel.startsWith('..') && !win32.isAbsolute(rel)) {
        const cache = win32.dirname(win32.dirname(installation.defaultProfile))
        const redirected = win32.join(cache, 'Local', rel, 'claude-code-sessions')
        if (await exists(redirected)) return redirected
      }
    }
    return win32.join(profile, 'claude-code-sessions')
  }
}
