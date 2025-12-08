const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { downloadChapter, extractImageUrls } = require('./src/downloader');
const { checkUpdate, getLatestInstallerUrl } = require('./src/versionChecker');
const pkg = require('./package.json');
const fetch = require('node-fetch');

function createWindow() {
  const win = new BrowserWindow({
    width: 950,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'gui', 'index.html'));
}

app.whenReady().then(async () => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Version Check
  try {
    const update = await checkUpdate(pkg.version);
    if (update.available) {
      setTimeout(() => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
          win.webContents.send('update-available', update);
        }
      }, 3000);
    }
  } catch (err) {
    // Silent fail
  }

  // Set up electron-updater events (will use GitHub Releases when build.publish is configured)
  try {
    autoUpdater.on('checking-for-update', () => {
      const w = BrowserWindow.getAllWindows()[0];
      if (w) w.webContents.send('log', 'Checking for updates (autoUpdater)');
    });

    autoUpdater.on('update-available', info => {
      const w = BrowserWindow.getAllWindows()[0];
      if (w) w.webContents.send('update-available', info);
    });

    autoUpdater.on('update-not-available', () => {
      const w = BrowserWindow.getAllWindows()[0];
      if (w) w.webContents.send('log', 'No update available (autoUpdater)');
    });

    autoUpdater.on('download-progress', progressObj => {
      const w = BrowserWindow.getAllWindows()[0];
      if (w) w.webContents.send('update-progress', { percent: Math.round(progressObj.percent || 0), text: 'Downloading update...' });
    });

    autoUpdater.on('update-downloaded', info => {
      const w = BrowserWindow.getAllWindows()[0];
      if (w) w.webContents.send('update-downloaded', info);
      // Optionally install immediately:
      // autoUpdater.quitAndInstall();
    });

    // Trigger a check for updates using electron-updater (this will use the publish provider configured in build)
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  } catch (e) {
    // ignore if autoUpdater fails to initialize
  }

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    try {
      const u = new URL(details.url);
      details.requestHeaders['Referer'] = u.origin + '/';
      details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    } catch (e) { }
    callback({ Cancel: false, requestHeaders: details.requestHeaders });
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('start-download', async (event, opts) => {
  try {
    await downloadChapter(opts.url, {
      selector: opts.selector,
      outDir: opts.output,
      concurrency: opts.concurrency,
      makeCbz: opts.cbz,
      usePuppeteer: opts.usePuppeteer,
      onLog: (text) => event.sender.send('log', text),
      onImage: (url) => event.sender.send('preview-image', url)
    });
    event.sender.send('done', { success: true });
    return { success: true };
  } catch (err) {
    event.sender.send('error', { message: err.message || String(err) });
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('get-images', async (event, opts) => {
  try {
    const { imageUrls, title, cookies } = await extractImageUrls(opts.url, {
      selector: opts.selector,
      usePuppeteer: opts.usePuppeteer,
      onLog: (text) => event.sender.send('log', text)
    });

    if (cookies && cookies.length > 0) {
      for (const cookie of cookies) {
        try {
          // Electron cookie format is slightly different than Puppeteer's sometimes
          // but we just need url/name/value mostly.
          await session.defaultSession.cookies.set({
            url: opts.url,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain.replace(/^\./, ''), // remove leading dot for Electron
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            expirationDate: cookie.expires
          });
        } catch (e) {
          console.error("Failed to set cookie", cookie, e);
        }
      }
    }

    return { success: true, images: imageUrls, title };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('perform-update', async (event) => {
  try {
    const url = await getLatestInstallerUrl();
    const win = BrowserWindow.getAllWindows()[0];

    if (win) win.webContents.send('update-progress', { percent: 0, text: 'Starting download...' });

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download: ${res.statusText}`);

    const total = Number(res.headers.get('content-length'));
    let received = 0;

    const tempPath = path.join(app.getPath('temp'), path.basename(url));
    const fileStream = fs.createWriteStream(tempPath);

    await new Promise((resolve, reject) => {
      res.body.on('data', (chunk) => {
        received += chunk.length;
        if (total) {
          const percent = Math.round((received / total) * 100);
          if (win) win.webContents.send('update-progress', { percent, text: `Downloading... ${percent}%` });
        }
        fileStream.write(chunk);
      });
      res.body.on('error', reject);
      res.body.on('end', () => {
        fileStream.end();
        resolve();
      });
    });

    if (win) win.webContents.send('update-progress', { percent: 100, text: 'Download complete. Launching...' });

    shell.openPath(tempPath);
    setTimeout(() => app.quit(), 2000);

    return { success: true };
  } catch (err) {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('update-progress', { percent: 0, text: 'Update failed: ' + err.message });
    return { success: false, error: err.message };
  }
});
