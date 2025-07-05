import { useTranslation } from 'react-i18next'

export function TodoPanel() {
  const { t } = useTranslation()

  return (
    <div className="flex-1 p-6 bg-background overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">{t('rag.title')}</h1>
        
        <div className="bg-background rounded-lg p-8 text-center">
          <div className="text-6xl mb-4">📄</div>
          <h2 className="text-xl font-semibold text-white mb-2">{t('rag.comingSoon')}</h2>
          <p className="text-gray-400 mb-6">
            {t('rag.comingSoonDesc')}
          </p>
          <button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
            {t('rag.uploadDocuments')}
          </button>
        </div>
      </div>
    </div>
  )
}