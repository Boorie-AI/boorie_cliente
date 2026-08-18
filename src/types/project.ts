export interface NetworkAsset {
    id: string;
    name: string; // e.g., "Magnetic Island.inp"
    filePath?: string; // Absolute path to the .inp file on disk
    uploadDate: string;
    nodeCount: number;
    linkCount: number;
    /**
     * Datos completos de la red. Opcional: el listado que viene de la base de
     * datos solo trae metadatos, y los datos se piden al abrirla
     * (network-repo:load), en lugar de cargar todas las redes en memoria.
     */
    data?: any;
    /**
     * La red se guardo sin su .inp original (migrada desde una version anterior
     * cuyo fichero ya no estaba en disco). Se puede ver, pero no simular.
     */
    incomplete?: boolean;
    /** Red madre de la que deriva; ausente en las redes importadas. */
    parentId?: string;
    /** Etiqueta del escenario, p. ej. "esqueletizada 100 mm". */
    scenarioLabel?: string;
}

export interface CalculationAsset {
    id: string;
    name: string;
    date: string;
    status: 'completed' | 'failed' | 'running';
    networkId: string;
    results?: any;
}

export interface Project {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    lastModified: string;

    // Inventory. `networks`/`calculations` are a session-local overlay (see
    // WNTRMainInterface's projectAssets) — the project's identity itself
    // (id/name/description) is backed by HydraulicProject in the real DB, the
    // same catalog Chat's project selector reads, so a project created here
    // shows up there and vice versa. `chatCount` comes from the DB relation
    // (Conversation.projectId), replacing the old always-zero local `chats` array.
    /** Solo se rellena para el proyecto activo; el resto usa los contadores. */
    networks: NetworkAsset[];
    calculations: CalculationAsset[];
    /** Contadores de la base de datos, para las tarjetas del panel. */
    networkCount: number;
    calculationCount: number;
    chatCount: number;
}
