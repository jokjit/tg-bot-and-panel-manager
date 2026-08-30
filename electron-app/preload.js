const { contextBridge, ipcRenderer } = require('electron')

if (process.isMainFrame) {
  const api = Object.freeze({
  runAction: (action, params) => ipcRenderer.invoke('run-action', action, params),
  dashboardSnapshot: () => ipcRenderer.invoke('dashboard:snapshot'),
  deploymentResume: Object.freeze({
    get: (params) => ipcRenderer.invoke('deployment-resume:get', params),
    discard: () => ipcRenderer.invoke('deployment-resume:discard'),
  }),
  onOutput: (cb) => {
    if (typeof cb !== 'function') return () => {}
    const listener = (_, data) => cb(data)
    ipcRenderer.on('output', listener)
    return () => ipcRenderer.removeListener('output', listener)
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getRepoRoot: () => ipcRenderer.invoke('get-repo-root'),
  clearData: () => ipcRenderer.invoke('data:clear'),
  accounts: Object.freeze({
    list: () => ipcRenderer.invoke('accounts:list'),
    add: (account) => ipcRenderer.invoke('accounts:add', account),
    delete: (id) => ipcRenderer.invoke('accounts:delete', id),
    setActive: (id) => ipcRenderer.invoke('accounts:setActive', id),
    getActive: () => ipcRenderer.invoke('accounts:getActive'),
    getDeployPrefs: () => ipcRenderer.invoke('accounts:getDeployPrefs'),
    saveDeployPrefs: (prefs, accountId) => ipcRenderer.invoke('accounts:saveDeployPrefs', prefs, accountId),
    clearCredentials: (id) => ipcRenderer.invoke('accounts:clearCredentials', id),
  }),
  })

  contextBridge.exposeInMainWorld('api', api)
}
