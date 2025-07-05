import React from 'react';
import { useTranslation } from 'react-i18next';
import { SyncProgress } from '../../../electron/services/todo/todo.types';

interface InitialLoadingScreenProps {
  progress: number;
  syncProgress?: SyncProgress | null;
}

const InitialLoadingScreen: React.FC<InitialLoadingScreenProps> = ({
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
      <div className="text-center">
        {/* Simple Loading Spinner */}
        <div className="w-8 h-8 mb-6 mx-auto">
          <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-primary rounded-full animate-spin"></div>
        </div>

        {/* Loading Message */}
        <p className="text-sm text-muted-foreground">
          {t('todo.loading.title')}
        </p>
      </div>
    </div>
  );
};

export default InitialLoadingScreen;