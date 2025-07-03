import { tokenSecurityService } from '../security/token.security.service';
import { TaskMetadataService } from './task.metadata.service';
import { MicrosoftTaskList, MicrosoftTask } from './todo.types';
import { DatabaseService } from '../../../backend/services/database.service';

export class MicrosoftTodoService {
  private metadataService: TaskMetadataService;
  private databaseService: DatabaseService;
  private baseUrl = 'https://graph.microsoft.com/v1.0';

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
    this.metadataService = new TaskMetadataService(this.databaseService);
  }

  private async getValidToken(): Promise<string | null> {
    try {
      const tokenData = await tokenSecurityService.retrieveTokenSecurely(
        this.databaseService,
        'microsoft',
        'access'
      );

      if (!tokenData || !tokenData.accessToken) {
        return null;
      }

      // Check if token is expired
      if (tokenSecurityService.isTokenExpired(tokenData)) {
        console.debug('Microsoft token expired, attempting refresh');
        return null;
      }

      return tokenData.accessToken;
    } catch (error) {
      console.error('Failed to get valid Microsoft token:', error);
      return null;
    }
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const accessToken = await this.getValidToken();
    
    if (!accessToken) {
      throw new Error('No valid Microsoft access token available');
    }
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Microsoft Graph API error: ${response.status} - ${errorText}`);
    }

    // Handle empty responses (like DELETE operations)
    const text = await response.text();
    if (!text) {
      return null;
    }
    
    try {
      return JSON.parse(text);
    } catch (error) {
      // If response is not JSON, return the text as is
      return text;
    }
  }

  async getTaskLists(): Promise<MicrosoftTaskList[]> {
    try {
      const response = await this.makeRequest('/me/todo/lists');
      return response.value || [];
    } catch (error) {
      console.error('Error fetching Microsoft task lists:', error);
      throw error;
    }
  }

  async createTaskList(displayName: string): Promise<MicrosoftTaskList> {
    try {
      const response = await this.makeRequest('/me/todo/lists', {
        method: 'POST',
        body: JSON.stringify({ displayName })
      });
      return response;
    } catch (error) {
      console.error('Error creating Microsoft task list:', error);
      throw error;
    }
  }

  async updateTaskList(listId: string, displayName: string): Promise<MicrosoftTaskList> {
    try {
      const response = await this.makeRequest(`/me/todo/lists/${listId}`, {
        method: 'PATCH',
        body: JSON.stringify({ displayName })
      });
      return response;
    } catch (error) {
      console.error('Error updating Microsoft task list:', error);
      throw error;
    }
  }

  async deleteTaskList(listId: string): Promise<void> {
    try {
      await this.makeRequest(`/me/todo/lists/${listId}`, {
        method: 'DELETE'
      });
    } catch (error) {
      console.error('Error deleting Microsoft task list:', error);
      throw error;
    }
  }

  async getTasks(listId: string, options: {
    includeCompleted?: boolean;
    maxResults?: number;
    filter?: string;
  } = {}): Promise<MicrosoftTask[]> {
    try {
      const params = new URLSearchParams();
      
      if (options.maxResults) {
        params.append('$top', options.maxResults.toString());
      }
      
      let filter = '';
      if (options.includeCompleted === false) {
        filter = "status ne 'completed'";
      }
      
      if (options.filter) {
        filter = filter ? `${filter} and ${options.filter}` : options.filter;
      }
      
      if (filter) {
        params.append('$filter', filter);
      }

      const queryString = params.toString();
      const endpoint = `/me/todo/lists/${listId}/tasks${queryString ? `?${queryString}` : ''}`;
      
      const response = await this.makeRequest(endpoint);
      const tasks = response.value || [];
      
      // Add taskListId to each task for reference
      return tasks.map((task: MicrosoftTask) => ({
        ...task,
        taskListId: listId
      }));
    } catch (error) {
      console.error('Error fetching Microsoft tasks:', error);
      throw error;
    }
  }

  async createTask(listId: string, taskData: {
    title: string;
    body?: {
      content: string;
      contentType: 'text' | 'html';
    };
    dueDateTime?: {
      dateTime: string;
      timeZone: string;
    };
    importance?: 'low' | 'normal' | 'high';
    categories?: string[];
    startDateTime?: {
      dateTime: string;
      timeZone: string;
    };
  }): Promise<MicrosoftTask> {
    try {
      const response = await this.makeRequest(`/me/todo/lists/${listId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(taskData)
      });
      
      return {
        ...response,
        taskListId: listId
      };
    } catch (error) {
      console.error('Error creating Microsoft task:', error);
      throw error;
    }
  }

  async updateTask(listId: string, taskId: string, taskData: {
    title?: string;
    body?: {
      content: string;
      contentType: 'text' | 'html';
    } | null;
    dueDateTime?: {
      dateTime: string;
      timeZone: string;
    } | null;
    importance?: 'low' | 'normal' | 'high';
    status?: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred';
    categories?: string[];
    startDateTime?: {
      dateTime: string;
      timeZone: string;
    } | null;
  }): Promise<MicrosoftTask> {
    try {
      const response = await this.makeRequest(`/me/todo/lists/${listId}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(taskData)
      });
      
      return {
        ...response,
        taskListId: listId
      };
    } catch (error) {
      console.error('Error updating Microsoft task:', error);
      throw error;
    }
  }


  async completeTask(listId: string, taskId: string): Promise<MicrosoftTask> {
    try {
      const response = await this.makeRequest(`/me/todo/lists/${listId}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'completed',
          completedDateTime: {
            dateTime: new Date().toISOString(),
            timeZone: 'UTC'
          }
        })
      });
      
      return {
        ...response,
        taskListId: listId
      };
    } catch (error) {
      console.error('Error completing Microsoft task:', error);
      throw error;
    }
  }

  async uncompleteTask(listId: string, taskId: string): Promise<MicrosoftTask> {
    try {
      const response = await this.makeRequest(`/me/todo/lists/${listId}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'notStarted',
          completedDateTime: null
        })
      });
      
      return {
        ...response,
        taskListId: listId
      };
    } catch (error) {
      console.error('Error uncompleting Microsoft task:', error);
      throw error;
    }
  }

  async getTask(listId: string, taskId: string): Promise<MicrosoftTask> {
    try {
      const response = await this.makeRequest(`/me/todo/lists/${listId}/tasks/${taskId}`);
      return {
        ...response,
        taskListId: listId
      };
    } catch (error) {
      console.error('Error fetching Microsoft task:', error);
      throw error;
    }
  }

  async batchUpdateTasks(listId: string, tasks: Array<{
    id: string;
    data: Partial<MicrosoftTask>;
  }>): Promise<MicrosoftTask[]> {
    try {
      const updatePromises = tasks.map(({ id, data }) => 
        this.updateTask(listId, id, data)
      );
      
      return await Promise.all(updatePromises);
    } catch (error) {
      console.error('Error batch updating Microsoft tasks:', error);
      throw error;
    }
  }

  async searchTasks(listId: string, query: string): Promise<MicrosoftTask[]> {
    try {
      const filter = `contains(title,'${query}')`;
      return await this.getTasks(listId, { filter, includeCompleted: true });
    } catch (error) {
      console.error('Error searching Microsoft tasks:', error);
      throw error;
    }
  }

  async getTasksAssignedToMe(): Promise<MicrosoftTask[]> {
    try {
      // Get all lists first
      const lists = await this.getTaskLists();
      const allTasks: MicrosoftTask[] = [];
      
      // Get tasks from all lists and filter for assigned tasks
      for (const list of lists) {
        const tasks = await this.getTasks(list.id, { includeCompleted: false });
        const assignedTasks = tasks.filter(task => task.assignedTo);
        allTasks.push(...assignedTasks);
      }
      
      return allTasks;
    } catch (error) {
      console.error('Error fetching assigned Microsoft tasks:', error);
      throw error;
    }
  }

  async getMyTasks(): Promise<MicrosoftTask[]> {
    try {
      // Get the default task list (typically the first one)
      const lists = await this.getTaskLists();
      const defaultList = lists.find(list => list.wellknownListName === 'defaultList') || lists[0];
      
      if (!defaultList) {
        return [];
      }
      
      return await this.getTasks(defaultList.id, { includeCompleted: false });
    } catch (error) {
      console.error('Error fetching my Microsoft tasks:', error);
      throw error;
    }
  }

  async addTaskAttachment(listId: string, taskId: string, attachment: {
    name: string;
    contentBytes: string;
    contentType: string;
  }): Promise<any> {
    try {
      const response = await this.makeRequest(`/me/todo/lists/${listId}/tasks/${taskId}/attachments`, {
        method: 'POST',
        body: JSON.stringify({
          '@odata.type': '#microsoft.graph.taskFileAttachment',
          name: attachment.name,
          contentBytes: attachment.contentBytes,
          contentType: attachment.contentType
        })
      });
      
      return response;
    } catch (error) {
      console.error('Error adding Microsoft task attachment:', error);
      throw error;
    }
  }

  async getTaskAttachments(listId: string, taskId: string): Promise<any[]> {
    try {
      const response = await this.makeRequest(`/me/todo/lists/${listId}/tasks/${taskId}/attachments`);
      return response.value || [];
    } catch (error) {
      console.error('Error fetching Microsoft task attachments:', error);
      throw error;
    }
  }

  // Enhanced methods for better integration
  async getAllTasks(options: {
    includeCompleted?: boolean;
    maxResults?: number;
  } = {}): Promise<MicrosoftTask[]> {
    try {
      const lists = await this.getTaskLists();
      const allTasks: MicrosoftTask[] = [];
      
      for (const list of lists) {
        const tasks = await this.getTasks(list.id, options);
        allTasks.push(...tasks);
      }
      
      return allTasks;
    } catch (error) {
      console.error('Error fetching all Microsoft tasks:', error);
      throw error;
    }
  }

  async getTasksByStatus(status: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred'): Promise<MicrosoftTask[]> {
    try {
      const allTasks = await this.getAllTasks({ includeCompleted: true });
      return allTasks.filter(task => task.status === status);
    } catch (error) {
      console.error('Error fetching Microsoft tasks by status:', error);
      throw error;
    }
  }

  async getOverdueTasks(): Promise<MicrosoftTask[]> {
    try {
      const pendingTasks = await this.getTasksByStatus('notStarted');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      return pendingTasks.filter(task => {
        if (!task.dueDateTime) return false;
        const dueDate = new Date(task.dueDateTime.dateTime);
        return dueDate < today;
      });
    } catch (error) {
      console.error('Error fetching overdue Microsoft tasks:', error);
      throw error;
    }
  }

  async getTodayTasks(): Promise<MicrosoftTask[]> {
    try {
      const pendingTasks = await this.getTasksByStatus('notStarted');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      return pendingTasks.filter(task => {
        if (!task.dueDateTime) return false;
        const dueDate = new Date(task.dueDateTime.dateTime);
        return dueDate >= today && dueDate < tomorrow;
      });
    } catch (error) {
      console.error('Error fetching today Microsoft tasks:', error);
      throw error;
    }
  }

  async getTomorrowTasks(): Promise<MicrosoftTask[]> {
    try {
      const pendingTasks = await this.getTasksByStatus('notStarted');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);
      
      return pendingTasks.filter(task => {
        if (!task.dueDateTime) return false;
        const dueDate = new Date(task.dueDateTime.dateTime);
        return dueDate >= tomorrow && dueDate < dayAfter;
      });
    } catch (error) {
      console.error('Error fetching tomorrow Microsoft tasks:', error);
      throw error;
    }
  }

  async duplicateTask(listId: string, taskId: string, newTitle?: string): Promise<MicrosoftTask> {
    try {
      const originalTask = await this.getTask(listId, taskId);
      
      const duplicateData = {
        title: newTitle || `Copy of ${originalTask.title}`,
        body: originalTask.body,
        dueDateTime: originalTask.dueDateTime,
        importance: originalTask.importance,
        categories: originalTask.categories
      };
      
      return await this.createTask(listId, duplicateData);
    } catch (error) {
      console.error('Error duplicating Microsoft task:', error);
      throw error;
    }
  }

  async getTaskStats(listId?: string): Promise<{
    total: number;
    completed: number;
    pending: number;
    overdue: number;
  }> {
    try {
      const tasks = listId 
        ? await this.getTasks(listId, { includeCompleted: true })
        : await this.getAllTasks({ includeCompleted: true });
      
      const total = tasks.length;
      const completed = tasks.filter(t => t.status === 'completed').length;
      const pending = total - completed;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const overdue = tasks.filter(t => {
        if (t.status === 'completed' || !t.dueDateTime) return false;
        const dueDate = new Date(t.dueDateTime.dateTime);
        return dueDate < today;
      }).length;
      
      return { total, completed, pending, overdue };
    } catch (error) {
      console.error('Error getting Microsoft task stats:', error);
      throw error;
    }
  }

  // System lists handling
  async getSystemLists(): Promise<MicrosoftTaskList[]> {
    try {
      const allLists = await this.getTaskLists();
      return allLists.filter(list => list.wellknownListName !== 'none');
    } catch (error) {
      console.error('Error fetching Microsoft system lists:', error);
      throw error;
    }
  }

  async getCustomLists(): Promise<MicrosoftTaskList[]> {
    try {
      const allLists = await this.getTaskLists();
      return allLists.filter(list => list.wellknownListName === 'none');
    } catch (error) {
      console.error('Error fetching Microsoft custom lists:', error);
      throw error;
    }
  }

  async getDefaultList(): Promise<MicrosoftTaskList | null> {
    try {
      const allLists = await this.getTaskLists();
      return allLists.find(list => list.wellknownListName === 'defaultList') || null;
    } catch (error) {
      console.error('Error fetching Microsoft default list:', error);
      return null;
    }
  }

  // Enhanced methods with metadata integration
  async getTaskWithMetadata(listId: string, taskId: string): Promise<MicrosoftTask> {
    try {
      const task = await this.getTask(listId, taskId);
      const metadata = await this.metadataService.getTaskMetadata('microsoft', taskId);
      
      return {
        ...task,
        isStarred: metadata?.isStarred || false,
        tags: metadata?.tags
      };
    } catch (error) {
      console.error('Error getting Microsoft task with metadata:', error);
      throw error;
    }
  }

  async getTasksWithMetadata(listId: string, options: {
    includeCompleted?: boolean;
    maxResults?: number;
    filter?: string;
  } = {}): Promise<MicrosoftTask[]> {
    try {
      const tasks = await this.getTasks(listId, options);
      
      // Enhance tasks with metadata
      for (const task of tasks) {
        const metadata = await this.metadataService.getTaskMetadata('microsoft', task.id);
        task.isStarred = metadata?.isStarred || false;
        task.tags = metadata?.tags;
      }
      
      return tasks;
    } catch (error) {
      console.error('Error getting Microsoft tasks with metadata:', error);
      throw error;
    }
  }

  async updateTaskMetadata(taskId: string, listId: string, metadata: {
    isStarred?: boolean;
    priority?: 'low' | 'normal' | 'high';
    tags?: string[];
    notes?: string;
  }): Promise<void> {
    try {
      await this.metadataService.setTaskMetadata({
        provider: 'microsoft',
        providerId: taskId,
        listId,
        ...metadata
      });
    } catch (error) {
      console.error('Error updating Microsoft task metadata:', error);
      throw error;
    }
  }

  // Starring functionality using metadata service
  async toggleTaskStar(listId: string, taskId: string): Promise<boolean> {
    try {
      return await this.metadataService.toggleTaskStar('microsoft', taskId, listId);
    } catch (error) {
      console.error('Error toggling Microsoft task star:', error);
      throw error;
    }
  }

  async isTaskStarred(taskId: string): Promise<boolean> {
    try {
      const metadata = await this.metadataService.getTaskMetadata('microsoft', taskId);
      return metadata?.isStarred || false;
    } catch (error) {
      console.error('Error checking if Microsoft task is starred:', error);
      return false;
    }
  }

  async getStarredTasks(): Promise<MicrosoftTask[]> {
    try {
      const starredMetadata = await this.metadataService.getStarredTasks('microsoft');
      const starredTasks: MicrosoftTask[] = [];
      
      // Get actual task data for each starred task
      for (const metadata of starredMetadata) {
        try {
          const task = await this.getTask(metadata.listId, metadata.providerId);
          task.isStarred = true;
          starredTasks.push(task);
        } catch (error) {
          // Task might have been deleted, remove from metadata
          console.warn(`Starred task ${metadata.providerId} not found, removing from starred list`);
          await this.metadataService.deleteTaskMetadata('microsoft', metadata.providerId);
        }
      }
      
      return starredTasks;
    } catch (error) {
      console.error('Error getting starred Microsoft tasks:', error);
      throw error;
    }
  }

  // Override delete to also clean up metadata
  async deleteTask(listId: string, taskId: string): Promise<void> {
    try {
      // Delete the task from Microsoft Graph API
      await this.makeRequest(`/me/todo/lists/${listId}/tasks/${taskId}`, {
        method: 'DELETE'
      });
      
      // Clean up local metadata
      await this.metadataService.deleteTaskMetadata('microsoft', taskId);
    } catch (error) {
      console.error('Error deleting Microsoft task:', error);
      
      // If task is not found (404), it's already deleted - clean up metadata anyway
      if (error instanceof Error && error.message && error.message.includes('404')) {
        console.log('Task not found, cleaning up metadata anyway');
        try {
          await this.metadataService.deleteTaskMetadata('microsoft', taskId);
        } catch (metadataError) {
          console.error('Error cleaning up metadata for deleted task:', metadataError);
        }
        return; // Don't throw error for 404s
      }
      
      throw error;
    }
  }

  // Get tasks by priority using metadata
  async getTasksByPriority(priority: 'low' | 'normal' | 'high'): Promise<MicrosoftTask[]> {
    try {
      const allTasks = await this.getAllTasks({ includeCompleted: false });
      const priorityTasks: MicrosoftTask[] = [];
      
      for (const task of allTasks) {
        const metadata = await this.metadataService.getTaskMetadata('microsoft', task.id);
        if (metadata?.priority === priority) {
          task.isStarred = metadata.isStarred;
          task.priority = metadata.priority;
          task.tags = metadata.tags;
          priorityTasks.push(task);
        }
      }
      
      return priorityTasks;
    } catch (error) {
      console.error('Error getting Microsoft tasks by priority:', error);
      throw error;
    }
  }

  // Bulk operations for better performance
  async bulkUpdateTasks(listId: string, tasks: Array<{
    id: string;
    data: Partial<MicrosoftTask>;
  }>): Promise<MicrosoftTask[]> {
    try {
      const updatePromises = tasks.map(({ id, data }) => 
        this.updateTask(listId, id, data)
      );
      
      return await Promise.all(updatePromises);
    } catch (error) {
      console.error('Error bulk updating Microsoft tasks:', error);
      throw error;
    }
  }


  // Task management helpers
  async moveTaskToList(fromListId: string, toListId: string, taskId: string): Promise<MicrosoftTask> {
    try {
      // Get the original task
      const originalTask = await this.getTask(fromListId, taskId);
      
      // Create a copy in the new list
      const newTask = await this.createTask(toListId, {
        title: originalTask.title,
        body: originalTask.body,
        dueDateTime: originalTask.dueDateTime,
        importance: originalTask.importance,
        categories: originalTask.categories,
        startDateTime: originalTask.startDateTime
      });
      
      // Delete from the original list
      await this.deleteTask(fromListId, taskId);
      
      return newTask;
    } catch (error) {
      console.error('Error moving Microsoft task between lists:', error);
      throw error;
    }
  }

  async getRecentTasks(days: number = 7): Promise<MicrosoftTask[]> {
    try {
      const allTasks = await this.getAllTasks({ includeCompleted: true });
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      return allTasks.filter(task => {
        const taskDate = new Date(task.lastModifiedDateTime);
        return taskDate >= cutoffDate;
      }).sort((a, b) => 
        new Date(b.lastModifiedDateTime).getTime() - new Date(a.lastModifiedDateTime).getTime()
      );
    } catch (error) {
      console.error('Error getting recent Microsoft tasks:', error);
      throw error;
    }
  }
}