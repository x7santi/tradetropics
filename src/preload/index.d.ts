interface UpdaterAPI {
  onAvailable:     (cb: (info: unknown) => void) => void
  onDownloaded:    (cb: (info: unknown) => void) => void
  onError:         (cb: (msg: string)   => void) => void
  install:         ()                             => void
  removeListeners: ()                             => void
}

interface NativeFetchAPI {
  fetch: (url: string) => Promise<string>
}

interface AuthAPI {
  openGoogleOAuth: (url: string) => Promise<string | null>
}

interface ShellAPI {
  openExternal: (url: string) => Promise<void>
}

declare global {
  interface Window {
    updater:     UpdaterAPI
    nativeFetch: NativeFetchAPI
    auth:        AuthAPI
    shell:       ShellAPI
  }
}
