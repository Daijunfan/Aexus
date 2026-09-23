const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  dialog,
  shell,
  protocol,
  net,
  nativeTheme,
  Notification,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { assetPath } = require('./storage.cjs');
const { BackendClient } = require('../dist-cli/client.cjs');

const workspaceFlag=process.argv.indexOf('--workspace');
const folderRoot=workspaceFlag>=0?process.argv[workspaceFlag+1]:process.env.MINI_NOTION_WORKSPACE;
if(folderRoot){
  process.env.MINI_NOTION_WORKSPACE=fs.realpathSync(path.resolve(folderRoot));
  const metadata=path.join(process.env.MINI_NOTION_WORKSPACE,'.mininotion');
  if(fs.existsSync(metadata)&&fs.lstatSync(metadata).isSymbolicLink())throw new Error('.mininotion 不能是软链接');
  process.env.MINI_NOTION_DATA_DIR=path.join(metadata,'desktop');
}
app.setName('Mini Notion');
if (process.env.MINI_NOTION_DATA_DIR) app.setPath('userData', process.env.MINI_NOTION_DATA_DIR);
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);
let window;
let storage;
let client;
let unsubscribe;
let quitting = false;
let servicePaused = false;
let resumeService;
const closingWindows = new WeakSet();
async function flushRenderer(target) {
  if (!target || target.isDestroyed()) return;
  const id = randomUUID();
  await new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      ipcMain.removeListener('workspace:flushed', listener);
      resolve();
    };
    const listener = (event, returned) => {
      if (returned === id && event.sender === target.webContents) finish();
    };
    const timer = setTimeout(finish, 5000);
    ipcMain.on('workspace:flushed', listener);
    target.webContents.send('workspace:flush', id);
  });
}
let pendingPageId;
const notifications = new Set();
const isTest = process.env.MINI_NOTION_TEST === '1';
const backgroundTest = isTest && process.env.MINI_NOTION_BACKGROUND_TEST === '1';
if(backgroundTest&&process.platform==='darwin')app.setActivationPolicy('prohibited');
const background = backgroundTest || process.argv.includes('--background');
if (!isTest && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (_, argv) => {
  if (argv.includes('--background')) return;
  if (servicePaused) void resumeService?.();
  if (!window && app.isReady()) createWindow();
  if (window) {
    if (window.isMinimized()) window.restore();
    if (!backgroundTest) window.show();
    if (!backgroundTest) window.focus();
  }
});

const send = (command) => window?.webContents.send('command', command);
const safeName = (name) => name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').slice(0, 160) || '无标题';
function openLink(url) {
  if (url.startsWith('asset://local/')) return shell.openPath(storage.assetPath(url));
  if (url.startsWith('mininotion://page/')) {
    const id = decodeURIComponent(url.slice('mininotion://page/'.length));
    pendingPageId = id;
    const existing = !!window;
    if (!window && app.isReady() && client) createWindow();
    if (existing && storage?.current && window && !window.webContents.isLoading()) {
      send(`open-page:${id}`);
      pendingPageId = undefined;
    }
    background || window?.show();
    background || window?.focus();
    return;
  }
  if (/^(https?:|mailto:|tel:)/i.test(url)) return shell.openExternal(url);
}
app.on('open-url', (event, url) => {
  event.preventDefault();
  openLink(url);
});

