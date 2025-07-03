import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { DatabaseService } from '../../backend/services/database.service';
import { TokenSecurityService } from '../services/security/token.security.service';
import { GoogleTasksService } from '../services/todo/google.tasks.service';
import { MicrosoftTodoService } from '../services/todo/microsoft.todo.service';
import { TodoAggregatorService } from '../services/todo/todo.aggregator.service';
import { 
  TodoProvider, 
  TodoInitializationData, 
  TaskCreateRequest, 
  TaskUpdateRequest, 
  ListCreateRequest, 
  ListUpdateRequest,
  TodoOperationResult,
  SyncProgress
} from '../services/todo/todo.types';

export class TodoHandler {
  private googleTasksService: GoogleTasksService;
  private microsoftTodoService: MicrosoftTodoService;
  private todoAggregatorService: TodoAggregatorService;
  private databaseService: DatabaseService;
  private tokenSecurityService: TokenSecurityService;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
    this.tokenSecurityService = new TokenSecurityService();
    this.googleTasksService = new GoogleTasksService(this.databaseService);
    this.microsoftTodoService = new MicrosoftTodoService(this.databaseService);
    this.todoAggregatorService = new TodoAggregatorService(
      this.googleTasksService,
      this.microsoftTodoService
    );
    
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Authentication & Account Detection
    ipcMain.handle('todo:get-authenticated-accounts', this.getAuthenticatedAccounts.bind(this));
    ipcMain.handle('todo:validate-account-tokens', this.validateAccountTokens.bind(this));
    ipcMain.handle('todo:initialize-data', this.initializeTodoData.bind(this));

    // Google Tasks Operations
    ipcMain.handle('todo:google:get-lists', this.getGoogleTaskLists.bind(this));
    ipcMain.handle('todo:google:create-list', this.createGoogleTaskList.bind(this));
    ipcMain.handle('todo:google:update-list', this.updateGoogleTaskList.bind(this));
    ipcMain.handle('todo:google:delete-list', this.deleteGoogleTaskList.bind(this));
    ipcMain.handle('todo:google:get-tasks', this.getGoogleTasks.bind(this));
    ipcMain.handle('todo:google:create-task', this.createGoogleTask.bind(this));
    ipcMain.handle('todo:google:update-task', this.updateGoogleTask.bind(this));
    ipcMain.handle('todo:google:delete-task', this.deleteGoogleTask.bind(this));
    ipcMain.handle('todo:google:toggle-star', this.toggleGoogleTaskStar.bind(this));

    // Microsoft To Do Operations
    ipcMain.handle('todo:microsoft:get-lists', this.getMicrosoftTaskLists.bind(this));
    ipcMain.handle('todo:microsoft:create-list', this.createMicrosoftTaskList.bind(this));
    ipcMain.handle('todo:microsoft:update-list', this.updateMicrosoftTaskList.bind(this));
    ipcMain.handle('todo:microsoft:delete-list', this.deleteMicrosoftTaskList.bind(this));
    ipcMain.handle('todo:microsoft:get-tasks', this.getMicrosoftTasks.bind(this));
    ipcMain.handle('todo:microsoft:create-task', this.createMicrosoftTask.bind(this));
    ipcMain.handle('todo:microsoft:update-task', this.updateMicrosoftTask.bind(this));
    ipcMain.handle('todo:microsoft:delete-task', this.deleteMicrosoftTask.bind(this));
    ipcMain.handle('todo:microsoft:toggle-star', this.toggleMicrosoftTaskStar.bind(this));

