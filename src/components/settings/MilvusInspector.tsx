import { useState, useEffect } from 'react'
import { cn } from '@/utils/cn'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Database, Table, Eye, Activity } from 'lucide-react'
import { ScrollArea } from "@/components/ui/scroll-area"

interface CollectionStats {
    row_count: number
}

interface CollectionDescription {
    schema: {
        fields: Array<{
            name: string
            data_type: string
            is_primary_key?: boolean
            description?: string
            dim?: number
        }>
        description?: string
    }
}

export function MilvusInspector() {
    const [collections, setCollections] = useState<string[]>([])
    const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
    const [stats, setStats] = useState<CollectionStats | null>(null)
    const [description, setDescription] = useState<CollectionDescription | null>(null)
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [inspectLoading, setInspectLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchCollections = async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await window.electronAPI.milvus.listCollections()
            if (result.success) {
                // Handle different SDK response shapes
                const list = result.data.collection_names || result.data.data || result.data || []
                setCollections(Array.isArray(list) ? list : [])
            } else {
                setError(result.message)
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const fetchDetails = async (name: string) => {
        setInspectLoading(true)
        setStats(null)
        setDescription(null)
        setData([])

        try {
            const [statsRes, descRes] = await Promise.all([
                window.electronAPI.milvus.getCollectionStatistics(name),
                window.electronAPI.milvus.describeCollection(name)
            ])

            if (statsRes.success) setStats(statsRes.stats)
            if (descRes.success) setDescription(descRes.description)

            // Auto-inspect first 50 rows
            const dataRes = await window.electronAPI.milvus.inspect({
                collectionName: name,
                limit: 50,
                offset: 0
            })

            if (dataRes.success && dataRes.results && dataRes.results.data) {
                setData(dataRes.results.data)
            } else if (dataRes.success && Array.isArray(dataRes.results)) {
                setData(dataRes.results)
            }

        } catch (err: any) {
            console.error(err)
            setError(`Error fetching details: ${err.message}`)
        } finally {
            setInspectLoading(false)
        }
    }

    useEffect(() => {
        fetchCollections()
    }, [])

    useEffect(() => {
        if (selectedCollection) {
            fetchDetails(selectedCollection)
        }
    }, [selectedCollection])
    const [ragQuery, setRagQuery] = useState('')
    const [ragResult, setRagResult] = useState<any>(null)
    const [ragLoading, setRagLoading] = useState(false)
    const [activeTab, setActiveTab] = useState<'inspector' | 'rag'>('inspector')

    const handleRagQuery = async () => {
        if (!ragQuery.trim()) return
        setRagLoading(true)
        setRagResult(null)
        try {
            const result = await window.electronAPI.agenticRAG.query(ragQuery, {
                technicalLevel: 'intermediate',
                searchTopK: 5
            })
            if (result.success) {
                setRagResult(result.data)
            } else {
                setError(result.error || 'Unknown error')
            }
        } catch (err: any) {
            setError(`RAG Query failed: ${err.message}`)
        } finally {
            setRagLoading(false)
        }
    }

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="flex gap-2 border-b pb-2">
                <Button
                    variant={activeTab === 'inspector' ? "default" : "ghost"}
                    onClick={() => setActiveTab('inspector')}
                    size="sm"
                >
                    <Database className="w-4 h-4 mr-2" />
                    Inspector
                </Button>
                <Button
                    variant={activeTab === 'rag' ? "default" : "ghost"}
                    onClick={() => setActiveTab('rag')}
                    size="sm"
                >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    RAG Validation
                </Button>
            </div>

            {activeTab === 'inspector' ? (
                <div className="flex h-full gap-6 overflow-hidden">
                    {/* Sidebar: Collection List */}
                    <div className="w-64 bg-card rounded-lg border shadow-sm flex flex-col h-full">
                        <div className="p-4 border-b flex justify-between items-center bg-muted/30">
                            <h2 className="font-semibold flex items-center gap-2">
                                <Database className="h-4 w-4" />
                                Collections
                            </h2>
                            <Button variant="ghost" size="icon" onClick={fetchCollections} disabled={loading}>
                                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                            </Button>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-2 space-y-1">
                                {collections.length === 0 && !loading && (
                                    <p className="text-sm text-muted-foreground p-2">No collections found.</p>
                                )}
                                {collections.map(name => (
                                    <Button
                                        key={name}
                                        variant={selectedCollection === name ? "secondary" : "ghost"}
                                        className={cn("w-full justify-start text-sm", selectedCollection === name && "bg-accent")}
                                        onClick={() => setSelectedCollection(name)}
                                    >
                                        <Table className="h-3 w-3 mr-2" />
                                        {name}
                                    </Button>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Main Content: Details & Data */}
                    <div className="flex-1 flex flex-col gap-6 overflow-hidden h-full">
                        {selectedCollection ? (
                            <>
                                {/* Stats & Schema Cards */}
                                <div className="grid grid-cols-2 gap-4">
                                    <Card>
                                        <CardHeader className="py-3">
                                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                                <Activity className="h-4 w-4" /> Statistics
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="py-3">
                                            <div className="text-2xl font-bold">
                                                {stats?.row_count !== undefined ? stats.row_count.toLocaleString() : '-'}
                                            </div>
                                            <p className="text-xs text-muted-foreground">Total Rows</p>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader className="py-3">
                                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                                <Eye className="h-4 w-4" /> Schema
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="py-3 h-24 overflow-y-auto">
                                            <div className="flex flex-wrap gap-2">
                                                {description?.schema?.fields?.map(f => (
                                                    <Badge key={f.name} variant="outline" className="text-xs">
                                                        {f.name} ({f.data_type}) {f.dim ? `[${f.dim}]` : ''}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Data Table */}
                                <Card className="flex-1 flex flex-col min-h-0">
                                    <CardHeader className="py-3 border-b bg-muted/30">
                                        <div className="flex justify-between items-center">
                                            <CardTitle className="text-sm font-medium">Data Preview (Max 50)</CardTitle>
                                            <Badge>{data.length} records</Badge>
                                        </div>
                                    </CardHeader>
                                    <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 p-0">
                                        {inspectLoading ? (
                                            <div className="flex items-center justify-center h-full">
                                                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                                            </div>
                                        ) : data.length > 0 ? (
                                            <table className="w-full text-xs text-left border-collapse">
                                                <thead className="bg-muted sticky top-0 z-10">
                                                    <tr>
                                                        {Object.keys(data[0] || {}).map(key => (
                                                            <th key={key} className="p-2 font-medium border-b border-r last:border-r-0 whitespace-nowrap">
                                                                {key}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {data.map((row, i) => (
                                                        <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                                                            {Object.values(row).map((val: any, j) => (
                                                                <td key={j} className="p-2 border-r last:border-r-0 max-w-[200px] truncate">
                                                                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                                <p>No data found or empty collection</p>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                                <Database className="h-12 w-12 mb-4 opacity-20" />
                                <p>Select a collection to inspect</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col h-full gap-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>RAG Query Validator</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex gap-2">
                                <input
                                    className="flex-1 px-3 py-2 border rounded-md bg-transparent"
                                    placeholder="Enter your query related to stored documents..."
                                    value={ragQuery}
                                    onChange={(e) => setRagQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleRagQuery()}
                                />
                                <Button onClick={handleRagQuery} disabled={ragLoading}>
                                    {ragLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Search'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {ragResult && (
                        <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
                            {/* Answer Section */}
                            <Card className="flex flex-col overflow-hidden">
                                <CardHeader className="bg-muted/30 py-3">
                                    <CardTitle className="text-sm font-medium">Generated Answer</CardTitle>
                                </CardHeader>
                                <CardContent className="flex-1 overflow-auto p-4 text-sm leading-relaxed">
                                    <div className="whitespace-pre-wrap">{ragResult.answer}</div>
                                    <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                                        Confidence: {(ragResult.confidence * 100).toFixed(1)}% |
                                        Processing Time: {ragResult.metrics?.processingTime}ms
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Sources Section */}
                            <Card className="flex flex-col overflow-hidden">
                                <CardHeader className="bg-muted/30 py-3">
                                    <CardTitle className="text-sm font-medium">Retrieved Sources ({ragResult.sources?.length || 0})</CardTitle>
                                </CardHeader>
                                <CardContent className="flex-1 overflow-auto p-0">
                                    <div className="divide-y">
                                        {ragResult.sources?.map((source: any, idx: number) => (
                                            <div key={idx} className="p-3 hover:bg-muted/50 transition-colors">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="font-semibold text-xs text-primary truncate max-w-[200px]" title={source.title}>
                                                        {source.title}
                                                    </span>
                                                    <Badge variant="secondary" className="text-[10px]">
                                                        {Math.round(source.relevance * 100)}% Match
                                                    </Badge>
                                                </div>
                                                <p className="text-xs text-muted-foreground line-clamp-3 mb-1">
                                                    {source.content}
                                                </p>
                                                <div className="flex gap-2 text-[10px] text-muted-foreground">
                                                    <span>Page: {source.page || 'N/A'}</span>
                                                    <span>Cat: {source.category || 'N/A'}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="absolute bottom-4 right-4 bg-destructive text-destructive-foreground px-4 py-2 rounded shadow-lg animate-in slide-in-from-bottom">
                    {error}
                </div>
            )}
        </div>
    )
}