function activateReminder(item) {
  const available = storage.current?.pages.some((page) => page.id === item.pageId && !page.trashedAt);
  if (available) openLink(`mininotion://page/${encodeURIComponent(item.pageId)}`);
  else {
    pendingPageId = undefined;
    if (!window) createWindow();
    send('inbox');
  }
  backgroundTest || window?.show();
  backgroundTest || window?.focus();
  void client.call('inbox.read', { id: item.id }).catch(() => {});
}
function bindNotification(notification, item) {
  notifications.add(notification);
  notification.on('click', () => activateReminder(item));
  notification.on('close', () => notifications.delete(notification));
  notification.on('failed', () => {
    notifications.delete(notification);
    send('notification-error');
  });
}
function showReminder(item) {
  if (!storage.current?.settings.desktopNotifications) return;
  if (isTest) {
    fs.appendFileSync(path.join(client.directory, 'notification-test.jsonl'), JSON.stringify(item) + '\n');
    app.once(`test-notification-click:${item.id}`, () => activateReminder(item));
    return;
  }
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    id: item.id,
    groupId: 'mini-notion-reminders',
    title: item.title,
    body: item.text,
  });
  bindNotification(notification, item);
  notification.show();
}
function installMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Mini Notion',
        submenu: [
          { role: 'about', label: '关于 Mini Notion' },
          { type: 'separator' },
          { label: '设置…', accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
          { type: 'separator' },
          { role: 'services', label: '服务' },
          { type: 'separator' },
          { role: 'hide', label: '隐藏 Mini Notion' },
          { role: 'hideOthers', label: '隐藏其他' },
          { role: 'unhide', label: '显示全部' },
          { type: 'separator' },
          { role: 'quit', label: '退出 Mini Notion' },
        ],
      },
      {
        label: '文件',
        submenu: [
          { label: '新建页面', accelerator: 'CmdOrCtrl+N', click: () => send('new-page') },
          { label: '搜索页面…', accelerator: 'CmdOrCtrl+K', click: () => send('search') },
          { type: 'separator' },
          { label: '导入…', accelerator: 'CmdOrCtrl+Shift+I', click: () => send('import') },
          { label: '导出当前页面…', accelerator: 'CmdOrCtrl+Shift+E', click: () => send('export') },
          { type: 'separator' },
          { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
          { role: 'close', label: '关闭窗口' },
        ],
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo', label: '撤销' },
          { role: 'redo', label: '重做' },
          { type: 'separator' },
          { role: 'cut', label: '剪切' },
          { role: 'copy', label: '拷贝' },
          { role: 'paste', label: '粘贴' },
          { role: 'pasteAndMatchStyle', label: '粘贴并匹配样式' },
          { label: '全选', accelerator: 'CmdOrCtrl+A', click: () => send('select-all') },
          { label: '评论所选内容', accelerator: 'CmdOrCtrl+Shift+M', click: () => send('comment-selection') },
          { type: 'separator' },
          { label: '查找…', accelerator: 'CmdOrCtrl+F', click: () => send('find') },
          { role: 'startSpeaking', label: '开始朗读' },
          { role: 'stopSpeaking', label: '停止朗读' },
        ],
      },
      {
        label: '显示',
        submenu: [
          { label: '显示 / 隐藏侧边栏', accelerator: 'CmdOrCtrl+\\', click: () => send('sidebar') },
          { label: '浅色 / 深色模式', accelerator: 'CmdOrCtrl+Shift+L', click: () => send('theme') },
          { type: 'separator' },
          { role: 'resetZoom', label: '实际大小' },
          { role: 'zoomIn', label: '放大' },
          { role: 'zoomOut', label: '缩小' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: '进入全屏幕' },
          ...(!app.isPackaged ? [{ role: 'toggleDevTools', label: '开发者工具' }] : []),
        ],
      },
      {
        label: '前往',
        submenu: [
          { label: '后退', accelerator: 'CmdOrCtrl+[', click: () => send('back') },
          { label: '前进', accelerator: 'CmdOrCtrl+]', click: () => send('forward') },
          { label: '主页', accelerator: 'CmdOrCtrl+1', click: () => send('home') },
        ],
      },
      {
        label: '窗口',
        submenu: [
          { role: 'minimize', label: '最小化' },
          { role: 'zoom', label: '缩放' },
          { type: 'separator' },
          { role: 'front', label: '前置全部窗口' },
        ],
      },
      { label: '帮助', submenu: [{ label: '快捷键与使用指南', click: () => send('help') }] },
    ]),
  );
}

