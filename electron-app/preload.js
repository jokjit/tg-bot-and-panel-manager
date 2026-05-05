const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  runAction: (action, params) => ipcRenderer.invoke('run-action', action, params),
  onOutput: (cb) => ipcRenderer.on('output', (_, data) => cb(data)),
  getRepoRoot: () => ipcRenderer.invoke('get-repo-root'),
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    add: (account) => ipcRenderer.invoke('accounts:add', account),
    delete: (id) => ipcRenderer.invoke('accounts:delete', id),
    setActive: (id) => ipcRenderer.invoke('accounts:setActive', id),
    getActive: () => ipcRenderer.invoke('accounts:getActive'),
  }
})
