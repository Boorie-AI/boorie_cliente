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
        {/* Circular Progress Bar */}
        <div className="relative w-20 h-20 mb-6 mx-auto">
          {/* Background Circle */}
          <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 80 80">
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              className="text-muted-foreground/20"
            />
            {/* Progress Circle */}
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={226.19} // 2 * π * 36
              strokeDashoffset={226.19 - (226.19 * (isNaN(progress) ? 0 : progress)) / 100}
              className="transition-all duration-500 ease-out stroke-primary"
            />
          </svg>
          
          {/* Progress Text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-semibold text-foreground">
              {Math.round(isNaN(progress) ? 0 : progress)}%
            </span>
          </div>
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