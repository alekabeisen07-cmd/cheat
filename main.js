const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');

// Отключаем аппаратное ускорение (помогает защите)
app.disableHardwareAcceleration();

let win;
let isIgnoreMouse = false;

function writeLog(message) {
  const desktopPath = app.getPath('desktop');
  const logPath = path.join(desktopPath, 'GHOST_LOGS.txt');
  const timestamp = new Date().toLocaleString();
  const logEntry = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(logPath, logEntry, 'utf8');
  } catch (err) {
    console.error('Ошибка записи лога:', err);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 400,
    height: 250,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    skipTaskbar: true,          // не показывается в панели задач
    type: 'toolbar',            // убирает из Alt+Tab (некоторые версии Windows)
    focusable: false,           // не перехватывает фокус
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');

  // ---- ГЛАВНОЕ: защита от захвата экрана (невидимость для скриншотов) ----
  // Electron на Windows 10/11 автоматически использует WDA_EXCLUDEFROMCAPTURE
  win.setContentProtection(true);

  // ---- Всегда поверх всех (с таймером для надёжности) ----
  win.setAlwaysOnTop(true, 'screen-saver', 1);
  const stayOnTopInterval = setInterval(() => {
    if (win && !win.isDestroyed() && win.isVisible()) {
      win.setAlwaysOnTop(true, 'screen-saver', 1);
      win.moveTop();
    }
  }, 1000);

  // ---- Горячие клавиши ----
  globalShortcut.register('m', () => {
    writeLog("Hotkey M - Analyze");
    if (win) win.webContents.send('global-analyze');
  });

  globalShortcut.register('n', () => {
    if (win) {
      if (win.isVisible()) win.hide(); else win.show();
    }
  });

  globalShortcut.register('Alt+S', () => {
    isIgnoreMouse = !isIgnoreMouse;
    win.setIgnoreMouseEvents(isIgnoreMouse, { forward: true });
    win.webContents.send('status-update', isIgnoreMouse ? "GHOST" : "MOVE");
    writeLog(`Ghost mode: ${isIgnoreMouse}`);
  });

  globalShortcut.register('Alt+Shift+X', () => {
    writeLog("Application Exited by Hotkey");
    clearInterval(stayOnTopInterval);
    app.quit();
  });

  writeLog('Window initialized with setContentProtection (WDA_EXCLUDEFROMCAPTURE)');
}

// ---- Захват скриншотов (без изменений) ----
ipcMain.handle('get-screenshot', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    });
    return sources[0].thumbnail.toDataURL();
  } catch (e) {
    writeLog(`Screenshot Error: ${e.message}`);
  }
});

ipcMain.on('write-log', (event, message) => writeLog(message));

app.whenReady().then(createWindow);

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (e) => e.preventDefault());