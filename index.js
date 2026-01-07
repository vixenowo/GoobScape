const { app, BrowserWindow, ipcMain, dialog, session } = require('electron/main')
const path = require('node:path');
const https = require('https');
const { error } = require('node:console');

// settings
const fs = require('fs');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// window
let win = null;

// settings save state
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
  return { DNS: 'https://dragonie.fun/dns/dns.php' };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

// settings variables
let settings = loadSettings();
let DNS = settings.DNS;

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 400,
    minHeight: 300,
    frame: false,
    icon: path.join(__dirname, 'assets', 'connect.png'),
    transparent: false,
    titleBarStyle: 'hidden',
    roundedCorners: false,
    thickFrame: true,
    resizable: true,
    sandbox: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  win.loadFile('index.html');
  /*win.webContents.openDevTools();*/
  /*crashprotection(win);*/

  win.on('maximize', () => {
    win.webContents.send('window-state-changed', true);
  });

  win.on('unmaximize', () => {
    win.webContents.send('window-state-changed', false);
  });

  win.on('focus', () => {
    win.webContents.send('window-focus');
  });

  win.on('blur', () => {
    win.webContents.send('window-blur');
  });
}

ipcMain.handle('open-login-popup', async (event, authUrl, currentDomain) => {
  const choice = dialog.showMessageBoxSync(win, {
    type: 'warning',
    buttons: ['Yes', 'No'], 
    defaultId: 0,
    cancelId: 1,
    title: 'Authenticator',
    message: `${currentDomain} wants to open an authentication window`,
    detail: `${currentDomain} wants to open an authentication window, this page will be able to return a token to GoobScape that can be read by the page - often used for login data.\n\nThis will open a popup that goes to\n${new URL(authUrl)}\n\nDo you want to open it?`,
  });

  if (choice === 1) {
    return null;
  }

  return new Promise((resolve) => {
    let authWindow = new BrowserWindow({
      width: 500,
      height: 600,
      minWidth: 500,
      minHeight: 600,
      maxWidth: 500,
      maxHeight: 600,
      parent: win, 
      modal: true,
      show: false,
      maximizable: false,
      minimizable: false,
      icon: path.join(__dirname, 'assets', 'connect.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        enableRemoteModule: false,
        disableBlinkFeatures: 'AuxClick',
        preload: path.join(__dirname, 'authPreload.js')
      }
    });

    const channel = `token-done-${authWindow.id}`;

        ipcMain.once(channel, (evt, token) => {
            resolve(token);
            if (!authWindow.isDestroyed()) authWindow.close();
        });

        const listener = (evt, token) => {
            if (BrowserWindow.fromWebContents(evt.sender) === authWindow) {
                ipcMain.emit(channel, null, token);
                ipcMain.removeListener('popup-token-callback', listener);
            }
        };
        ipcMain.on('popup-token-callback', listener);

        authWindow.on('closed', () => {
            ipcMain.removeListener('popup-token-callback', listener);
            resolve(null);
        });

        authWindow.loadURL(authUrl);
        authWindow.setMenu(null);
        authWindow.once('ready-to-show', () => authWindow.show());

    authWindow.webContents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });

    authWindow.webContents.on('will-navigate', (event, url) => {
      const origin = new URL(authUrl).origin;
      const target = new URL(url).origin;
      if (origin !== target) {
        event.preventDefault();
      }
    });

    authWindow.on('closed', () => resolve(null));
  });
});

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

ipcMain.handle('fetch-dns', async (event, url) => {
  if (url === 'goob://') {
    return {
      type: 'success',
      address: `file://${path.join(__dirname, 'aboutblank.html')}`
    };
  }
  try {
    const domain = url.replace(/^goob:\/\//, '').replace(/\/$/, '');
    const serverUrl = DNS + `?domain=${encodeURIComponent(domain)}`;

    const result = await fetchJSON(serverUrl);

    if (!result) {
      return { type: 'error', message: 'Empty response from server' };
    }

    if (result.error === 'Domain not found') {
      return { type: 'notfound', domain };
    }

    if (result.error) {
      return { type: 'error', message: result.error };
    }

    return result;
  } catch (err) {
    console.error(err);
    return { error: 'Failed to fetch DNS', detail: err.message };
  }
});

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';

      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          body = body.trim().replace(/^\uFEFF/, '');
          const json = JSON.parse(body);
          resolve(json);
        } catch (err) {
          
          reject(new Error("Invalid JSON from server"));
        }
      });
    }).on('error', reject);
  });
}

ipcMain.on('progress-update', (event, value) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return;

  win.setProgressBar(value);
});

ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win.minimize();
});

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win.close();
});

ipcMain.on('errorReciever', (event, value) => {
  const messageBoxOptions = {
    type: "error",
    title: "Browser Error",
    message: value
  };
  dialog.showMessageBoxSync(messageBoxOptions);
});

ipcMain.on('domainInfo', (event, value, info) => {
  const messageBoxOptions = {
    type: "info",
    title: value,
    message: "BROWSER:\nDNS: " + DNS + "\n" + info
  };
  dialog.showMessageBoxSync(messageBoxOptions);
});

ipcMain.handle('update-dns', async (event, newUrl) => {
  if (typeof newUrl !== 'string') {
    return { success: false, message: 'Invalid URL (e1)' };
  }

  if (!newUrl.startsWith('https://')) {
    return { success: false, message: 'DNS must use https' };
  }

  try {
    new URL(newUrl);
  } catch {
    return { success: false, message: 'Invalid URL (e2)' };
  }

  DNS = newUrl;

  settings.DNS = newUrl;
  saveSettings(settings);

  console.log("DNS changed:", DNS);

  return { success: true };
});

ipcMain.on('update-av-settings', (event, avSettings) => {
  settings.AVcheckenabled = !!avSettings.AVcheckenabled;
  settings.AVenabled = !!avSettings.AVenabled;

  saveSettings(settings);

  console.log('AV settings saved:', settings.AVcheckenabled, settings.AVenabled);
});

ipcMain.handle('get-settings', () => {
  return settings;
});

ipcMain.handle('currentDNS', () => {
  return DNS;
});

ipcMain.on('displayinformation', (event, value) => {
  const messageBoxOptions = {
    type: "info",
    title: "GoobScape",
    message: value
  };
  dialog.showMessageBoxSync(messageBoxOptions);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
