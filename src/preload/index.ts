import { contextBridge, ipcRenderer } from 'electron'
import type { Bridge, Progress } from '../shared/types'
const bridge: Bridge = {
  snapshot: () => ipcRenderer.invoke('switcher:snapshot'),
  addProfile: (name) => ipcRenderer.invoke('switcher:add', name),
  renameProfile: (id, name) => ipcRenderer.invoke('switcher:rename', id, name),
  removeProfile: (id) => ipcRenderer.invoke('switcher:remove', id),
  inspectProfile: (id) => ipcRenderer.invoke('switcher:inspect', id),
  switchProfile: (id) => ipcRenderer.invoke('switcher:switch', id),
  openClaude: (id) => ipcRenderer.invoke('switcher:open', id),
  saveSettings: (settings) => ipcRenderer.invoke('switcher:settings', settings),
  diagnostics: () => ipcRenderer.invoke('switcher:diagnostics'),
  recover: () => ipcRenderer.invoke('switcher:recover'),
  revealBackups: () => ipcRenderer.invoke('switcher:backups'),
  chooseInstallation: () => ipcRenderer.invoke('switcher:installation'),
  resizePanel: (height) => ipcRenderer.invoke('switcher:resize', height),
  dismiss: () => ipcRenderer.send('switcher:dismiss'),
  quit: () => ipcRenderer.send('switcher:quit'),
  onProgress: (listener) => {
    const handler = (_event: unknown, progress: Progress): void => listener(progress)
    ipcRenderer.on('switcher:progress', handler)
    return () => ipcRenderer.removeListener('switcher:progress', handler)
  },
}
contextBridge.exposeInMainWorld('claudeSwitcher', bridge)
