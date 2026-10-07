const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const [input, output, directory] = process.argv.slice(process.argv.indexOf('--mini-notion-pdf') + 1);
app.setPath('userData', path.join(directory, 'profile'));
app.dock?.hide();
const snapshot = input.endsWith('.json') ? JSON.parse(fs.readFileSync(input, 'utf8')) : null;
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);
app
  .whenReady()
  .then(async () => {
    if (snapshot) {
      ipcMain.handle('print:load', () => ({
        workspace: snapshot.workspace,
        dataPath: snapshot.dataDirectory,
        version: app.getVersion(),
      }));
      protocol.handle('asset', (request) => {
        const url = new URL(request.url),
          filename = decodeURIComponent(url.pathname.slice(1));
        if (url.hostname !== 'local' || path.basename(filename) !== filename)
          return new Response('Not found', { status: 404 });
        return net.fetch(pathToFileURL(path.join(snapshot.dataDirectory, 'attachments', filename)).href);
      });
    }
    const window = new BrowserWindow({
      show: false,
      width: 1380,
      height: 920,
      webPreferences: {
        preload: snapshot ? path.join(__dirname, 'pdf-preload.cjs') : undefined,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    await window.loadFile(snapshot ? path.join(__dirname, '../dist/index.html') : input);
    if (snapshot)
      await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const check = () => { if (document.querySelector('.page-title')) resolve(); else if (document.querySelector('.startup-state button')) reject(new Error(document.querySelector('.startup-state').textContent)); else setTimeout(check, 10); }; check();
  }).then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))`);
    await window.webContents.executeJavaScript(
      'Promise.all([document.fonts.ready, ...Array.from(document.images).map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = image.onerror = resolve; }))])',
    );
    fs.writeFileSync(
      output,
      await window.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        landscape: await window.webContents.executeJavaScript('!!document.querySelector(".plan-hourWeek")'),
        margins: { top: 0.4, bottom: 0.4, left: 0.3, right: 0.3 },
      }),
    );
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
