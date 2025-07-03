import { tokenSecurityService } from '../security/token.security.service';
import { TaskMetadataService } from './task.metadata.service';
import { GoogleTaskList, GoogleTask } from './todo.types';
import { DatabaseService } from '../../../backend/services/database.service';

export class GoogleTasksService {
  private metadataService: TaskMetadataService;
  private databaseService: DatabaseService;
  private baseUrl = 'https://tasks.googleapis.com/tasks/v1';

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
    this.metadataService = new TaskMetadataService(this.databaseService);
  }

  private async getValidToken(): Promise<string | null> {
    try {
      const tokenData = await tokenSecurityService.retrieveTokenSecurely(
        this.databaseService,
        'google',
        'access'
      );

      if (!tokenData || !tokenData.accessToken) {
        return null;
      }

      // Check if token is expired
      if (tokenSecurityService.isTokenExpired(tokenData)) {
        console.debug('Google token expired, attempting refresh');
        return null;
      }

      return tokenData.accessToken;
    } catch (error) {
      console.error('Failed to get valid Google token:', error);
      return null;
    }
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const accessToken = await this.getValidToken();
    
    if (!accessToken) {
      throw new Error('No valid Google access token available');
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
      throw new Error(`Google Tasks API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async getTaskLists(): Promise<GoogleTaskList[]> {
    try {
      const response = await this.makeRequest('/users/@me/lists');
      return response.items || [];
    } catch (error) {
      console.error('Error fetching Google task lists:', error);
      throw error;
    }
  }

  async createTaskList(title: string): Promise<GoogleTaskList> {
    try {
      const response = await this.makeRequest('/users/@me/lists', {
        method: 'POST',
        body: JSON.stringify({ title })
      });
      return response;
    } catch (error) {
      console.error('Error creating Google task list:', error);
      throw error;
    }
  }

  async updateTaskList(listId: string, title: string): Promise<GoogleTaskList> {
    try {
      const response = await this.makeRequest(`/users/@me/lists/${listId}`, {
        method: 'PUT',
        body: JSON.stringify({ title })
      });
      return response;
    } catch (error) {
      console.error('Error updating Google task list:', error);
      throw error;
    }
  }

  async deleteTaskList(listId: string): Promise<void> {
    try {
      await this.makeRequest(`/users/@me/lists/${listId}`, {
        method: 'DELETE'
      });
    } catch (error) {
      console.error('Error deleting Google task list:', error);
      throw error;
    }
  }

  async getTasks(listId: string, options: {
    includeCompleted?: boolean;
    maxResults?: number;
    pageToken?: string;
  } = {}): Promise<GoogleTask[]> {
    try {
      const params = new URLSearchParams();
      
      if (options.includeCompleted !== undefined) {
        params.append('showCompleted', options.includeCompleted.toString());
      }
      
      if (options.maxResults) {
        params.append('maxResults', options.maxResults.toString());
      }
      
      if (options.pageToken) {
        params.append('pageToken', options.pageToken);
      }

      const queryString = params.toString();
      const endpoint = `/lists/${listId}/tasks${queryString ? `?${queryString}` : ''}`;
      
      const response = await this.makeRequest(endpoint);
      const tasks = response.items || [];
      
      // Add taskListId to each task for reference
      return tasks.map((task: GoogleTask) => ({
        ...task,
        taskListId: listId
      }));
    } catch (error) {
      console.error('Error fetching Google tasks:', error);
      throw error;
    }
  }

  async createTask(listId: string, taskData: {
    title: string;
    notes?: string;
    due?: string;
    parent?: string;
    previous?: string;
  }): Promise<GoogleTask> {
    try {
      const response = await this.makeRequest(`/lists/${listId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(taskData)
      });
      
      return {
        ...response,
        taskListId: listId
      };
    } catch (error) {
      console.error('Error creating Google task:', error);
      throw error;
    }
  }

  async updateTask(listId: string, taskId: string, taskData: {
    title?: string;
    notes?: string;
    due?: string;
    status?: 'needsAction' | 'completed';
    parent?: string;
    previous?: string;
  }): Promise<GoogleTask> {
    try {
      const response = await this.makeRequest(`/lists/${listId}/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify(taskData)
      });
      
      return {
        ...response,
        taskListId: listId
      };
    } catch (error) {
      console.error('Error updating Google task:', error);
      throw error;
    }
  }


  async moveTask(listId: string, taskId: string, options: {
    parent?: string;
    previous?: string;
  }): Promise<GoogleTask> {
    try {
      const params = new URLSearchParams();
      
      if (options.parent) {
        params.append('parent', options.parent);
      }
      
      if (options.previous) {
        params.append('previous', options.previous);
      }

      const queryString = params.toString();
      const endpoint = `/lists/${listId}/tasks/${taskId}/move${queryString ? `?${queryString}` : ''}`;
      
      const response = await this.makeRequest(endpoint, {
        method: 'POST'
      });
      
      return {
        ...response,
        taskListId: listId
      };
    } catch (error) {
      console.error('Error moving Google task:', error);
      throw error;
    }
  }

  async clearCompletedTasks(listId: string): Promise<void> {
    try {
      await this.makeRequest(`/lists/${listId}/clear`, {
        method: 'POST'
      });
    } catch (error) {
      console.error('Error clearing completed Google tasks:', error);
      throw error;
    }
  }

  async getTask(listId: string, taskId: string): Promise<GoogleTask> {
    try {
      const response = await this.makeRequest(`/lists/${listId}/tasks/${taskId}`);
      return {
        ...response,
        taskListId: listId
      };
    } catch (error) {
      console.error('Error fetching Google task:', error);
      throw error;
    }
  }

  async batchUpdateTasks(listId: string, tasks: Array<{
    id: string;
    data: Partial<GoogleTask>;
  }>): Promise<GoogleTask[]> {
    try {
      const updatePromises = tasks.map(({ id, data }) => 
        this.updateTask(listId, id, data)
      );
      
      return await Promise.all(updatePromises);
    } catch (error) {
      console.error('Error batch updating Google tasks:', error);
      throw error;
    }
  }

  async searchTasks(listId: string, query: string): Promise<GoogleTask[]> {
    try {
      const allTasks = await this.getTasks(listId, { includeCompleted: true });
      
      const lowerQuery = query.toLowerCase();
      return allTasks.filter(task => 
        task.title.toLowerCase().includes(lowerQuery) ||
        (task.notes && task.notes.toLowerCase().includes(lowerQuery))
      );
    } catch (error) {
      console.error('Error searching Google tasks:', error);
      throw error;
    }
  }

  async getAllTasks(options: {
    includeCompleted?: boolean;
    maxResults?: number;
  } = {}): Promise<GoogleTask[]> {
    try {
      const lists = await this.getTaskLists();
      const allTasks: GoogleTask[] = [];
      
      for (const list of lists) {
        const tasks = await this.getTasks(list.id, options);
        allTasks.push(...tasks);
      }
      
      return allTasks;
    } catch (error) {
      console.error('Error fetching all Google tasks:', error);
      throw error;
    }
  }

  async getTasksByStatus(status: 'needsAction' | 'completed'): Promise<GoogleTask[]> {
    try {
      const allTasks = await this.getAllTasks({ includeCompleted: true });
      return allTasks.filter(task => task.status === status);
    } catch (error) {
      console.error('Error fetching Google tasks by status:', error);
      throw error;
    }
  }

  async getOverdueTasks(): Promise<GoogleTask[]> {
    try {
      const pendingTasks = await this.getTasksByStatus('needsAction');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      return pendingTasks.filter(task => {
        if (!task.due) return false;
        const dueDate = new Date(task.due);
        return dueDate < today;
      });
    } catch (error) {
      console.error('Error fetching overdue Google tasks:', error);
      throw error;
    }
  }

  async getTodayTasks(): Promise<GoogleTask[]> {
    try {
      const pendingTasks = await this.getTasksByStatus('needsAction');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      return pendingTasks.filter(task => {
        if (!task.due) return false;
        const dueDate = new Date(task.due);
        return dueDate >= today && dueDate < tomorrow;
      });
    } catch (error) {
      console.error('Error fetching today Google tasks:', error);
      throw error;
    }
  }

  async getTomorrowTasks(): Promise<GoogleTask[]> {
    try {
      const pendingTasks = await this.getTasksByStatus('needsAction');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);
      
      return pendingTasks.filter(task => {
        if (!task.due) return false;
        const dueDate = new Date(task.due);
        return dueDate >= tomorrow && dueDate < dayAfter;
      });
    } catch (error) {
      console.error('Error fetching tomorrow Google tasks:', error);
      throw error;
    }
  }

  async markTaskCompleted(listId: string, taskId: string): Promise<GoogleTask> {
    try {
      return await this.updateTask(listId, taskId, {
        status: 'completed',
        // Google Tasks automatically sets completed date
      });
    } catch (error) {
      console.error('Error marking Google task as completed:', error);
      throw error;
    }
  }

  async markTaskPending(listId: string, taskId: string): Promise<GoogleTask> {
    try {
      return await this.updateTask(listId, taskId, {
        status: 'needsAction'
      });
    } catch (error) {
      console.error('Error marking Google task as pending:', error);
      throw error;
    }
  }

  async duplicateTask(listId: string, taskId: string, newTitle?: string): Promise<GoogleTask> {
    try {
      const originalTask = await this.getTask(listId, taskId);
      
      const duplicateData = {
        title: newTitle || `Copy of ${originalTask.title}`,
        notes: originalTask.notes,
        due: originalTask.due
      };
      
      return await this.createTask(listId, duplicateData);
    } catch (error) {
      console.error('Error duplicating Google task:', error);
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
        if (t.status === 'completed' || !t.due) return false;
        const dueDate = new Date(t.due);
        return dueDate < today;
      }).length;
      
      return { total, completed, pending, overdue };
    } catch (error) {
      console.error('Error getting Google task stats:', error);
      throw error;
    }
  }

  // Starring functionality using metadata service
  async toggleTaskStar(listId: string, taskId: string): Promise<boolean> {
    try {
      return await this.metadataService.toggleTaskStar('google', taskId, listId);
    } catch (error) {
      console.error('Error toggling Google task star:', error);
      throw error;
    }
  }

  async isTaskStarred(taskId: string): Promise<boolean> {
    try {
      const metadata = await this.metadataService.getTaskMetadata('google', taskId);
      return metadata?.isStarred || false;
    } catch (error) {
      console.error('Error checking if Google task is starred:', error);
      return false;
    }
  }

  async getStarredTasks(): Promise<GoogleTask[]> {
    try {
      const starredMetadata = await this.metadataService.getStarredTasks('google');
      const starredTasks: GoogleTask[] = [];
      
      // Get actual task data for each starred task
      for (const metadata of starredMetadata) {
        try {
          const task = await this.getTask(metadata.listId, metadata.providerId);
          task.isStarred = true;
          starredTasks.push(task);
        } catch (error) {
          // Task might have been deleted, remove from metadata
          console.warn(`Starred task ${metadata.providerId} not found, removing from starred list`);
          await this.metadataService.deleteTaskMetadata('google', metadata.providerId);
        }
      }
      
      return starredTasks;
    } catch (error) {
      console.error('Error getting starred Google tasks:', error);
      throw error;
    }
  }

  // Enhanced methods that include metadata
  async getTaskWithMetadata(listId: string, taskId: string): Promise<GoogleTask> {
    try {
      const task = await this.getTask(listId, taskId);
      const metadata = await this.metadataService.getTaskMetadata('google', taskId);
      
      return {
        ...task,
        isStarred: metadata?.isStarred || false,
        priority: metadata?.priority,
        tags: metadata?.tags
      };
    } catch (error) {
      console.error('Error getting Google task with metadata:', error);
      throw error;
    }
  }

  async getTasksWithMetadata(listId: string, options: {
    includeCompleted?: boolean;
    maxResults?: number;
    pageToken?: string;
  } = {}): Promise<GoogleTask[]> {
    try {
      const tasks = await this.getTasks(listId, options);
      
      // Enhance tasks with metadata
      for (const task of tasks) {
        const metadata = await this.metadataService.getTaskMetadata('google', task.id);
        task.isStarred = metadata?.isStarred || false;
        task.priority = metadata?.priority;
        task.tags = metadata?.tags;
      }
      
      return tasks;
    } catch (error) {
      console.error('Error getting Google tasks with metadata:', error);
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
        provider: 'google',
        providerId: taskId,
        listId,
        ...metadata
      });
    } catch (error) {
      console.error('Error updating Google task metadata:', error);
      throw error;
    }
  }

  // Override delete to also clean up metadata
  async deleteTask(listId: string, taskId: string): Promise<void> {
    try {
      // Delete the task from Google Tasks API
      await this.makeRequest(`/lists/${listId}/tasks/${taskId}`, {
        method: 'DELETE'
      });
      
      // Clean up local metadata
      await this.metadataService.deleteTaskMetadata('google', taskId);
    } catch (error) {
      console.error('Error deleting Google task:', error);
      throw error;
    }
  }

  // Get tasks by priority using metadata
  async getTasksByPriority(priority: 'low' | 'normal' | 'high'): Promise<GoogleTask[]> {
    try {
      const allTasks = await this.getAllTasks({ includeCompleted: false });
      const priorityTasks: GoogleTask[] = [];
      
      for (const task of allTasks) {
        const metadata = await this.metadataService.getTaskMetadata('google', task.id);
        if (metadata?.priority === priority) {
          task.isStarred = metadata.isStarred;
          task.priority = metadata.priority;
          task.tags = metadata.tags;
          priorityTasks.push(task);
        }
      }
      
      return priorityTasks;
    } catch (error) {
      console.error('Error getting Google tasks by priority:', error);
      throw error;
    }
  }
}