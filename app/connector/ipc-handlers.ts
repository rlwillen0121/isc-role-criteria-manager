import { ipcMain } from 'electron';
import { uploadConnectorFromGitHub } from './connector';
import { uploadCustomizerFromGitHub } from './connector-customizer';

export function setupConnectorHandlers() {
  ipcMain.handle('upload-connector', async (event, githubRepoUrl: string, connectorAlias?: string) => {
    return uploadConnectorFromGitHub(githubRepoUrl, connectorAlias);
  });

  ipcMain.handle('upload-customizer', async (event, githubRepoUrl: string, customizerName?: string) => {
    return uploadCustomizerFromGitHub(githubRepoUrl, customizerName);
  });
}

