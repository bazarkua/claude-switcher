import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Installation, Progress, SyncResult } from '../../shared/types'
import type { PlatformAdapter, ClaudeProcess } from '../../platform/PlatformAdapter'
import { pause } from '../../platform/process'
import type { ProfileManager } from './ProfileManager'
import { SessionManager, type SessionStore } from './SessionManager'
import { SessionSync } from './SessionSync'
import { RecoveryManager } from './RecoveryManager'
import { SwitchLock } from './SwitchLock'
import { exists } from './files'

export type CoordinatorOptions = {
  installation: () => Promise<Installation | null>
  confirmClose: () => Promise<boolean>
  progress: (progress: Progress) => void
}
export class SwitchCoordinator {
  readonly sessions: SessionManager
  readonly recovery: RecoveryManager
  readonly sync: SessionSync
  readonly lock: SwitchLock
  lastSync: SyncResult | null = null
  lastError: string | null = null
  progress: Progress = { stage: 'IDLE', message: 'Ready when you are' }
  private busy = false
  get isBusy(): boolean { return this.busy }
  constructor(readonly profiles: ProfileManager, readonly platform: PlatformAdapter, readonly options: CoordinatorOptions) {
    this.sessions = new SessionManager(join(platform.home, '.claude/projects'))
    this.recovery = new RecoveryManager(profiles.root, async () => {
      const install = await options.installation()
      if (!install) return []
      return Promise.all(profiles.snapshot().profiles.map(p => platform.profileSessionRoot(profiles.directory(p.id), install)))
    })
    this.sync = new SessionSync(this.sessions, this.recovery)
    this.lock = new SwitchLock(profiles.root)
  }
  private stage(stage: Progress['stage'], message: string): void {
    this.progress = { stage, message }; this.options.progress(this.progress)
  }
  async inspect(id: string): Promise<ReturnType<ProfileManager['get']>> {
    const install = await this.options.installation()
    if (!install) return this.profiles.get(id)
    const stores = await this.sessions.stores(await this.platform.profileSessionRoot(this.profiles.directory(id), install))
    // A single locally created account/org pair is evidence of local metadata, not live auth.
    // Multiple stores are ambiguous. Never infer the active organization from mtime.
    const scope = stores.length === 1 ? stores[0].scope : undefined
    return this.profiles.scope(id, scope)
  }
  private async signature(stores: SessionStore[]): Promise<string> {
    const values: string[] = []
    for (const store of stores) {
      for (const entry of await readdir(store.directory, { withFileTypes: true })) {
        if (!entry.isFile() || !/^local_.*\.json$/.test(entry.name)) continue
        const info = await stat(join(store.directory, entry.name))
        values.push(`${store.directory}/${entry.name}:${info.size}:${info.mtimeMs}`)
      }
    }
    return values.sort().join('\n')
  }
  async stores(installation: Installation): Promise<SessionStore[]> {
    const roots = [await this.platform.profileSessionRoot(installation.defaultProfile, installation), ...await Promise.all(this.profiles.snapshot().profiles.map(p => this.platform.profileSessionRoot(this.profiles.directory(p.id), installation)))]
    return (await Promise.all(roots.map(root => this.sessions.stores(root)))).flat()
  }
  async waitForExit(installation: Installation): Promise<void> {
    for (let i = 0; i < 40; i++) {
      if (!(await this.platform.processes(installation)).length) return
      await pause(250)
    }
    throw new Error('Claude Desktop is still running. Finish or stop every request, quit Claude, and try again. No force quit was performed.')
  }
  private async ensureClosed(installation: Installation, running: ClaudeProcess[]): Promise<void> {
    if (!running.length) return
    if (!(await this.options.confirmClose())) throw new Error('Switch canceled. Finish or stop every Claude request before switching.')
    this.stage('CLOSING_SOURCE', 'Closing Claude gently')
    await this.platform.close(installation, running)
    await this.waitForExit(installation)
  }
  async recover(): Promise<void> {
    if (this.busy) throw new Error('Wait for the current switch to finish.')
    const release = await this.lock.acquire()
    this.busy = true
    try {
      const install = await this.options.installation()
      if (install && (await this.platform.processes(install)).length) throw new Error('Quit Claude Desktop before restoring an interrupted synchronization.')
      this.stage('RECOVERING', 'Restoring session references')
      await this.recovery.rollback()
      this.stage('IDLE', 'Recovery complete')
    } catch (error) { this.stage('FAILED', 'Recovery needs attention'); throw error }
    finally { this.busy = false; await release() }
  }
  async switch(id: string): Promise<void> {
    if (this.busy) throw new Error('An account switch is already in progress.')
    const release = await this.lock.acquire()
    this.busy = true
    const previousId = this.profiles.snapshot().activeId
    let install: Installation | null = null
    let sourceClosed = false
    let launchAttempted = false
    try {
      this.stage('VALIDATING', 'Checking your account')
      this.profiles.get(id)
      install = await this.options.installation()
      if (!install) throw new Error('Claude Desktop was not found. Install Claude or choose its location in Settings.')
      if (await this.recovery.pending()) throw new Error('An interrupted sync needs recovery. Open Settings and choose Restore interrupted sync.')
      const targetDirectory = this.profiles.directory(id)
      const running = await this.platform.processes(install)
      if (running.length === 1 && running[0].profile === targetDirectory && previousId === id) {
        this.stage('COMPLETED', 'This account is already open'); return
      }
      this.stage('CHECKING_ACTIVITY', 'Checking active Claude windows')
      await this.ensureClosed(install, running)
      sourceClosed = running.length > 0
      const stores = await this.stores(install)
      this.stage('SNAPSHOTTING', 'Checking local history')
      const signature = await this.signature(stores)
      await pause(800)
      if (signature !== await this.signature(stores) || (await this.platform.processes(install)).length) throw new Error('Claude is still updating its sessions. Quit Claude and try again.')
      const profile = await this.inspect(id)
      const targetStores = await this.sessions.stores(await this.platform.profileSessionRoot(targetDirectory, install))
      const target = targetStores.find(store => store.scope === profile.scope)
      this.stage('SYNCHRONIZING', 'Synchronizing Code history')
      this.lastSync = this.profiles.snapshot().settings.syncOnSwitch
        ? await this.sync.synchronize(stores, target)
        : { status: 'disabled', copied: 0, skipped: 0, message: 'Local history sync is turned off.', at: new Date().toISOString() }
      this.stage('LAUNCHING_TARGET', 'Opening your selected account')
      launchAttempted = true
      await this.platform.launch(install, targetDirectory)
      this.stage('VERIFYING', 'Verifying the isolated profile')
      let activated = false
      for (let i = 0; i < 40; i++) {
        if ((await this.platform.processes(install)).some(p => p.profile === targetDirectory) && await exists(targetDirectory)) { activated = true; break }
        await pause(250)
      }
      if (!activated) throw new Error('Claude did not activate the expected isolated profile. Your history is backed up. Open diagnostics before trying again.')
      if (target) await this.sessions.records(target)
      await this.profiles.active(id)
      await this.recovery.commit()
      this.lastError = null
      this.stage('COMPLETED', 'Your account is open')
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'The account switch failed.'
      try {
        if (install && await this.recovery.pending()) {
          this.stage('RECOVERING', 'Protecting your original history')
          if ((await this.platform.processes(install)).length) throw new Error('Quit Claude, then restore the interrupted sync from Settings.')
          await this.recovery.rollback()
        }
        if (sourceClosed && !launchAttempted && previousId && install) await this.platform.launch(install, this.profiles.directory(previousId))
      } catch (recoveryError) { this.lastError += ` ${recoveryError instanceof Error ? recoveryError.message : 'Recovery needs attention.'}` }
      this.stage('FAILED', this.lastError)
      throw new Error(this.lastError)
    } finally { this.busy = false; await release() }
  }
}
