export function EmailPanel() {
  return (
    <div className="flex-1 p-6 bg-background overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Email</h1>
        
        <div className="bg-background rounded-lg p-8 text-center">
          <div className="text-6xl mb-4">📧</div>
          <h2 className="text-xl font-semibold text-white mb-2">Email Integration Coming Soon</h2>
          <p className="text-gray-400 mb-6">
            Access and manage your Microsoft 365 and Google Workspace emails with AI assistance.
          </p>
          <div className="space-x-4">
            <button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
              Connect Outlook
            </button>
            <button className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors">
              Connect Gmail
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}