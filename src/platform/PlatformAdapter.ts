import type { Installation } from '../shared/types'
export type ClaudeProcess = { pid: number; profile: string | null }
export interface PlatformAdapter {
  readonly name: string
  readonly home: string
  detect(override?: string): Promise<Installation | null>
  processes(installation: Installation): Promise<ClaudeProcess[]>
  launch(installation: Installation, profile?: string): Promise<void>
  close(installation: Installation, processes: ClaudeProcess[]): Promise<void>
  profileSessionRoot(profile: string, installation: Installation): Promise<string>
}
