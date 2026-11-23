// main.cjs — Quickzy for Windows.
//
// Opens the Quickzy app in its own window. With internet it uses the live
// site (live games, your account, everything). With no internet it opens the
// copy of the app that ships inside the installer, so solo quizzes always work.

const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const SITE = 'https://quickzy.web.app';
const LOCAL = path.join(__dirname, 'site');

// quickzy://app/... serves the copy inside the installer, like a website
protocol.registerSchemesAsPrivileged([{ scheme: 'quickzy', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function serveLocal() {
  protocol.handle('quickzy', (req) => {
    const url = new URL(req.url);
    let file = path.normalize(path.join(LOCAL, decodeURIComponent(url.pathname)));
    // never outside the bundled site; pages of the app all load index.html
    if (!file.startsWith(LOCAL) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(LOCAL, 'index.html');
    return net.fetch(pathToFileURL(file).toString());
  });
}

function create() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 380, minHeight: 600,
    title: 'Quickzy', backgroundColor: '#0b0824', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, 'site', 'assets', 'icon-512.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  // links to other websites open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(SITE) || url.startsWith('quickzy://')) return { action: 'allow' };
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(SITE) || url.startsWith('quickzy://')) return;
    e.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
  // no internet (or the site cannot be reached): play from the copy inside
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (isMain && url.startsWith(SITE) && code !== -3) win.loadURL('quickzy://app/app');
  });
  win.loadURL(net.isOnline() ? `${SITE}/app` : 'quickzy://app/app');
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  app.setAppUserModelId('app.web.quickzy');
  serveLocal();
  create();
});
app.on('window-all-closed', () => app.quit());
