import { useState } from 'react'
import { FileUp } from 'lucide-react'

export function WNTRDebugViewer() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  
  const handleFileUpload = async () => {
    try {
      setLoading(true)
      setError(null)
      setResult(null)
      
      const response = await window.electronAPI.wntr.loadINPFile()
      console.log('WNTR Response:', response)
      
      // Guardar el resultado completo para inspección
      setResult(response)
      
      if (!response.success) {
        setError(response.error || 'Failed to load file')
      }
    } catch (err) {
      console.error('Error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">WNTR Debug Viewer</h1>
      
      <button
        onClick={handleFileUpload}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
      >
        <FileUp className="w-4 h-4" />
        {loading ? 'Loading...' : 'Load INP File'}
      </button>
      
      {error && (
        <div className="mt-4 p-4 bg-red-100 border border-red-300 rounded">
          <h3 className="font-bold text-red-700">Error:</h3>
          <p className="text-red-600">{error}</p>
        </div>
      )}
      
      {result && (
        <div className="mt-4">
          <h3 className="font-bold mb-2">Response from WNTR:</h3>
          <div className="bg-gray-100 p-4 rounded overflow-auto max-h-96">
            <pre className="text-xs">{JSON.stringify(result, null, 2)}</pre>
          </div>
          
          {result.success && result.data && (
            <div className="mt-4">
              <h4 className="font-bold">Parsed Data:</h4>
              <p>Nodes: {result.data.nodes?.length || 0}</p>
              <p>Links: {result.data.links?.length || 0}</p>
              <p>Coordinate System: {result.data.coordinate_system?.type || 'unknown'}</p>
              {result.data.coordinate_system?.bounds && (
                <div className="mt-2">
                  <p>Bounds:</p>
                  <p className="ml-4">X: {result.data.coordinate_system.bounds.minX} - {result.data.coordinate_system.bounds.maxX}</p>
                  <p className="ml-4">Y: {result.data.coordinate_system.bounds.minY} - {result.data.coordinate_system.bounds.maxY}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}