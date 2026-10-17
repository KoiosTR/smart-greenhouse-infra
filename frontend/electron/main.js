import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment variables provided by vite-plugin-electron
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

// Ensure solid GPU / WebGL stability on Windows Electron
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    title: "Smart Greenhouse Control",
    icon: path.join(__dirname, '../public/vite.svg'), // You can change this to a custom .ico or .png later
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    // Open DevTools in development to see exact console logs and errors
    mainWindow.webContents.openDevTools();
  } else {
    // When built, vite-plugin-electron puts the electron output in dist-electron
    // and the react output in dist.
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Forward console errors to terminal
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error('[Electron Renderer Error]', message);
    }
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('🔥 [Electron Renderer Process Gone]:', details);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
