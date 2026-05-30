import { ipcMain } from 'electron';
import { getMarketplacePosts, getColabPostsByCategory, getTopicRaw, getTopic, getUserTitle, FilterConfig, ColabCategory } from './discourse';

export function setupDiscourseHandlers() {
  ipcMain.handle('get-colab-posts', async (event, filter: FilterConfig, limit?: number) => {
    return getMarketplacePosts(filter, limit);
  });

  ipcMain.handle('get-colab-posts-by-category', async (event, category: ColabCategory, limit?: number) => {
    return getColabPostsByCategory(category, limit);
  });

  ipcMain.handle('get-colab-topic-raw', async (event, topicId: number) => {
    return getTopicRaw(topicId);
  });

  ipcMain.handle('get-colab-topic', async (event, topicId: number) => {
    return getTopic(topicId);
  });

  ipcMain.handle('get-discourse-user-title', async (event, primaryGroupName: string) => {
    return getUserTitle(primaryGroupName);
  });
}

