import { useTranslation } from 'react-i18next'
import React, { useState } from 'react';
import { Project } from '../../types/project';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FolderPlus, FolderOpen, Trash2, Calendar, Database, MessageSquare, Activity, Download, Upload, ArrowUpDown } from 'lucide-react';

interface ProjectDashboardProps {
    projects: Project[];
    onSelectProject: (project: Project) => void;
    /**
     * Abrir de verdad: seleccionar el proyecto y entrar en él. Pinchar la tarjeta
     * sólo selecciona —así se decidió en #35, la raíz siempre enseña la lista—,
     * pero el botón «Abrir» prometía navegar y no lo hacía: no tenía onClick, y
     * el clic acababa en el de la tarjeta.
     */
    onOpenProject: (project: Project) => void;
    onCreateProject: (name: string, description: string) => void;
    /**
     * Importar un .inp: crea el proyecto, carga la red y entra en el visor. Vive
     * fuera porque quien sabe cargar una red es la vista de red (#77).
     */
    onImportNetwork: () => void;
    onDeleteProject: (projectId: string) => void;
    /** Marca cuál es el proyecto activo cuando la lista se ve desde la raíz (#35). */
    activeProjectId?: string | null;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
    projects,
    onSelectProject,
    onOpenProject,
    onCreateProject,
    onImportNetwork,
    onDeleteProject,
    activeProjectId
}) => {
    const { t } = useTranslation()
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

    /**
     * Sólo proyectos. Las redes van por `onImportNetwork`: aquí no se puede leer
     * un .inp —el renderer no tiene acceso a disco— y lo que había era un aviso
     * que creaba el proyecto vacío y mandaba al usuario a elegir otra vez el
     * mismo fichero desde dentro (#77).
     */
    const handleImportProject = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e: any) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const imported = JSON.parse(event.target?.result as string);
                    if (!imported.name) {
                        alert(t('messages.importNotProject'));
                        return;
                    }
                    onCreateProject(`${imported.name} (Importado)`, imported.description || '');
                } catch {
                    alert(t('messages.importBadJson'));
                }
            };
            reader.readAsText(file);
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
                        <h1 className="text-3xl font-bold text-white mb-2">{t('projects.myProjects')}</h1>
                        <p className="text-slate-400">
                            {t('projects.manageHint')}
                            <span className="ml-2 text-blue-400 font-semibold">{t('projects.count', { count: projects.length })}</span>
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={onImportNetwork}
                            className="gap-2 bg-slate-800 hover:bg-slate-700 border-slate-700"
                            title={t('projects.importNetworkHint')}
                        >
                            <Upload className="h-4 w-4" />
                            {t('projects.importNetwork')}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={handleImportProject}
                            className="gap-2 bg-slate-800 hover:bg-slate-700 border-slate-700"
                            title={t('projects.importProjectHint')}
                        >
                            <Upload className="h-4 w-4" />
                            {t('projects.importProject')}
                        </Button>
                        <Button
                            onClick={() => setSortBy(sortBy === 'name' ? 'date' : 'name')}
                            variant="outline"
                            className="gap-2 bg-slate-800 hover:bg-slate-700 border-slate-700"
                        >
                            <ArrowUpDown className="h-4 w-4" />
                            {sortBy === 'name' ? t('projects.byDate') : t('projects.byName')}
                        </Button>
                        <Button onClick={() => setIsCreating(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
                            <FolderPlus className="h-5 w-5" />
                            {t('projects.newProject')}
                        </Button>
                    </div>
                </div>

                {/* Creation Form */}
                {isCreating && (
                    <Card className="bg-slate-800 border-slate-700 animate-in fade-in slide-in-from-top-4">
                        <CardHeader>
                            <CardTitle className="text-white">{t('projects.newProjectTitle')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-300">{t('projects.name')}</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder={t('projects.nameExample')}
                                    autoFocus
                                />
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-300">{t('projects.description')}</label>
                                <textarea
                                    value={newDesc}
                                    onChange={(e) => setNewDesc(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder={t('projects.descriptionHint')}
                                    rows={3}
                                />
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end gap-2">
                            <Button variant="ghost" onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-white">
                                {t('projects.cancel')}
                            </Button>
                            <Button onClick={handleCreate} disabled={!newName.trim()} className="bg-blue-600 hover:bg-blue-700">
                                {t('projects.createProject')}
                            </Button>
                        </CardFooter>
                    </Card>
                )}

                {/* Projects Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedProjects.length === 0 && !isCreating ? (
                        <div className="col-span-full text-center py-20 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                            <FolderOpen className="h-16 w-16 mx-auto mb-4 opacity-50" />
                            <p className="text-xl font-medium">{t('projects.noProjects')}</p>
                            <p className="text-sm mt-2">{t('projects.createToStart')}</p>
                        </div>
                    ) : (
                        sortedProjects.map(project => (
                            <Card
                                key={project.id}
                                className={`bg-slate-800 transition-all cursor-pointer group flex flex-col ${project.id === activeProjectId
                                    ? 'border-blue-500 ring-1 ring-blue-500/40'
                                    : 'border-slate-700 hover:border-blue-500'
                                    }`}
                                onClick={() => onSelectProject(project)}
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex justify-between items-start">
                                        <CardTitle className="text-white text-xl group-hover:text-blue-400 transition-colors">
                                            {project.name}
                                            {project.id === activeProjectId && (
                                                <span className="ml-2 align-middle rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">
                                                    {t('projects.active')}
                                                </span>
                                            )}
                                        </CardTitle>
                                        <div className="flex gap-1 -mr-2 -mt-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-500 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={(e) => handleExportProject(project, e)}
                                                title={t('projects.exportProject')}
                                            >
                                                <Download className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(t('messages.confirmDeleteProject'))) onDeleteProject(project.id);
                                                }}
                                                title={t('projects.deleteProject')}
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
                                            <div className="text-lg font-bold text-white">{project.networkCount}</div>
                                            <div className="text-[10px] uppercase tracking-wider text-slate-500">{t('projects.networks')}</div>
                                        </div>
                                        <div className="text-center border-l border-slate-700/50">
                                            <div className="flex justify-center mb-1 text-green-400"><Activity className="h-4 w-4" /></div>
                                            <div className="text-lg font-bold text-white">{project.calculationCount}</div>
                                            <div className="text-[10px] uppercase tracking-wider text-slate-500">{t('projects.sims')}</div>
                                        </div>
                                        <div className="text-center border-l border-slate-700/50">
                                            <div className="flex justify-center mb-1 text-purple-400"><MessageSquare className="h-4 w-4" /></div>
                                            <div className="text-lg font-bold text-white">{project.chatCount}</div>
                                            <div className="text-[10px] uppercase tracking-wider text-slate-500">{t('projects.chats')}</div>
                                        </div>
                                    </div>
                                </CardContent>

                                <CardFooter className="pt-3 text-xs text-slate-500 flex justify-between items-center">
                                    <div className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        <span>{t('projects.modified', { fecha: new Date(project.lastModified).toLocaleDateString() })}</span>
                                    </div>
                                    <Button
                                        variant="link"
                                        className="text-blue-400 p-0 h-auto text-xs hover:text-blue-300"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenProject(project);
                                        }}
                                    >
                                        {t('projects.open')}
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
