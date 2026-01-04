export interface NetworkAsset {
    id: string;
    name: string; // e.g., "Magnetic Island.inp"
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

export interface ChatSession {
    id: string;
    name: string;
    date: string;
    messages: any[]; // Or Message type
}

export interface Project {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    lastModified: string;

    // Inventory
    networks: NetworkAsset[];
    calculations: CalculationAsset[];
    chats: ChatSession[];
}
