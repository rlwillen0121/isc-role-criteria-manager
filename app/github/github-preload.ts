const { ipcRenderer: ipcMain } = require('electron');

export const githubPreloader = {
  getGitHubReleaseArtifact: (githubRepoUrl: string) => ipcMain.invoke('get-github-release-artifact', githubRepoUrl),
  listGitHubJsonFiles: (githubRepoUrl: string) => ipcMain.invoke('list-github-json-files', githubRepoUrl),
  getGitHubFileContent: (downloadUrl: string, filename: string) => ipcMain.invoke('get-github-file-content', downloadUrl, filename),
};

