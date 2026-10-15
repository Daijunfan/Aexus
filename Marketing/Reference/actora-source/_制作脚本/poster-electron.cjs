const {app,BrowserWindow}=require('electron')
app.setPath('userData',process.env.PROMO_RENDER_PROFILE)
app.whenReady().then(()=>{app.dock?.hide();const window=new BrowserWindow({show:false,width:1440,height:1080,useContentSize:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});window.loadFile(process.argv[2])})
app.on('window-all-closed',()=>app.quit())
