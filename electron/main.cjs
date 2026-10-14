// The desktop app: one window showing the built web app (dist/), served from app://pianosrs so it has a stable,
// secure origin (its saved progress lives under that origin) and can use Web MIDI.
const { app, BrowserWindow, Menu, net, protocol, session, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');
/** Set by `npm run desktop:dev` to load the Vite dev server instead of dist/. */
const DEV_URL = process.env.PIANOSRS_DEV_URL;
const APP_URL = 'app://pianosrs/index.html';

// Notes from the piano should sound straight away, before anything on the page has been clicked.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

/** What the page may ask for: MIDI for the piano, the clipboard for copying prompts, and full screen. */
const ALLOWED = new Set(['midi', 'midiSysex', 'clipboard-sanitized-write', 'fullscreen']);

const isAppUrl = (url) => url.startsWith('app://pianosrs/') || (DEV_URL && url.startsWith(DEV_URL));
const openOutside = (url) => {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 560,
    title: 'PianoSRS',
    backgroundColor: '#f4eee0',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  // Links (claude.ai, the Anthropic console, IMSLP) open in your browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openOutside(url);
  });
  win.loadURL(DEV_URL || APP_URL);
  return win;
}

// One copy at a time: two windows writing the same saved progress would overwrite each other.
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url);
      const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
      if (file !== DIST && !file.startsWith(DIST + path.sep)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED.has(permission)));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED.has(permission));

    // A small menu: the app's own sidebar does the navigating. (macOS needs the app menu for Quit, Copy and Paste.)
    const template = [
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { role: 'fileMenu' },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }],
      },
      { role: 'windowMenu' },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));

    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
