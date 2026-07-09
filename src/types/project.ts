export interface NetworkAsset {
    id: string;
    name: string; // e.g., "Magnetic Island.inp"
    filePath?: string; // Absolute path to the .inp file on disk
    uploadDate: string;
    nodeCount: number;
    linkCount: number;
    data: any; // The full INP data (or reference to it)
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
    networks: NetworkAsset[];
    calculations: CalculationAsset[];
    chatCount: number;
}
