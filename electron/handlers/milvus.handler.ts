import { ipcMain } from 'electron';
import { MilvusService } from '../../backend/services/milvus.service';

export function registerMilvusHandlers() {
    console.log('[Milvus Handler] Registering handlers...');

    const milvusService = MilvusService.getInstance();

    ipcMain.handle('milvus:listCollections', async () => {
        try {
            const response = await milvusService.listCollections();
            // Depending on SDK version, listCollections might return an object with data or just the array/object.
            // Zilliz Node SDK typically returns { status: ..., data: [...] } or { collection_names: [...] }
            // Let's assume standard response and pass it back.
            return { success: true, data: response };
        } catch (error: any) {
            console.error('List collections error:', error);
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle('milvus:getCollectionStatistics', async (event, collectionName) => {
        try {
            const stats = await milvusService.getCollectionStatistics(collectionName);
            return { success: true, stats };
        } catch (error: any) {
            console.error('Get stats error:', error);
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle('milvus:describeCollection', async (event, collectionName) => {
        try {
            const description = await milvusService.describeCollection(collectionName);
            return { success: true, description };
        } catch (error: any) {
            console.error('Describe error:', error);
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle('milvus:inspect', async (event, { collectionName, limit, offset, filter }) => {
        try {
            const results = await milvusService.query(collectionName, filter, ['*'], limit, offset);
            return { success: true, results };
        } catch (error: any) {
            console.error('Inspect error:', error);
            return { success: false, message: error.message };
        }
    });
}
