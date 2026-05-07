import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const fetchUrlAPI = {
  fetch: (url: string): Promise<string> => ipcRenderer.invoke('fetch-url', url),
}

const updaterAPI = {
  onAvailable:     (cb: (info: unknown) => void) => ipcRenderer.on('updater:available',  (_e, info) => cb(info)),
  onDownloaded:    (cb: (info: unknown) => void) => ipcRenderer.on('updater:downloaded', (_e, info) => cb(info)),
  onError:         (cb: (msg: string)   => void) => ipcRenderer.on('updater:error',      (_e, msg)  => cb(msg)),
  install:         ()                             => ipcRenderer.send('updater:install'),
  removeListeners: ()                             => {
    ipcRenderer.removeAllListeners('updater:available')
    ipcRenderer.removeAllListeners('updater:downloaded')
    ipcRenderer.removeAllListeners('updater:error')
  },
}

const authAPI = {
  openGoogleOAuth: (url: string): Promise<string | null> => ipcRenderer.invoke('auth:google-oauth', url),
}

const shellAPI = {
  openExternal: (url: string): void => ipcRenderer.send('shell:open-external', url),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('updater', updaterAPI)
    contextBridge.exposeInMainWorld('nativeFetch', fetchUrlAPI)
    contextBridge.exposeInMainWorld('auth', authAPI)
    contextBridge.exposeInMainWorld('shell', shellAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore
  window.updater = updaterAPI
  // @ts-ignore
  window.nativeFetch = fetchUrlAPI
  // @ts-ignore
  window.auth = authAPI
  // @ts-ignore
  window.shell = shellAPI
}
