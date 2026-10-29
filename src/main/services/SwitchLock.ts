import { open, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { regularText } from './files'
export class SwitchLock {
  private busy = false
  constructor(readonly root: string) {}
  async acquire(): Promise<() => Promise<void>> {
    if (this.busy) throw new Error('An account switch is already in progress.')
    this.busy = true
    const path = join(this.root, 'switch.lock')
    try {
      try {
        const file = await open(path, 'wx', 0o600)
        await file.writeFile(String(process.pid)); await file.close()
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        const pid = Number(await regularText(path, 32))
        if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('The switch lock is invalid. Inspect diagnostics before removing it.', { cause: error })
        try { process.kill(pid, 0); throw new Error('Another Claude Switcher operation is running.', { cause: error }) }
        catch (probe) { if ((probe as NodeJS.ErrnoException).code !== 'ESRCH') throw probe }
        await unlink(path)
        const file = await open(path, 'wx', 0o600)
        await file.writeFile(String(process.pid)); await file.close()
      }
      return async () => { try { await unlink(path) } finally { this.busy = false } }
    } catch (error) { this.busy = false; throw error }
  }
}
