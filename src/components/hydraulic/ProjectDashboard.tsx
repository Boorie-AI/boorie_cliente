import React, { useState } from 'react';
import { Project } from '../../types/project';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FolderPlus, FolderOpen, Trash2, Calendar, Database, MessageSquare, Activity, Download, Upload, ArrowUpDown } from 'lucide-react';

interface ProjectDashboardProps {
    projects: Project[];
    onSelectProject: (project: Project) => void;
    onCreateProject: (name: string, description: string) => void;
    onDeleteProject: (projectId: string) => void;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
    projects,
    onSelectProject,
    onCreateProject,
    onDeleteProject
}) => {
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'date'>('date');

    const handleCreate = () => {
        if (newName.trim()) {
            onCreateProject(newName, newDesc);
            setNewName('');
            setNewDesc('');
            setIsCreating(false);
        }
    };

    const handleExportProject = (project: Project, e: React.MouseEvent) => {
        e.stopPropagation();
        const dataStr = JSON.stringify(project, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const exportFileDefaultName = `${project.name.replace(/\s+/g, '_')}_${Date.now()}.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    };

    const handleImportProject = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e: any) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const imported = JSON.parse(event.target?.result as string);
                        onCreateProject(`${imported.name} (Importado)`, imported.description || '');
                    } catch (err) {
                        alert('Error al importar proyecto: archivo inválido');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    };

    const sortedProjects = [...projects].sort((a, b) => {
        if (sortBy === 'name') {
            return a.name.localeCompare(b.name);
        }
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
    });

    return (
        <div className="p-8 h-full bg-slate-900 overflow-y-auto">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Mis Proyectos</h1>
                        <p className="text-slate-400">
                            Gestiona tus redes, simulaciones y análisis.
                            <span className="ml-2 text-blue-400 font-semibold">{projects.length} proyecto{projects.length !== 1 ? 's' : ''}</span>
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={handleImportProject}
                            className="gap-2 bg-slate-800 hover:bg-slate-700 border-slate-700"
                        >
                            <Upload className="h-4 w-4" />
                            Importar
                        </Button>
                        <Button
                            onClick={() => setSortBy(sortBy === 'name' ? 'date' : 'name')}
                            variant="outline"
                            className="gap-2 bg-slate-800 hover:bg-slate-700 border-slate-700"
                        >
                            <ArrowUpDown className="h-4 w-4" />
                            {sortBy === 'name' ? 'Por Fecha' : 'Por Nombre'}
                        </Button>
                        <Button onClick={() => setIsCreating(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
                            <FolderPlus className="h-5 w-5" />
                            Nuevo Proyecto
                        </Button>
                    </div>
                </div>

                {/* Creation Form */}
                {isCreating && (
                    <Card className="bg-slate-800 border-slate-700 animate-in fade-in slide-in-from-top-4">
                        <CardHeader>
                            <CardTitle className="text-white">Crear Nuevo Proyecto</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-300">Nombre</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Ej: Red de Distribución Centro"
                                    autoFocus
                                />
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-300">Descripción</label>
                                <textarea
                                    value={newDesc}
                                    onChange={(e) => setNewDesc(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Descripción opcional del proyecto..."
                                    rows={3}
                                />
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end gap-2">
                            <Button variant="ghost" onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-white">
                                Cancelar
                            </Button>
                            <Button onClick={handleCreate} disabled={!newName.trim()} className="bg-blue-600 hover:bg-blue-700">
                                Crear Proyecto
                            </Button>
                        </CardFooter>
                    </Card>
                )}

                {/* Projects Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedProjects.length === 0 && !isCreating ? (
                        <div className="col-span-full text-center py-20 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                            <FolderOpen className="h-16 w-16 mx-auto mb-4 opacity-50" />
                            <p className="text-xl font-medium">No hay proyectos todavía</p>
                            <p className="text-sm mt-2">Crea uno nuevo para empezar a trabajar</p>
                        </div>
                    ) : (
                        sortedProjects.map(project => (
                            <Card
                                key={project.id}
                                className="bg-slate-800 border-slate-700 hover:border-blue-500 transition-all cursor-pointer group flex flex-col"
                                onClick={() => onSelectProject(project)}
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex justify-between items-start">
                                        <CardTitle className="text-white text-xl group-hover:text-blue-400 transition-colors">
                                            {project.name}
                                        </CardTitle>
                                        <div className="flex gap-1 -mr-2 -mt-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-500 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={(e) => handleExportProject(project, e)}
                                                title="Exportar proyecto"
                                            >
                                                <Download className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm('¿Seguro que deseas eliminar este proyecto?')) onDeleteProject(project.id);
                                                }}
                                                title="Eliminar proyecto"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <CardDescription className="text-slate-400 line-clamp-2 h-10">
                                        {project.description || "Sin descripción"}
                                    </CardDescription>
                                </CardHeader>

                                <CardContent className="flex-grow">
                                    <div className="grid grid-cols-3 gap-2 py-4 border-y border-slate-700/50">
                                        <div className="text-center">
                                            <div className="flex justify-center mb-1 text-blue-400"><Database className="h-4 w-4" /></div>
                                            <div className="text-lg font-bold text-white">{project.networks.length}</div>
                                            <div className="text-[10px] uppercase tracking-wider text-slate-500">Redes</div>
                                        </div>
                                        <div className="text-center border-l border-slate-700/50">
                                            <div className="flex justify-center mb-1 text-green-400"><Activity className="h-4 w-4" /></div>
                                            <div className="text-lg font-bold text-white">{project.calculations.length}</div>
                                            <div className="text-[10px] uppercase tracking-wider text-slate-500">Sims</div>
                                        </div>
                                        <div className="text-center border-l border-slate-700/50">
                                            <div className="flex justify-center mb-1 text-purple-400"><MessageSquare className="h-4 w-4" /></div>
                                            <div className="text-lg font-bold text-white">{project.chats.length}</div>
                                            <div className="text-[10px] uppercase tracking-wider text-slate-500">Chats</div>
                                        </div>
                                    </div>
                                </CardContent>

                                <CardFooter className="pt-3 text-xs text-slate-500 flex justify-between items-center">
                                    <div className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        <span>Modificado: {new Date(project.lastModified).toLocaleDateString()}</span>
                                    </div>
                                    <Button variant="link" className="text-blue-400 p-0 h-auto text-xs hover:text-blue-300">
                                        Abrir &rarr;
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
