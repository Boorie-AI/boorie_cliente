import { useState, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Folder, FolderOpen, Upload, CheckSquare, Square, ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'

interface BulkUploadDialogProps {
  open: boolean
  onClose: () => void
  onUploadComplete?: () => void
}

interface FolderNode {
  path: string
  name: string
  children: FolderNode[]
  files: string[]
  selected: boolean
  expanded: boolean
}

const CATEGORIES = [
  { id: 'hydraulics', label: 'Hidráulica General' },
  { id: 'regulations', label: 'Normativas y Regulaciones' },
  { id: 'best-practices', label: 'Mejores Prácticas' },
  { id: 'fuentes-hidrologia', label: 'Fuentes e Hidrología' },
  { id: 'obras-toma', label: 'Obras de Toma' },
  { id: 'hidraulica-aducciones', label: 'Hidráulica y Aducciones' },
  { id: 'potabilizacion', label: 'Potabilización' },
  { id: 'almacenamiento', label: 'Almacenamiento' },
  { id: 'bombeo', label: 'Bombeo' },
  { id: 'redes-distribucion', label: 'Redes de Distribución' },
  { id: 'aguas-servidas', label: 'Aguas Servidas' },
  { id: 'tratamiento', label: 'Tratamiento' },
  { id: 'cadena-valor', label: 'Cadena de Valor' }
]

export function BulkUploadDialog({ open, onClose, onUploadComplete }: BulkUploadDialogProps) {
  const [folderStructure, setFolderStructure] = useState<FolderNode | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [uploadMode, setUploadMode] = useState<'folder' | 'recursive'>('recursive')
  const [primaryCategory, setPrimaryCategory] = useState<string>('hydraulics')
  const [secondaryCategories, setSecondaryCategories] = useState<string[]>([])

  const handleSelectFolder = async () => {
    try {
      const result = await window.electronAPI.wisdom.selectFolder()

      if (result.success && result.folderPath) {
        // Get folder structure
        const structure = await window.electronAPI.wisdom.getFolderStructure(result.folderPath)

        if (structure.success && structure.data) {
          // Auto-expand folders that contain files or have children with files
          const autoExpandFolders = (node: FolderNode): boolean => {
            if (!node) return false

            let hasFiles = (node.files && node.files.length > 0) || false

            if (node.children && node.children.length > 0) {
              for (const child of node.children) {
                const childHasFiles = autoExpandFolders(child)
                if (childHasFiles) {
                  hasFiles = true
                  if (child) {
                    child.expanded = true
                  }
                }
              }
            }

            return hasFiles
          }

          const rootNode = structure.data
          if (rootNode) {
            autoExpandFolders(rootNode)
            rootNode.expanded = true // Always expand root
            setFolderStructure(rootNode)
          } else {
            console.error('Root node is null or undefined')
            alert('Error: estructura de carpetas inválida')
          }
        } else {
          alert('Error al leer la estructura de carpetas: ' + (structure.message || 'Unknown error'))
        }
      }
    } catch (error) {
      console.error('Error selecting folder:', error)
      alert('Error al seleccionar carpeta')
    }
  }

  const toggleNodeSelection = (node: FolderNode, selected: boolean) => {
    if (!node) return

    node.selected = selected

    // If recursive mode, toggle all children
    if (uploadMode === 'recursive' && selected && node.children) {
      const toggleChildren = (n: FolderNode) => {
        if (!n) return
        n.selected = selected
        if (n.children) {
          n.children.forEach(child => toggleChildren(child))
        }
      }
      node.children.forEach(child => toggleChildren(child))
    }

    setFolderStructure({ ...folderStructure! })
  }

  const toggleNodeExpanded = (node: FolderNode) => {
    if (!node) return
    node.expanded = !node.expanded
    setFolderStructure({ ...folderStructure! })
  }

  const getSelectedFiles = useCallback(() => {
    const files: string[] = []

    const collectFiles = (node: FolderNode) => {
      if (!node) return

      if (node.selected) {
        // Add files from this node
        if (node.files && node.files.length > 0) {
          files.push(...node.files)
        }

        // If recursive mode, also collect from children
        if (uploadMode === 'recursive' && node.children) {
          node.children.forEach(child => collectFiles(child))
        }
      } else if (uploadMode === 'recursive' && node.children) {
        // Even if this node isn't selected, check children in recursive mode
        node.children.forEach(child => collectFiles(child))
      }
    }

    if (folderStructure) {
      collectFiles(folderStructure)
    }

    return files
  }, [folderStructure, uploadMode])

  const handleUpload = async () => {
    const files = getSelectedFiles()
    console.log('📁 Selected files for upload:', files)

    if (files.length === 0) {
      alert('No hay archivos seleccionados para subir')
      return
    }

    setIsUploading(true)
    setUploadProgress({ current: 0, total: files.length })

    try {
      // Listen to progress events
      const unsubscribe = window.electronAPI.wisdom.onUploadProgress((data: { current: number; total: number; message: string; filename: string }) => {
        setUploadProgress({
          current: data.current,
          total: data.total
        })
      })

      console.log('🔄 Starting bulk upload with mode:', uploadMode)

      const result = await window.electronAPI.wisdom.bulkUploadDocuments({
        files,
        mode: uploadMode,
        category: primaryCategory,
        secondaryCategories,
        language: 'es'
      })

      console.log('📈 Upload result:', result)

      // Cleanup listener
      unsubscribe()

      if (result.success) {
        let message = `${result.processed || 0} documentos procesados exitosamente`
        if (result.errors && result.errors > 0) {
          message += `, ${result.errors} errores`
        }
        alert(message)
        onUploadComplete?.()
        onClose()
      } else {
        alert(result.error || result.message || 'Error al procesar documentos')
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert('Error al subir documentos')
    } finally {
      setIsUploading(false)
    }
  }

  const renderFolderNode = (node: FolderNode, level: number = 0) => {
    if (!node) return null

    const hasChildren = node.children && node.children.length > 0
    const fileCount = node.files ? node.files.length : 0

    // Calculate total files recursively for better display
    const getTotalFiles = (n: FolderNode): number => {
      if (!n) return 0
      let total = n.files ? n.files.length : 0
      if (n.children) {
        n.children.forEach(child => {
          total += getTotalFiles(child)
        })
      }
      return total
    }

    const totalFiles = getTotalFiles(node)

    return (
      <div key={node.path} className="select-none">
        <div
          className={cn(
            "flex items-center py-1 px-2 hover:bg-accent rounded cursor-pointer transition-colors",
            node.selected && "bg-primary/10 border-l-2 border-primary"
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {/* Expand/collapse button */}
          {hasChildren ? (
            <button
              onClick={() => toggleNodeExpanded(node)}
              className="p-0.5 hover:bg-accent rounded mr-1 transition-colors"
            >
              {node.expanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          ) : (
            <div className="w-5 h-5 mr-1" /> // Spacer for alignment
          )}

          {/* Selection checkbox */}
          <button
            onClick={() => toggleNodeSelection(node, !node.selected)}
            className="p-0.5 mr-2 hover:bg-accent rounded transition-colors"
          >
            {node.selected ? (
              <CheckSquare className="w-4 h-4 text-primary" />
            ) : (
              <Square className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            )}
          </button>

          {/* Folder icon */}
          {hasChildren ? (
            node.expanded ? (
              <FolderOpen className="w-4 h-4 mr-2 text-blue-500" />
            ) : (
              <Folder className="w-4 h-4 mr-2 text-blue-500" />
            )
          ) : (
            <div className="w-4 h-4 mr-2" /> // Spacer for files-only folders
          )}

          {/* Folder/file name */}
          <span className="text-sm flex-1 truncate" title={node.name}>
            {node.name}
          </span>

          {/* File count indicators */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground ml-2">
            {fileCount > 0 && (
              <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                {fileCount} {fileCount === 1 ? 'archivo' : 'archivos'}
              </span>
            )}
            {hasChildren && totalFiles > fileCount && (
              <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                +{totalFiles - fileCount} en subcarpetas
              </span>
            )}
          </div>
        </div>

        {/* Render children if expanded */}
        {node.expanded && hasChildren && node.children && (
          <div>
            {node.children.map(child => renderFolderNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-lg shadow-lg z-50 w-[600px] max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div>
              <Dialog.Title className="text-lg font-semibold">
                Subir Documentos en Lote
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground mt-1">
                Selecciona una carpeta y elige qué archivos subir al sistema RAG
              </Dialog.Description>
            </div>
            <Dialog.Close className="p-2 hover:bg-accent rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          <div className="flex-1 p-6 overflow-y-auto">
            {/* Upload Mode Selection */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-2 block">
                Modo de carga:
              </label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="uploadMode"
                    value="folder"
                    checked={uploadMode === 'folder'}
                    onChange={(e) => setUploadMode(e.target.value as 'folder' | 'recursive')}
                    className="mr-2"
                  />
                  <span className="text-sm">Solo carpeta seleccionada</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="uploadMode"
                    value="recursive"
                    checked={uploadMode === 'recursive'}
                    onChange={(e) => setUploadMode(e.target.value as 'folder' | 'recursive')}
                    className="mr-2"
                  />
                  <span className="text-sm">Carpeta y subcarpetas</span>
                </label>
              </div>
            </div>

            {/* Category Selection */}
            <div className="mb-6 space-y-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Categoría Principal:</label>
                <select
                  value={primaryCategory}
                  onChange={(e) => {
                    setPrimaryCategory(e.target.value)
                    setSecondaryCategories(prev => prev.filter(c => c !== e.target.value))
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Categorías Secundarias (Tags Semánticos):</label>
                <div className="grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto border border-border rounded p-2 bg-card/50">
                  {CATEGORIES.filter(c => c.id !== primaryCategory).map(cat => (
                    <label key={cat.id} className="flex items-center hover:bg-accent/50 p-1 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={secondaryCategories.includes(cat.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSecondaryCategories(prev => [...prev, cat.id])
                          } else {
                            setSecondaryCategories(prev => prev.filter(c => c !== cat.id))
                          }
                        }}
                        className="mr-2 rounded border-border"
                      />
                      <span className="text-xs">{cat.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Folder Selection */}
            {!folderStructure ? (
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <Folder className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  Selecciona una carpeta con documentos hidráulicos
                </p>
                <button
                  onClick={handleSelectFolder}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                >
                  Seleccionar Carpeta
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium">
                    Estructura de carpetas
                  </h3>
                  <button
                    onClick={handleSelectFolder}
                    className="text-sm text-primary hover:underline"
                  >
                    Cambiar carpeta
                  </button>
                </div>

                <div className="border border-border rounded-lg p-2 max-h-[300px] overflow-y-auto">
                  {renderFolderNode(folderStructure)}
                </div>

                <div className="mt-4 text-sm text-muted-foreground">
                  Archivos seleccionados: {getSelectedFiles().length}
                </div>
              </div>
            )}

            {/* Upload Progress */}
            {isUploading && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span>Procesando documentos...</span>
                  <span>{uploadProgress.current} / {uploadProgress.total}</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${(uploadProgress.current / uploadProgress.total) * 100}%`
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
            <button
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 text-sm hover:bg-accent rounded transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleUpload}
              disabled={!folderStructure || getSelectedFiles().length === 0 || isUploading}
              className={cn(
                "px-4 py-2 text-sm rounded transition-colors flex items-center gap-2",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <Upload className="w-4 h-4" />
              {isUploading ? 'Subiendo...' : 'Subir Documentos'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}