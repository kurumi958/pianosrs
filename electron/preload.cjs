// Tells the page it's running as the desktop app (it then skips the web app's offline service worker).
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('pianosrsDesktop', { platform: process.platform });