function createWindow() {
  window = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 760,
    minHeight: 560,
    title: 'Mini Notion',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 19 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#191919' : '#ffffff',
    show: !isTest && !background,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: folderRoot?['--mini-notion-folder-mode']:[],
      spellcheck: true,
      backgroundThrottling: !background,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openLink(url);
    return { action: 'deny' };
  });
  window.webContents.on('did-finish-load', () => {
    void client.call('ui.register');
  });
  window.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    openLink(url);
  });
  window.webContents.session.setPermissionRequestHandler((_, __, callback) => callback(false));
  window.on('closed', () => {
    window = null;
    if (!quitting) void client.call('ui.register', { ready: false });
  });
  window.on('close', (event) => {
    if (quitting || closingWindows.has(window)) return;
    event.preventDefault();
    const target = window;
    closingWindows.add(target);
    void flushRenderer(target).finally(() => {
      if (!target.isDestroyed()) target.close();
    });
  });
  if (process.env.VITE_DEV_SERVER_URL) window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else window.loadFile(path.join(__dirname, '../dist/index.html'));
}

app
  .whenReady()
  .then(async () => {
    if (backgroundTest) app.dock?.hide();
    client = new BackendClient({ workspace: process.env.MINI_NOTION_WORKSPACE, directory: app.getPath('userData'), clientId: `gui-${process.pid}` });
    storage = {
      directory: client.directory,
      assetPath(url) {
        if(client.workspaceRoot && url.startsWith('asset://local/workspace/')) {const file=fs.realpathSync(path.resolve(client.workspaceRoot,decodeURIComponent(new URL(url).pathname.slice('/workspace/'.length))));if(!file.startsWith(client.workspaceRoot+path.sep))throw new Error('Workspace boundary');return file}
        return assetPath(client.directory, url,client.workspaceRoot);
      },
      spaceRoot(pageId) {
        if (typeof pageId !== 'string' || !/^[0-9a-zA-Z_-]{1,64}$/.test(pageId))
          throw new Error('无效的空间页面 ID');
        return path.join(client.directory, 'spaces', pageId);
      },
    };
    const subscribe = async () => {
      if (quitting) return;
      servicePaused = false;
      try {
        let firstEvent = true;
        unsubscribe = await client.subscribe(
          (event) => {
            if (event.type === 'state') {
              if (firstEvent && window) {
                firstEvent = false;
                void client.call('ui.register');
              }
              storage.current = event.workspace;
              window?.webContents.send('workspace:state', event);
              if (event.workspace) nativeTheme.themeSource = event.workspace.settings.theme;
            } else if (event.type === 'notification') showReminder(event.item);
            else if (event.type === 'agent') window?.webContents.send('agent:event', event);
            else if (event.type === 'shutdown') servicePaused = true;
            else if (event.type === 'ui') {
              if (event.command === 'quit') app.quit();
              else if (event.command === 'window-close') window?.close();
              else if (event.command === 'window-hide') window?.hide();
              else if (event.command === 'window-minimize') window?.minimize();
              else if (event.command === 'window-fullscreen')
                window?.setFullScreen(event.params?.enabled ?? !window.isFullScreen());
              else if (event.command === 'zoom')
                window?.webContents.setZoomFactor(Number(event.params?.factor || 1));
              else {
                if (event.command === 'window-show' && !window) createWindow();
                if (!background && window?.isMinimized()) window.restore();
                if (!background || (!backgroundTest && event.command === 'window-show')) {
                  window?.show();
                  window?.focus();
                }
                window?.webContents.send('ui:event', event);
              }
            }
          },
          () => {
            if (!quitting && !servicePaused) setTimeout(() => void subscribe(), 1000);
          },
        );
      } catch {
        if (!quitting) setTimeout(() => void subscribe(), 2000);
      }
    };
    resumeService = subscribe;
    await client.ensure();
    protocol.handle('asset', (request) => {
      try {
        return net.fetch(pathToFileURL(storage.assetPath(request.url)).toString());
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });
    ipcMain.handle('api:request', async (_, method, params, id) => {
      if (servicePaused) await subscribe();
      return client.request(method, params, id);
    });
    ipcMain.handle('workspace:load', async () => {
      let workspace = await client.call('workspace.get');
      if (workspace && pendingPageId && workspace.pages.some((p) => p.id === pendingPageId && !p.trashedAt)) {
        const expanded = new Set(workspace.expanded);
        let parent = workspace.pages.find((page) => page.id === pendingPageId)?.parentId;
        while (parent) {
          expanded.add(parent);
          parent = workspace.pages.find((page) => page.id === parent)?.parentId;
        }
        const response = await client.request('workspace.patch', {
          patch: {
            id: randomUUID(),
            pages: [],
            meta: {
              before: {
                activePageId: workspace.activePageId,
                recent: workspace.recent,
                expanded: workspace.expanded,
              },
              after: {
                activePageId: pendingPageId,
                recent: [pendingPageId, ...workspace.recent.filter((id) => id !== pendingPageId)].slice(
                  0,
                  20,
                ),
                expanded: [...expanded],
              },
            },
          },
        });
        if (response.error) throw new Error(response.error.message);
        workspace = response.workspace;
      }
      pendingPageId = undefined;
      return { workspace, dataPath: client.directory, version: app.getVersion() };
    });
    ipcMain.handle('workspace:save', async (_, workspace) => {
      await client.call('workspace.replace', { workspace, revision: workspace.revision || 0, confirm: true });
      return Date.now();
    });
    ipcMain.handle('asset:save', (_, name, bytes) => client.upload(name, Buffer.from(bytes)));
    ipcMain.handle('space:upload', (_, pageId, folderId, name, bytes) =>
      client.uploadToSpace(pageId, folderId, name, Buffer.from(bytes)),
    );
    ipcMain.handle('space:reveal', (_, pageId) => shell.openPath(storage.spaceRoot(pageId)));
    ipcMain.handle('agent:choose-engine', async () => {
      if (isTest) return 'claude';
      const { response } = await dialog.showMessageBox(window, {
        type: 'question',
        message: '选择 Agent 引擎',
        detail: '空间与引擎固定绑定，更换引擎请创建新空间。',
        buttons: ['Claude Code', 'Codex', '取消'],
        defaultId: 0,
        cancelId: 2,
      });
      return response === 0 ? 'claude' : response === 1 ? 'codex' : null;
    });
    ipcMain.handle('asset:export', async (_, url, name) => {
      const { filePath } = await dialog.showSaveDialog(window, { defaultPath: safeName(name) });
      if (!filePath) return false;
      await client.call('asset.get', { url, output: filePath });
      return true;
    });
    ipcMain.handle('data:reveal', () => shell.openPath(client.directory));
    ipcMain.handle('history:list', (_, pageId) => client.call('history.list', { pageId }));
    ipcMain.handle('history:snapshot', (_, page) => client.call('history.snapshot', { pageId: page.id }));
    ipcMain.handle('link:open', (_, url) => openLink(url));
    ipcMain.on('theme:set', (_, theme) => {
      if (['dark', 'light', 'system'].includes(theme)) nativeTheme.themeSource = theme;
    });
    ipcMain.handle('file:export', async (_, name, content) => {
      const { filePath } = await dialog.showSaveDialog(window, { defaultPath: safeName(name) });
      if (!filePath) return false;
      await client.call('file.write', { output: filePath, type: path.extname(name).slice(1), content });
      return true;
    });
    const chooseImports = async () =>
      (
        await dialog.showOpenDialog(window, {
          properties: ['openFile', 'multiSelections'],
          filters: [
            { name: '笔记文件', extensions: ['md', 'markdown', 'txt', 'html', 'htm', 'csv', 'json'] },
          ],
        })
      ).filePaths;
    ipcMain.handle('file:choose-imports', chooseImports);
    ipcMain.handle('file:import', async () =>
      (await chooseImports()).map((file) => ({
        name: path.basename(file),
        content: fs.readFileSync(file, 'utf8'),
      })),
    );
    ipcMain.handle('page:export', async (_, pageId, type) => {
      const page = await client.call('page.get', { pageId });
      const { filePath } = await dialog.showSaveDialog(window, {
        defaultPath: `${safeName(page.title)}.${type}`,
        filters: [{ name: type.toUpperCase(), extensions: [type] }],
      });
      if (!filePath) return false;
      await client.call('file.export', { pageId, type, output: filePath });
      return true;
    });
    ipcMain.handle('backup:export', async () => {
      const { filePath } = await dialog.showSaveDialog(window, {
        defaultPath: `Mini Notion ${new Date().toISOString().slice(0, 10)}.mininotion`,
        filters: [{ name: 'Mini Notion 备份', extensions: ['mininotion'] }],
      });
      if (!filePath) return false;
      await client.call('backup.export', { path: filePath });
      return true;
    });
    ipcMain.handle('backup:import', async () => {
      const { filePaths } = await dialog.showOpenDialog(window, {
        properties: ['openFile'],
        filters: [{ name: 'Mini Notion 备份', extensions: ['mininotion', 'json'] }],
      });
      if (!filePaths.length) return null;
      const { response } = await dialog.showMessageBox(window, {
        type: 'question',
        message: '用备份恢复工作空间？',
        detail: '当前工作空间将被替换。恢复前会自动保留一份包含附件的备份。',
        buttons: ['取消', '恢复'],
        defaultId: 0,
        cancelId: 0,
      });
      if (response !== 1) return null;
      await client.call('backup.restore', { path: filePaths[0], confirm: true });
      return client.call('workspace.get');
    });
    ipcMain.handle('page:pdf', async (_, name) => {
      const { filePath } = await dialog.showSaveDialog(window, {
        defaultPath: `${safeName(name)}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!filePath) return false;
      const workspace = await client.call('workspace.get');
      await client.call('file.export', { pageId: workspace.activePageId, output: filePath, type: 'pdf' });
      return true;
    });
    await subscribe();
    if (!isTest && storage.current?.settings.desktopNotifications && Notification.isSupported()) {
      try {
        for (const notification of await Notification.getHistory()) {
          const item = storage.current.inbox?.find((item) => item.id === notification.id);
          if (item) bindNotification(notification, item);
        }
      } catch (error) {
        console.error('Notification history:', error.message);
      }
    }
    installMenu();
    // Both isolated and native-lifecycle tests must leave the system URL handler alone.
    if (app.isPackaged && process.env.MINI_NOTION_TEST === undefined)
      app.setAsDefaultProtocolClient('mininotion');
    app.setAboutPanelOptions({
      applicationName: 'Mini Notion',
      applicationVersion: app.getVersion(),
      copyright: '本地优先，专注你的想法。',
      credits: 'An independent local notes app, built with Electron, React and BlockNote.',
    });
    createWindow();
    app.on('activate', () => {
      if (servicePaused) void subscribe();
      if (!BrowserWindow.getAllWindows().length) createWindow();
      else backgroundTest || window?.show();
    });
  })
  .catch((error) => {
    if (background) console.error('Mini Notion 无法启动:', error);
    else
      dialog.showErrorBox(
        'Mini Notion 无法启动',
        `${error.message || error}\n\n数据目录：${app.getPath('userData')}`,
      );
    app.quit();
  });
app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  void (async () => {
    await flushRenderer(window);
    unsubscribe?.();
    if (isTest && client) {
      await client.call('service.stop');
      for (let attempt = 0; attempt < 30 && (await client.ping()); attempt++)
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
  })().finally(() => app.quit());
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
