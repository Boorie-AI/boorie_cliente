export interface TodoProvider {
  id: string;
  name: string;
  type: 'google' | 'microsoft';
  email: string;
  isConnected: boolean;
  hasValidToken: boolean;
}

export interface GoogleTaskList {
  id: string;
  title: string;
  selfLink: string;
  updated: string;
  kind: string;
  etag: string;
  isStarred?: boolean;
  isDefault?: boolean;
}

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string;
  completed?: string;
  updated: string;
  selfLink: string;
  parent?: string;
  position: string;
  kind: string;
  etag: string;
  links?: Array<{
    type: string;
    link: string;
    description?: string;
  }>;
  hidden?: boolean;
  deleted?: boolean;
  taskListId: string;
  // Additional properties for metadata integration
  isStarred?: boolean;
  priority?: 'low' | 'normal' | 'high';
  tags?: string[];
}

export interface MicrosoftTaskList {
  id: string;
  displayName: string;
  isOwner: boolean;
  isShared: boolean;
  wellknownListName?: 'none' | 'defaultList' | 'flaggedEmails' | 'unknownFutureValue';
  isSystem: boolean;
  isDefault?: boolean;
}

export interface MicrosoftTask {
  id: string;
  title: string;
  body?: {
    content: string;
    contentType: 'text' | 'html';
  };
  dueDateTime?: {
    dateTime: string;
    timeZone: string;
  };
  completedDateTime?: {
    dateTime: string;
    timeZone: string;
  };
  status: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred';
  importance: 'low' | 'normal' | 'high';
  createdDateTime: string;
  lastModifiedDateTime: string;
  hasAttachments: boolean;
  categories?: string[];
  assignedTo?: string;
  taskListId: string;
  parentFolderId?: string;
  recurrence?: any;
  startDateTime?: {
    dateTime: string;
    timeZone: string;
  };
  // Additional properties for metadata integration
  isStarred?: boolean;
  priority?: 'low' | 'normal' | 'high';
  tags?: string[];
}

export interface UnifiedTask {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'completed';
  dueDate?: string;
  completedDate?: string;
  createdDate: string;
  updatedDate: string;
  provider: 'google' | 'microsoft';
  providerId: string;
  listId: string;
  listName: string;
  isStarred?: boolean;
  priority?: 'low' | 'normal' | 'high';
  hasAttachments?: boolean;
  originalTask: GoogleTask | MicrosoftTask;
}

export interface UnifiedTaskList {
  id: string;
  name: string;
  provider: 'google' | 'microsoft';
  providerId: string;
  isDefault?: boolean;
  isSystem?: boolean;
  isStarred?: boolean;
  canEdit: boolean;
  canDelete: boolean;
  taskCount?: number;
  originalList: GoogleTaskList | MicrosoftTaskList;
}

export interface TaskFilters {
  status?: 'all' | 'pending' | 'completed';
  provider?: 'all' | 'google' | 'microsoft';
  listId?: string;
  isStarred?: boolean;
  hasAttachments?: boolean;
  priority?: 'all' | 'low' | 'normal' | 'high';
  dateRange?: {
    start: string;
    end: string;
  };
  searchQuery?: string;
}

export interface LoadingState {
  accounts: boolean;
  lists: boolean;
  tasks: boolean;
  creating: boolean;
  updating: boolean;
  deleting: boolean;
}

export interface ErrorState {
  accounts?: string;
  lists?: string;
  tasks?: string;
  operation?: string;
  general?: string;
}

export interface TodoInitializationData {
  providers: TodoProvider[];
  lists: UnifiedTaskList[];
  tasks: UnifiedTask[];
  errors: ErrorState;
}

export interface TaskCreateRequest {
  title: string;
  description?: string;
  dueDate?: string;
  priority?: 'low' | 'normal' | 'high';
  listId: string;
  provider: 'google' | 'microsoft';
}

export interface TaskUpdateRequest {
  id: string;
  title?: string;
  description?: string;
  dueDate?: string;
  priority?: 'low' | 'normal' | 'high';
  status?: 'pending' | 'completed';
  listId?: string;
  provider: 'google' | 'microsoft';
  isStarred?: boolean;
}

export interface ListCreateRequest {
  name: string;
  provider: 'google' | 'microsoft';
}

export interface ListUpdateRequest {
  id: string;
  name: string;
  provider: 'google' | 'microsoft';
}

export interface SyncProgress {
  phase: 'accounts' | 'lists' | 'tasks' | 'complete';
  progress: number; // 0-100
  message: string;
  errors?: string[];
}

export interface TodoOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  provider?: 'google' | 'microsoft';
}

export interface BatchOperationResult<T = any> {
  success: boolean;
  results: TodoOperationResult<T>[];
  errors: string[];
  totalItems: number;
  successfulItems: number;
}

export interface TodoProviderConfig {
  google: {
    baseUrl: string;
    scopes: string[];
    apiVersion: string;
  };
  microsoft: {
    baseUrl: string;
    scopes: string[];
    apiVersion: string;
  };
}

export interface TodoCache {
  providers: Map<string, TodoProvider>;
  lists: Map<string, UnifiedTaskList>;
  tasks: Map<string, UnifiedTask>;
  lastSync: Map<string, number>;
  etags: Map<string, string>;
}

export interface TodoSyncOptions {
  forceRefresh?: boolean;
  includeCompleted?: boolean;
  batchSize?: number;
  timeout?: number;
}

export interface TodoMetrics {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  tasksByProvider: Record<string, number>;
  tasksByList: Record<string, number>;
  lastSyncTime: number;
  syncDuration: number;
}