    // Utility Functions
    ipcMain.handle('todo:sync-all', this.syncAllTasks.bind(this));
    ipcMain.handle('todo:get-unified-data', this.getUnifiedTaskData.bind(this));
  }

  // Authentication & Account Detection
  private async getAuthenticatedAccounts(event: IpcMainInvokeEvent): Promise<TodoOperationResult<TodoProvider[]>> {
    try {
      const providers: TodoProvider[] = [];
      
      // Get user profiles from database
      const profilesResult = await this.databaseService.getActiveUserProfiles();
      console.log('Todo: Getting user profiles result:', profilesResult);
      
      if (!profilesResult.success || !profilesResult.data) {
        console.log('Todo: No profiles found or unsuccessful result');
        return { success: true, data: [] };
      }
      
      console.log('Todo: Found profiles:', profilesResult.data.length);
      
      // Convert profiles to TodoProvider format
      for (const profile of profilesResult.data) {
        console.log('Todo: Processing profile:', profile);
        providers.push({
          id: profile.id,
          name: profile.name || profile.email,
          type: profile.provider as 'google' | 'microsoft',
          email: profile.email,
          isConnected: profile.isActive,
          hasValidToken: true // We'll assume if they have a profile, they have valid tokens
        });
      }
      
      console.log('Todo: Final providers:', providers);

      return { success: true, data: providers };
    } catch (error) {
      console.error('Error getting authenticated accounts:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async validateAccountTokens(event: IpcMainInvokeEvent): Promise<TodoOperationResult<Record<string, boolean>>> {
    try {
      const profilesResult = await this.databaseService.getActiveUserProfiles();
      if (!profilesResult.success || !profilesResult.data) {
        return { success: true, data: {} };
      }
      
      const validationResults: Record<string, boolean> = {};
      
      for (const profile of profilesResult.data) {
        validationResults[profile.id] = profile.isActive;
      }

      return { success: true, data: validationResults };
    } catch (error) {
      console.error('Error validating account tokens:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }


  private async initializeTodoData(event: IpcMainInvokeEvent): Promise<TodoOperationResult<TodoInitializationData>> {
    try {
      // Send progress updates to the frontend
      const sendProgress = (progress: SyncProgress) => {
        event.sender.send('todo:sync-progress', progress);
      };

      sendProgress({
        phase: 'accounts',
        progress: 10,
        message: 'Loading authenticated accounts...'
      });

      // Get authenticated accounts
      const accountsResult = await this.getAuthenticatedAccounts(event);
      if (!accountsResult.success || !accountsResult.data) {
        throw new Error('Failed to load authenticated accounts');
      }

      const providers = accountsResult.data;
      const validProviders = providers.filter(p => p.hasValidToken);

      sendProgress({
        phase: 'lists',
        progress: 30,
        message: 'Loading task lists...'
      });

      // Use aggregator service to fetch and convert lists to unified format
      const allLists = await this.todoAggregatorService.getAllLists(validProviders);

      sendProgress({
        phase: 'tasks',
        progress: 60,
        message: 'Loading tasks...'
      });

      // Fetch tasks for all lists
      const allTasks = await this.todoAggregatorService.getAllTasks(allLists);

      sendProgress({
        phase: 'complete',
        progress: 100,
        message: 'Initialization complete!'
      });

      const initData: TodoInitializationData = {
        providers: validProviders,
        lists: allLists,
        tasks: allTasks,
        errors: {}
      };

      return { success: true, data: initData };
    } catch (error) {
      console.error('Error initializing todo data:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // Google Tasks Operations
  private async getGoogleTaskLists(event: IpcMainInvokeEvent): Promise<TodoOperationResult> {
    try {
      const lists = await this.googleTasksService.getTaskLists();
      return { success: true, data: lists };
    } catch (error) {
      console.error('Error getting Google task lists:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async createGoogleTaskList(event: IpcMainInvokeEvent, request: ListCreateRequest): Promise<TodoOperationResult> {
    try {
      const list = await this.googleTasksService.createTaskList(request.name);
      return { success: true, data: list };
    } catch (error) {
      console.error('Error creating Google task list:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async updateGoogleTaskList(event: IpcMainInvokeEvent, request: ListUpdateRequest): Promise<TodoOperationResult> {
    try {
      const list = await this.googleTasksService.updateTaskList(request.id, request.name);
      return { success: true, data: list };
    } catch (error) {
      console.error('Error updating Google task list:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async deleteGoogleTaskList(event: IpcMainInvokeEvent, listId: string): Promise<TodoOperationResult> {
    try {
      await this.googleTasksService.deleteTaskList(listId);
      return { success: true };
    } catch (error) {
      console.error('Error deleting Google task list:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async getGoogleTasks(event: IpcMainInvokeEvent, listId: string): Promise<TodoOperationResult> {
    try {
      const tasks = await this.googleTasksService.getTasks(listId);
      return { success: true, data: tasks };
    } catch (error) {
      console.error('Error getting Google tasks:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async createGoogleTask(event: IpcMainInvokeEvent, request: TaskCreateRequest): Promise<TodoOperationResult> {
    try {
      // Build task data with only valid fields
      const taskData: any = {
        title: request.title
      };
      
      if (request.description) {
        taskData.notes = request.description;
      }
      
      if (request.dueDate) {
        // Convert to RFC 3339 format for Google Tasks
        const date = new Date(request.dueDate);
        taskData.due = date.toISOString();
      }
      
      const task = await this.googleTasksService.createTask(request.listId, taskData);
      
      // Note: Starred status is handled by the unified layer via metadata
      
      return { success: true, data: task };
    } catch (error) {
      console.error('Error creating Google task:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async updateGoogleTask(event: IpcMainInvokeEvent, request: TaskUpdateRequest): Promise<TodoOperationResult> {
    try {
      // Validate required fields
      if (!request.id || !request.listId) {
        throw new Error('Missing required fields: task ID or list ID');
      }
      
      // First, get the existing task to merge with updates
      const existingTask = await this.googleTasksService.getTask(request.listId, request.id);
      
      // Build update payload with full task data (Google Tasks API requires PUT with full object)
      const updateData: any = {
        id: existingTask.id,
        title: request.title !== undefined ? request.title : existingTask.title,
        notes: request.description !== undefined ? request.description : existingTask.notes || '',
        status: existingTask.status
      };
      
      // Handle due date
      if (request.dueDate !== undefined) {
        if (request.dueDate) {
          // Convert date string to RFC 3339 format
          const date = new Date(request.dueDate);
          updateData.due = date.toISOString();
        } else {
          // Don't include due field to clear it
        }
      } else if (existingTask.due) {
        updateData.due = existingTask.due;
      }
      
      // Handle status
      if (request.status !== undefined) {
        updateData.status = request.status === 'completed' ? 'completed' : 'needsAction';
      }
      
      // Include other required fields from existing task
      if (existingTask.etag) updateData.etag = existingTask.etag;
      if (existingTask.kind) updateData.kind = existingTask.kind;
      if (existingTask.selfLink) updateData.selfLink = existingTask.selfLink;
      if (existingTask.position) updateData.position = existingTask.position;
      if (existingTask.parent) updateData.parent = existingTask.parent;
      if (existingTask.hidden) updateData.hidden = existingTask.hidden;
      
      const task = await this.googleTasksService.updateTask(request.listId, request.id, updateData);
      return { success: true, data: task };
    } catch (error) {
      console.error('Error updating Google task:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async deleteGoogleTask(event: IpcMainInvokeEvent, listId: string, taskId: string): Promise<TodoOperationResult> {
    try {
      await this.googleTasksService.deleteTask(listId, taskId);
      return { success: true };
    } catch (error) {
      console.error('Error deleting Google task:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async toggleGoogleTaskStar(event: IpcMainInvokeEvent, listId: string, taskId: string, starred: boolean): Promise<TodoOperationResult> {
    try {
      const result = await this.googleTasksService.toggleTaskStar(listId, taskId);
      return { success: true, data: result };
    } catch (error) {
      console.error('Error toggling Google task star:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Microsoft To Do Operations
  private async getMicrosoftTaskLists(event: IpcMainInvokeEvent): Promise<TodoOperationResult> {
    try {
      const lists = await this.microsoftTodoService.getTaskLists();
      return { success: true, data: lists };
    } catch (error) {
      console.error('Error getting Microsoft task lists:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async createMicrosoftTaskList(event: IpcMainInvokeEvent, request: ListCreateRequest): Promise<TodoOperationResult> {
    try {
      const list = await this.microsoftTodoService.createTaskList(request.name);
      return { success: true, data: list };
    } catch (error) {
      console.error('Error creating Microsoft task list:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async updateMicrosoftTaskList(event: IpcMainInvokeEvent, request: ListUpdateRequest): Promise<TodoOperationResult> {
    try {
      const list = await this.microsoftTodoService.updateTaskList(request.id, request.name);
      return { success: true, data: list };
    } catch (error) {
      console.error('Error updating Microsoft task list:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async deleteMicrosoftTaskList(event: IpcMainInvokeEvent, listId: string): Promise<TodoOperationResult> {
    try {
      await this.microsoftTodoService.deleteTaskList(listId);
      return { success: true };
    } catch (error) {
      console.error('Error deleting Microsoft task list:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async getMicrosoftTasks(event: IpcMainInvokeEvent, listId: string): Promise<TodoOperationResult> {
    try {
      const tasks = await this.microsoftTodoService.getTasks(listId);
      return { success: true, data: tasks };
    } catch (error) {
      console.error('Error getting Microsoft tasks:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async createMicrosoftTask(event: IpcMainInvokeEvent, request: TaskCreateRequest): Promise<TodoOperationResult> {
    try {
      const taskData: any = {
        title: request.title
      };
      
      if (request.description) {
        taskData.body = {
          content: request.description,
          contentType: 'text'
        };
      }
      
      if (request.dueDate) {
        // Ensure proper date format
        const date = new Date(request.dueDate);
        taskData.dueDateTime = {
          dateTime: date.toISOString(),
          timeZone: 'UTC'
        };
      }
      
      // Handle importance correctly
      if (request.isImportant !== undefined) {
        taskData.importance = request.isImportant ? 'high' : 'normal';
      } else if (request.priority) {
        taskData.importance = request.priority;
      } else {
        taskData.importance = 'normal';
      }
      
      const task = await this.microsoftTodoService.createTask(request.listId, taskData);
      return { success: true, data: task };
    } catch (error) {
      console.error('Error creating Microsoft task:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async updateMicrosoftTask(event: IpcMainInvokeEvent, request: TaskUpdateRequest): Promise<TodoOperationResult> {
    try {
      // Check if we need to move the task to a different list
      if (request.newListId && request.newListId !== request.listId) {
        // Move task to new list
        const movedTask = await this.microsoftTodoService.moveTaskToList(
          request.listId || '', 
          request.newListId, 
          request.id
        );
        
        // Now update the task in the new list with other changes
        const updateData: any = {};
        
        if (request.title !== undefined) updateData.title = request.title;
        if (request.description !== undefined) {
          updateData.body = {
            content: request.description,
            contentType: 'text'
          };
        }
        if (request.dueDate !== undefined) {
          if (request.dueDate) {
            // Convert date string to ISO format for Microsoft
            const date = new Date(request.dueDate);
            updateData.dueDateTime = {
              dateTime: date.toISOString(),
              timeZone: 'UTC'
            };
          } else {
            updateData.dueDateTime = null;
          }
        }
        if (request.isImportant !== undefined) updateData.importance = request.isImportant ? 'high' : 'normal';
        if (request.status !== undefined) {
          updateData.status = request.status === 'completed' ? 'completed' : 'notStarted';
        }
        
        // Only update if there are other changes besides the list move
        if (Object.keys(updateData).length > 0) {
          const finalTask = await this.microsoftTodoService.updateTask(request.newListId, movedTask.id, updateData);
          return { success: true, data: finalTask };
        }
        
        return { success: true, data: movedTask };
      } else {
        // Regular update without list change
        const updateData: any = {};
        
        if (request.title !== undefined) updateData.title = request.title;
        if (request.description !== undefined) {
          updateData.body = {
            content: request.description,
            contentType: 'text'
          };
        }
        if (request.dueDate !== undefined) {
          if (request.dueDate) {
            // Convert date string to ISO format for Microsoft
            const date = new Date(request.dueDate);
            updateData.dueDateTime = {
              dateTime: date.toISOString(),
              timeZone: 'UTC'
            };
          } else {
            updateData.dueDateTime = null;
          }
        }
        if (request.isImportant !== undefined) updateData.importance = request.isImportant ? 'high' : 'normal';
        if (request.status !== undefined) {
          updateData.status = request.status === 'completed' ? 'completed' : 'notStarted';
        }

        const task = await this.microsoftTodoService.updateTask(request.listId || '', request.id, updateData);
        return { success: true, data: task };
      }
    } catch (error) {
      console.error('Error updating Microsoft task:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async deleteMicrosoftTask(event: IpcMainInvokeEvent, listId: string, taskId: string): Promise<TodoOperationResult> {
    try {
      await this.microsoftTodoService.deleteTask(listId, taskId);
      return { success: true };
    } catch (error) {
      console.error('Error deleting Microsoft task:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async toggleMicrosoftTaskStar(event: IpcMainInvokeEvent, listId: string, taskId: string, starred: boolean): Promise<TodoOperationResult> {
    try {
      const result = await this.microsoftTodoService.toggleTaskStar(listId, taskId);
      return { success: true, data: result };
    } catch (error) {
      console.error('Error toggling Microsoft task star:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Utility Functions
  private async syncAllTasks(event: IpcMainInvokeEvent): Promise<TodoOperationResult> {
    try {
      const result = await this.todoAggregatorService.syncAllTasks((progress) => {
        event.sender.send('todo:sync-progress', progress);
      });
      return { success: true, data: result };
    } catch (error) {
      console.error('Error syncing all tasks:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async getUnifiedTaskData(event: IpcMainInvokeEvent): Promise<TodoOperationResult> {
    try {
      const data = await this.todoAggregatorService.getUnifiedTaskData();
      return { success: true, data };
    } catch (error) {
      console.error('Error getting unified task data:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

// TodoHandler is instantiated by HandlersManager - no need for a singleton export