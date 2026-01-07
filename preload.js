const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    fetchDNS: (url) => ipcRenderer.invoke('fetch-dns', url),
    setProgress: (value) => ipcRenderer.send('progress-update', value),

    // settings
    updateDNS: (newUrl) => ipcRenderer.invoke('update-dns', newUrl),
    getCurrentDNS: () => ipcRenderer.invoke('currentDNS'),
    information: (value) => ipcRenderer.send('displayinformation', value),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    updateAVSettings: (settings) => ipcRenderer.send('update-av-settings', settings),

    errorNotify: (value) => ipcRenderer.send('errorReciever', value),
    domainDetails: (value, info) => ipcRenderer.send('domainInfo', value, info),
    
    // GoobLogin
    openLoginPopup: (url, currentDomain) => ipcRenderer.invoke('open-login-popup', url, currentDomain),
    
    // custom window
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),
    onWindowStateChange: (callback) => ipcRenderer.on('window-state-changed', callback),
    onWindowFocus: (callback) => ipcRenderer.on('window-focus', callback),
    onWindowBlur: (callback) => ipcRenderer.on('window-blur', callback),
});
