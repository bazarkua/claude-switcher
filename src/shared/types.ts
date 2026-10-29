export type Profile = {
  id: string
  name: string
  color: 'peach' | 'lavender' | 'slate'
  createdAt: string
  connection: 'unverified' | 'local-account-detected'
  scope?: string
}
export type Settings = {
  appearance: 'system' | 'light' | 'dark'
  syncOnSwitch: boolean
  launchAtLogin: boolean
}
export type Store = { version: 1; profiles: Profile[]; activeId?: string; settings: Settings }
export type Installation = {
  executable: string
  version: string
  kind: 'mac' | 'classic' | 'msix'
  defaultProfile: string
}
export type SwitchStage =
  | 'IDLE'
  | 'VALIDATING'
  | 'CHECKING_ACTIVITY'
  | 'CLOSING_SOURCE'
  | 'SNAPSHOTTING'
  | 'SYNCHRONIZING'
  | 'LAUNCHING_TARGET'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'RECOVERING'
export type Progress = { stage: SwitchStage; message: string }
export type SyncResult = {
  status: 'synced' | 'unavailable' | 'disabled'
  copied: number
  skipped: number
  message: string
  at: string
}
export type Diagnostics = {
  os: string
  installation: { found: boolean; version?: string; kind?: string }
  activeProfile: string | null
  transcriptDirectory: boolean
  sessionStores: number
  compatibility: string
  lastSync: SyncResult | null
  lastError: string | null
  recoveryPending: boolean
}
export type UsageSummary =
  | { available: false; label: string }
  | {
      available: true
      fiveHourRemaining: number
      weeklyRemaining: number
      fiveHourResetAt: string
      weeklyResetAt: string
      plan?: string
    }
export type Snapshot = Store & {
  lastUsedId?: string
  usage: UsageSummary
  installation: { found: boolean; version?: string }
  progress: Progress
  lastSync: SyncResult | null
  recoveryPending: boolean
}
export type Reply<T> = { ok: true; value: T } | { ok: false; error: string }
export type Bridge = {
  snapshot(): Promise<Reply<Snapshot>>
  addProfile(name: string): Promise<Reply<Profile>>
  renameProfile(id: string, name: string): Promise<Reply<void>>
  removeProfile(id: string): Promise<Reply<void>>
  inspectProfile(id: string): Promise<Reply<Profile>>
  switchProfile(id: string): Promise<Reply<void>>
  openClaude(id?: string): Promise<Reply<void>>
  saveSettings(settings: Settings): Promise<Reply<void>>
  diagnostics(): Promise<Reply<Diagnostics>>
  recover(): Promise<Reply<void>>
  revealBackups(): Promise<Reply<void>>
  chooseInstallation(): Promise<Reply<void>>
  resizePanel(height: number): Promise<Reply<void>>
  dismiss(): void
  quit(): void
  onProgress(listener: (progress: Progress) => void): () => void
}
declare global {
  interface Window {
    claudeSwitcher: Bridge
  }
}
