const { ipcRenderer: ipcMain } = require('electron');

export const connectorPreloader = {
  uploadConnector: (githubRepoUrl: string, connectorAlias?: string) => ipcMain.invoke('upload-connector', githubRepoUrl, connectorAlias),
  uploadCustomizer: (githubRepoUrl: string, customizerName?: string) => ipcMain.invoke('upload-customizer', githubRepoUrl, customizerName),
};

