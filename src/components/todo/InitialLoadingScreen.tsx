import React from 'react';
import { useTranslation } from 'react-i18next';
import { SyncProgress } from '../../../electron/services/todo/todo.types';

interface InitialLoadingScreenProps {
  progress: number;
  syncProgress?: SyncProgress | null;
}

const InitialLoadingScreen: React.FC<InitialLoadingScreenProps> = ({ 
  progress, 
  syncProgress 
}) => {
  const { t } = useTranslation();

  const getProgressMessage = () => {
    if (syncProgress) {
      switch (syncProgress.phase) {
        case 'accounts':
          return t('todo.loading.accounts', 'Loading accounts...');
        case 'lists':
          return t('todo.loading.lists', 'Loading lists...');
        case 'tasks':
          return t('todo.loading.tasks', 'Loading tasks...');
        case 'complete':
          return t('todo.loading.complete', 'Complete!');
        default:
          return syncProgress.message || t('todo.loading.title', 'Loading Todo...');
      }
    }
    return t('todo.loading.title', 'Loading Todo...');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
      <div className="text-center">
        {/* Simple Loading Spinner */}
        <div className="w-8 h-8 mb-6 mx-auto">
          <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-primary rounded-full animate-spin"></div>
        </div>

        {/* Loading Message */}
        <p className="text-foreground font-medium">
          {getProgressMessage()}
        </p>
      </div>
    </div>
  );
};

export default InitialLoadingScreen;