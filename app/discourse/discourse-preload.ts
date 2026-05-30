const { ipcRenderer: ipcMain } = require('electron');

export const discoursePreloader = {
  getColabPosts: (filter: any, limit?: number) => ipcMain.invoke('get-colab-posts', filter, limit),
  getColabPostsByCategory: (category: any, limit?: number) => ipcMain.invoke('get-colab-posts-by-category', category, limit),
  getColabTopicRaw: (topicId: number) => ipcMain.invoke('get-colab-topic-raw', topicId),
  getColabTopic: (topicId: number) => ipcMain.invoke('get-colab-topic', topicId),
  getDiscourseUserTitle: (primaryGroupName: string) => ipcMain.invoke('get-discourse-user-title', primaryGroupName),
};

