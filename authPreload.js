const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('goobAuth', {
    sendToken: (token) => ipcRenderer.send('popup-token-callback', token)
});