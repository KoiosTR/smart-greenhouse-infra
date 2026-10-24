import { app, BrowserWindow } from 'electron';
import { execFile, spawn } from 'child_process';
import fs from 'fs';
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

// Uygulama açılınca backend konteynerlerini başlatır (zaten çalışıyorsa zararsız). Docker kapalıysa Docker Desktop'ı açıp ~2 dk dener.
const DOCKER_DESKTOP = 'C:/Program Files/Docker/Docker/Docker Desktop.exe';
function startBackend(tries = 0) {
  execFile('docker', ['start', 'greenhouse_api', 'greenhouse_verdify_sync'], (err) => {
    if (!err) return;
    if (tries >= 12) return console.warn('Backend konteynerleri başlatılamadı:', err.message);
    if (tries === 0 && fs.existsSync(DOCKER_DESKTOP)) spawn(DOCKER_DESKTOP, [], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => startBackend(tries + 1), 10000);
  });
}

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
  startBackend();
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
