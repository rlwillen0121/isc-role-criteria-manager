import { ipcMain } from 'electron';
import { getGitHubReleaseArtifact, listGitHubJsonFiles, getGitHubFileContent } from './github';

export function setupGitHubHandlers() {
  ipcMain.handle('get-github-release-artifact', async (event, githubRepoUrl: string) => {
    return getGitHubReleaseArtifact(githubRepoUrl);
  });

  ipcMain.handle('list-github-json-files', async (event, githubRepoUrl: string) => {
    return listGitHubJsonFiles(githubRepoUrl);
  });

  ipcMain.handle('get-github-file-content', async (event, downloadUrl: string, filename: string) => {
    return getGitHubFileContent(downloadUrl, filename);
  });
}

