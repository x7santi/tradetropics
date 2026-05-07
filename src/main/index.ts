import { app, shell, BrowserWindow, session, ipcMain, net, protocol } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'

// Register tradetropics:// as a standard scheme BEFORE app.ready so Chromium treats it as
// navigable and will-navigate / will-redirect fire before any blank page is shown.
protocol.registerSchemesAsPrivileged([
  { scheme: 'tradetropics', privileges: { standard: true, secure: true } }
])

// Shared state for the in-flight OAuth popup.  Set when the popup opens, cleared on resolve.
let _oauthResolve: ((url: string | null) => void) | null = null
let _oauthWin:     BrowserWindow | null = null

function resolveOAuth(url: string | null): void {
  const resolve = _oauthResolve
  const win     = _oauthWin
  _oauthResolve = null
  _oauthWin     = null
  if (win && !win.isDestroyed()) win.destroy()
  resolve?.(url)
}

const RENDERER_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://s3.tradingview.com https://*.tradingview.com",
  "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' https://s3.tradingview.com https://*.tradingview.com",
  "style-src 'self' 'unsafe-inline' https://*.tradingview.com https://fonts.googleapis.com",
  "style-src-elem 'self' 'unsafe-inline' https://*.tradingview.com https://fonts.googleapis.com",
  "connect-src 'self' https://api.twelvedata.com https://api.tradingeconomics.com https://finnhub.io https://biquote.io https://query1.finance.yahoo.com https://*.supabase.co wss://*.supabase.co https://*.tradingview.com wss://*.tradingview.com https://nfs.faireconomy.media https://fonts.googleapis.com https://fonts.gstatic.com",
  "frame-src https://*.tradingview.com",
  "img-src 'self' data: blob: https://*.tradingview.com https://*.supabase.co",
  "font-src 'self' data: https://*.tradingview.com https://fonts.gstatic.com",
  "worker-src 'self' blob: https://*.tradingview.com",
  "media-src 'self' https://*.tradingview.com",
].join('; ')

function setContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isOurPage = details.url.startsWith('http://localhost') ||
                      details.url.startsWith('file://')
    if (!isOurPage) { callback({ responseHeaders: details.responseHeaders }); return }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [RENDERER_CSP]
      }
    })
  })
}

// Proxy fetch through main process (calendar + legacy feeds) to avoid renderer limits
ipcMain.handle('fetch-url', (_event, url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const referer = url.includes('tradingeconomics.com')
      ? 'https://tradingeconomics.com/'
      : url.includes('finnhub.io')
        ? 'https://finnhub.io/'
        : url.includes('query1.finance.yahoo.com')
          ? 'https://finance.yahoo.com/'
          : url.includes('biquote.io')
            ? 'https://biquote.io/'
            : 'https://www.forexfactory.com/'
    const req = net.request({ url, method: 'GET' })
    req.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
    req.setHeader('Accept', 'application/json, text/plain, */*')
    req.setHeader('Accept-Language', 'en-US,en;q=0.9')
    req.setHeader('Referer', referer)
    let body = ''
    req.on('response', (res) => {
      res.on('data', (chunk) => { body += chunk.toString() })
      res.on('end', () => resolve(body))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
})

// Open a popup BrowserWindow for Google OAuth and resolve to the callback URL
// (tradetropics://auth/callback?code=...) or null if the user closes it.
ipcMain.handle('auth:google-oauth', (_event, oauthUrl: string): Promise<string | null> => {
  // Close any stale popup from a previous attempt
  if (_oauthWin && !_oauthWin.isDestroyed()) _oauthWin.destroy()

  return new Promise((resolve) => {
    _oauthResolve = resolve

    const authWin = new BrowserWindow({
      width: 900,
      height: 700,
      show: true,
      title: 'Sign in with Google',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        session: session.fromPartition('persist:oauth'),
      },
    })
    _oauthWin = authWin

    // Primary: protocol.handle('tradetropics') fires before Chromium renders anything
    // Secondary: will-navigate / will-redirect for JS-initiated and HTTP-redirect paths
    authWin.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('tradetropics://')) { event.preventDefault(); resolveOAuth(url) }
    })
    authWin.webContents.on('will-redirect', (event, url) => {
      if (url.startsWith('tradetropics://')) { event.preventDefault(); resolveOAuth(url) }
    })
    // Last-resort fallback: hide before resolving so the blank page isn't visible
    authWin.webContents.on('did-fail-load', (_e, _code, _desc, validatedURL) => {
      if (validatedURL?.startsWith('tradetropics://')) {
        if (!authWin.isDestroyed()) authWin.hide()
        resolveOAuth(validatedURL)
      }
    })

    authWin.on('closed', () => resolveOAuth(null))
    authWin.loadURL(oauthUrl)
  })
})

function setupAutoUpdater(win: BrowserWindow): void {
  autoUpdater.autoDownload         = true
  autoUpdater.autoInstallOnAppQuit = true

  const send = (channel: string, payload?: unknown) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }

  autoUpdater.on('update-available',  (info) => send('updater:available',  info))
  autoUpdater.on('update-downloaded', (info) => send('updater:downloaded', info))
  autoUpdater.on('error',             (err)  => send('updater:error',      err.message))

  ipcMain.on('updater:install', () => autoUpdater.quitAndInstall(false, true))

  setTimeout(() => {
    if (!is.dev) autoUpdater.checkForUpdates().catch(() => {})
  }, 3_000)

  setInterval(() => {
    if (!is.dev) autoUpdater.checkForUpdates().catch(() => {})
  }, 4 * 3_600_000)
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0f172a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    setupAutoUpdater(mainWindow)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.tradetropics.app')
  setContentSecurityPolicy()

  // Handle tradetropics:// at the protocol level — fires before any page renders,
  // so the OAuth popup is destroyed without ever showing a blank page.
  protocol.handle('tradetropics', (request) => {
    resolveOAuth(request.url)
    return new Response('', { status: 200 })
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
