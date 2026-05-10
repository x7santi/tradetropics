import { contextBridge, ipcRenderer } from 'electron'

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

// invoke (not send) so the main-process allow-list validation is enforced before the call returns
const shellAPI = {
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('updater', updaterAPI)
    contextBridge.exposeInMainWorld('nativeFetch', fetchUrlAPI)
    contextBridge.exposeInMainWorld('auth', authAPI)
    contextBridge.exposeInMainWorld('shell', shellAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.updater = updaterAPI
  // @ts-ignore
  window.nativeFetch = fetchUrlAPI
  // @ts-ignore
  window.auth = authAPI
  // @ts-ignore
  window.shell = shellAPI
}
