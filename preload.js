const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mangaAPI', {
  startDownload: (opts) => ipcRenderer.invoke('start-download', opts),
  onLog: (cb) => ipcRenderer.on('log', (e, data) => cb(data)),
  onError: (cb) => ipcRenderer.on('error', (e, data) => cb(data)),
  onDone: (cb) => ipcRenderer.on('done', (e, data) => cb(data)),
  onPreviewImage: (cb) => ipcRenderer.on('preview-image', (e, url) => cb(url)),
  getImages: (opts) => ipcRenderer.invoke('get-images', opts),
  // Update System
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (e, info) => cb(info)),
  onUpdateProgress: (cb) => ipcRenderer.on('update-progress', (e, progress) => cb(progress)),
  performUpdate: (url) => ipcRenderer.invoke('perform-update', url)
  ,
  // Ping updates
  onPing: (cb) => ipcRenderer.on('ping', (e, ms) => cb(ms)),
  startPing: (opts) => ipcRenderer.invoke('start-ping', opts),
  stopPing: () => ipcRenderer.invoke('stop-ping')
});
