import { MilvusClient, DataType, ConsistencyLevelEnum } from '@zilliz/milvus2-sdk-node';
import path from 'path';
import fs from 'fs';
import { dimensionEsperada } from './modeloEmbeddings';

export interface FilaVectorial {
    id: string;
    vector: number[];
    content: string;
    metadata: Record<string, unknown>;
    timestamp: number;
}

/** De dónde saca la reconstrucción las filas: en orden de `id`, a partir de la última que vio. */
export interface FuenteDeReconstruccion {
    total(): Promise<number>;
    lote(despuesDe: string | null, cuantas: number): Promise<FilaVectorial[]>;
}

interface EstadoReconstruccion {
    ultimoId: string | null;
    // Las enviadas a la colección nueva, que es lo que se comprueba al final.
    hechas: number;
    // Las leídas, que es lo que ve quien espera: si los vectores son de otro modelo no se copia
    // ninguno, y un aviso que contara las enviadas se quedaba en 0 como si estuviera colgado.
    leidas?: number;
    completa?: boolean;
}

/**
 * Los campos por los que se filtra, sacados del JSON a columnas propias. Milvus Lite evalúa
 * `metadata["x"]` pasando el segmento entero —vectores incluidos— a objetos Python: con 298.072
 * fragmentos, cada búsqueda filtrada tardaba unos 150 s y llevaba el proceso a 11 GB.
 */
export const CAMPOS_FILTRABLES = ['category', 'projectId', 'region', 'language'] as const;

export function conCamposFiltrables<T extends { metadata?: Record<string, unknown> }>(fila: T) {
    const metadata = fila.metadata ?? {};
    const campos = Object.fromEntries(
        CAMPOS_FILTRABLES.map(c => [c, typeof metadata[c] === 'string' ? metadata[c] : ''])
    ) as Record<(typeof CAMPOS_FILTRABLES)[number], string>;
    return { ...fila, ...campos };
}

export class MilvusService {
    private static instance: MilvusService;
    private client: MilvusClient;
    private connected: boolean = false;
    private connectionAttempted: boolean = false;
    private unavailable: boolean = false;
    private unavailableSince: number = 0;
    // Milvus Lite can take a few seconds to come up after Electron spawns it
    // (see electron/services/milvusProcess.ts); caching "unavailable" forever
    // after one early failed attempt made RAG permanently unusable for the
    // rest of the session even once the server became reachable (issue #19/#21).
    private static readonly RETRY_INTERVAL_MS = 20_000;

    /**
     * Plazo para abrir y cargar una colección, en lugar de los 15 s del SDK.
     *
     * La primera petición que toca una colección tras arrancar Milvus Lite la abre de disco: con
     * la base de un usuario real reindexada —298.072 fragmentos, 2,2 GB— son 11 s con la máquina
     * libre, y con Electron, Vite y Ollama arrancando a la vez pasa de los 15. El `hasCollection`
     * expiraba, la conexión se daba por fallida antes de cargar nada, y cada búsqueda del resto
     * de la sesión recibía «state 'released'» y devolvía cero fuentes.
     */
    private static readonly PLAZO_COLECCION_MS = 180_000;

    private static readonly LOTE_RECONSTRUCCION = 500;
    // Sin volcar, Milvus Lite acumula la memtable y el volcado grande llegó a un pico de 4,2 GB.
    private static readonly VOLCADO_CADA = 20_000;

    // Collection Names — Milvus Lite embebido es la BD vectorial única
    // para RAG, memoria de agentes, conversaciones y guardrails.
    public static COLLECTIONS = {
        KNOWLEDGE: 'hydraulic_knowledge',
        CONVERSATIONS: 'conversations',
        AGENT_MEMORY: 'agent_memory',
        GUARDRAIL_VIOLATIONS: 'guardrail_violations_vec',
    };

    private constructor() {
        // Read the effective port chosen by scripts/start_milvus.py.
        // The file lives in data/boorie-milvus/port and is rewritten on
        // each cold start. Falls back to 19530 if not present.
        const address = MilvusService.resolveAddress();
        console.log('[MilvusService] Connecting to Milvus Lite at', address);
        this.client = MilvusService.createClient(address);
    }

    /**
     * Crea el cliente y **recoge su promesa de conexión**. El SDK arranca la
     * conexión dentro del constructor y expone `connectPromise`; si el servidor
     * no está escuchando, esa promesa se rechaza sin dueño y aparece como
     * "Unhandled promise rejection" (cuatro por arranque en los logs, que
     * despistaron al diagnosticar un caso real) o mata el proceso si se usa
     * este servicio fuera de Electron. El fallo real ya se detecta y reporta en
     * ensureConnection().
     */
    private static createClient(address: string): MilvusClient {
        const client = new MilvusClient({ address });
        const pending = (client as unknown as { connectPromise?: Promise<void> }).connectPromise;
        if (pending && typeof pending.catch === 'function') pending.catch(() => { /* reportado en ensureConnection */ });
        return client;
    }

    private static resolveAddress(): string {
        try {
            // BOORIE_DATA_DIR is the writable userData dir Electron passes to both
            // this process and the spawned start_milvus.py — authoritative when
            // set (electron/main.ts sets it before any service is constructed).
            // We deliberately do NOT fall through to the process.cwd()/__dirname/
            // resourcesPath candidates below in this case: those exist for
            // standalone-script contexts, and falling through to them here could
            // pick up a stale port file left over from an old dev run instead of
            // correctly defaulting to Milvus Lite's well-known first port while
            // the freshly-spawned server is still starting up (issue #19/#21).
            if (process.env.BOORIE_DATA_DIR) {
                const candidate = path.join(process.env.BOORIE_DATA_DIR, 'boorie-milvus', 'port');
                if (fs.existsSync(candidate)) {
                    const port = fs.readFileSync(candidate, 'utf-8').trim();
                    if (/^\d+$/.test(port)) return `127.0.0.1:${port}`;
                }
                return '127.0.0.1:19530';
            }

            const candidates = [
                path.join(process.cwd(), 'data', 'boorie-milvus', 'port'),
                path.join(__dirname, '..', '..', 'data', 'boorie-milvus', 'port'),
            ];
            const resourcesPath = (process as any).resourcesPath as string | undefined;
            if (resourcesPath) {
                candidates.push(path.join(resourcesPath, 'data', 'boorie-milvus', 'port'));
            }
            for (const candidate of candidates) {
                if (fs.existsSync(candidate)) {
                    const port = fs.readFileSync(candidate, 'utf-8').trim();
                    if (/^\d+$/.test(port)) return `127.0.0.1:${port}`;
                }
            }
        } catch {
            // ignore — fall through to default
        }
        return '127.0.0.1:19530';
    }

    public static getInstance(): MilvusService {
        if (!MilvusService.instance) {
            MilvusService.instance = new MilvusService();
        }
        return MilvusService.instance;
    }

    public getClient(): MilvusClient {
        return this.client;
    }

    public async ensureConnection() {
        if (this.connected) return;

        if (this.unavailable) {
            const elapsed = Date.now() - this.unavailableSince;
            if (elapsed < MilvusService.RETRY_INTERVAL_MS) {
                // Known to be down and still within the backoff window: short-circuit.
                throw new Error('Milvus unavailable (cached)');
            }
            // Backoff window elapsed — give it another chance instead of caching
            // forever. Re-resolve and recreate the client too: the address was
            // baked in at construction time and Milvus Lite may have since come
            // up on a different port than what was resolved back then.
            this.unavailable = false;
            this.connectionAttempted = false;
            this.client = MilvusService.createClient(MilvusService.resolveAddress());
        }

        if (this.connectionAttempted) {
            // Re-entry while a previous attempt is still fresh; bail fast.
            throw new Error('Milvus unavailable');
        }
        this.connectionAttempted = true;
        try {
            let retries = 5; // ~7.5s total — enough for start_milvus.py to finish coming up.
            let lastResolvedAddress = MilvusService.resolveAddress();
            while (retries > 0) {
                try {
                    // Milvus Lite may still be starting up when the client was first
                    // constructed, and can land on a different port than the initial
                    // guess if the well-known default was already taken. Re-resolve on
                    // every attempt so we pick up the real port as soon as
                    // start_milvus.py writes it, instead of retrying a stale address.
                    const resolved = MilvusService.resolveAddress();
                    if (resolved !== lastResolvedAddress || retries === 5) {
                        this.client = MilvusService.createClient(resolved);
                        lastResolvedAddress = resolved;
                    }
                    await this.client.listCollections();
                    this.connected = true;
                    console.log('[MilvusService] Connected successfully at', resolved);
                    break;
                } catch {
                    console.log(`[MilvusService] Waiting for Milvus server... (${retries})`);
                    await new Promise(r => setTimeout(r, 1500));
                    retries--;
                }
            }

            if (this.connected) {
                await this.initCollections();
            } else {
                this.unavailable = true;
                this.unavailableSince = Date.now();
                console.warn(`[MilvusService] Milvus unavailable — RAG will fall back to in-DB chunks. Retrying in ${MilvusService.RETRY_INTERVAL_MS / 1000}s.`);
                throw new Error('Milvus unavailable');
            }
        } catch (error) {
            this.unavailable = true;
            this.unavailableSince = Date.now();
            console.warn('[MilvusService] Connection failed:', (error as Error).message);
            throw error;
        } finally {
            this.connectionAttempted = false;
        }
    }

    /**
     * Dimensión con la que se creó cada colección, cacheada al asegurarla. Sirve
     * para detectar que se está buscando con un vector de otro tamaño, que es un
     * fallo mudo en Milvus: la búsqueda responde «Success» con cero resultados.
     */
    private dimensiones = new Map<string, number>();

    private async initCollections() {
        // Al arrancar todavía no se sabe qué modelo de embeddings se va a usar,
        // así que esto es sólo una suposición para las colecciones que aún no
        // existan, tomada del modelo configurado (#155). La dimensión de verdad
        // la fija el primer insert, que sí conoce el vector: por eso aquí NO se
        // reconcilia la dimensión de una colección existente. Hacerlo la
        // borraría en cada reconexión y devolvería el almacén a la suposición de
        // arranque detrás de quien indexa con otro modelo.
        const dimension = dimensionEsperada();

        await this.rematarCambio(MilvusService.COLLECTIONS.KNOWLEDGE);

        // 1. Knowledge Collection (RAG)
        await this.ensureCollection(MilvusService.COLLECTIONS.KNOWLEDGE, dimension);

        // 2. Conversations Collection (red agéntica — embeddings de turnos)
        await this.ensureCollection(MilvusService.COLLECTIONS.CONVERSATIONS, dimension);

        // 3. Agent persistent memory (resúmenes de sesión / hechos retenidos)
        await this.ensureCollection(MilvusService.COLLECTIONS.AGENT_MEMORY, dimension);

        // 4. Guardrail violations (búsqueda por similitud sobre violaciones pasadas)
        await this.ensureCollection(MilvusService.COLLECTIONS.GUARDRAIL_VIOLATIONS, dimension);
    }

    /**
     * Deja la colección lista para vectores de otro tamaño, tirando los de antes
     * (#155).
     *
     * Es lo único que hace posible cambiar de modelo de embeddings. `insert` se
     * niega, y con razón, a rehacer una colección que tiene documentos dentro:
     * hacerlo por su cuenta dejaría al usuario sin base indexada y en silencio.
     * Pero entonces el reindexado masivo —que es justo la operación que va a
     * regenerar todos los vectores— fallaba en cada documento, tardaba sus
     * cuarenta minutos y terminaba con la búsqueda igual de muda que antes,
     * porque los vectores viejos seguían en el almacén.
     *
     * Aquí sí se pueden tirar: quien llama viene a reescribirlos todos. Devuelve
     * si hizo falta rehacerla, para poder decirlo en el log y en el resultado.
     */
    public async prepararParaDimension(collection: string, dimension: number): Promise<boolean> {
        await this.ensureConnection();
        await this.ensureCollection(collection, dimension);

        const actual = this.dimensiones.get(collection);
        if (actual === dimension) return false;

        console.warn(
            `[MilvusService] ${collection} guarda vectores de ${actual} números y se va a reindexar con ${dimension}: se rehace la colección.`
        );
        await this.ensureCollection(collection, dimension, true);
        return true;
    }

    /**
     * ¿La colección no guarda nada? Ante la duda se responde que sí guarda: la
     * respuesta sólo se usa para decidir si se puede destruir, y equivocarse
     * hacia «está vacía» borra datos de alguien.
     */
    private async estaVacia(collection: string): Promise<boolean> {
        try {
            const res: any = await this.client.query({
                collection_name: collection,
                filter: 'id != ""',
                output_fields: ['id'],
                limit: 1,
                consistency_level: ConsistencyLevelEnum.Strong,
            });
            return Array.isArray(res?.data) && res.data.length === 0;
        } catch (e) {
            console.warn(`[MilvusService] Could not tell whether ${collection} is empty:`, (e as Error).message);
            return false;
        }
    }

    /**
     * Milvus no lanza cuando rechaza una escritura: devuelve un estado de error
     * en la respuesta. Ignorarlo es lo que dejaba a un documento listado en el
     * panel y con cero vectores en el almacén, sin un solo error en el log.
     */
    private static exigirExito(res: any, que: string) {
        const status = res?.status ?? res;
        if (!status) return;
        const code = status.error_code ?? status.code;
        if (code === undefined || code === 0 || code === 'Success') return;
        throw new Error(`Milvus rechazó ${que}: ${status.reason || `código ${code}`}`);
    }

    /**
     * @param reconciliarDimension si una colección existente con otra dimensión
     *   debe recrearse. Sólo lo pide quien conoce la dimensión real de los
     *   vectores —el insert—; al arrancar la dimensión es una suposición y
     *   recrear con ella destruiría el índice bueno.
     */
    private async ensureCollection(name: string, dimension: number, reconciliarDimension = false) {
        const plazo = MilvusService.PLAZO_COLECCION_MS;
        const has = await this.client.hasCollection({ collection_name: name, timeout: plazo });
        if (has.value) {
            // Defensive describe — milvus-lite sometimes returns schema=null for
            // legacy collections; in that case we drop and recreate cleanly.
            let currentDim = 0;
            let canDescribe = true;
            let sinCamposFiltrables = false;
            try {
                const desc = await this.client.describeCollection({ collection_name: name, timeout: plazo });
                const fields = desc?.schema?.fields ?? null;
                if (!fields) {
                    canDescribe = false;
                } else {
                    const vectorField = fields.find((f: any) => f.name === 'vector');
                    // `describeCollection` devuelve los parámetros del campo en
                    // `type_params`. Leerlos de `params` —que no existe— daba
                    // siempre 0, y el 0 se interpretaba como «no se sabe, déjala
                    // estar»: por eso la reconciliación de dimensión de abajo no
                    // se disparó nunca desde que se escribió.
                    const typeParams = (vectorField as any)?.type_params ?? (vectorField as any)?.params;
                    currentDim = Array.isArray(typeParams)
                        ? parseInt(typeParams.find((p: any) => p.key === 'dim')?.value || '0')
                        : 0;
                    if (!currentDim) {
                        console.warn(`[MilvusService] Could not read the dimension of ${name} from its schema.`);
                    }
                    sinCamposFiltrables = this.llevaCamposFiltrables(name)
                        && !fields.some((f: any) => f.name === 'projectId');
                }
            } catch (e) {
                // Un fallo al describir no dice nada del esquema —puede ser un plazo vencido— y
                // tratarlo como esquema ilegible tiraba la colección entera con todos sus vectores.
                console.warn(`[MilvusService] describeCollection(${name}) failed:`, (e as Error).message);
                throw e;
            }

            const dimensionIncompatible = currentDim !== dimension && currentDim !== 0;

            if (!canDescribe || (dimensionIncompatible && reconciliarDimension)) {
                console.warn(`[MilvusService] Recreating collection ${name} (currentDim=${currentDim}, required=${dimension}, describable=${canDescribe})`);
                try { await this.client.dropCollection({ collection_name: name }); } catch { /* ignore */ }
                // Se va a reindexar entera con el esquema nuevo: la reconstrucción ya no tiene objeto.
                await this.abandonarReconstruccion(name);
            } else {
                if (dimensionIncompatible) {
                    console.warn(`[MilvusService] Collection ${name} has dim=${currentDim}, not the ${dimension} guessed at startup — leaving it alone; the next insert will reconcile it.`);
                }
                if (currentDim > 0) this.dimensiones.set(name, currentDim);
                if (sinCamposFiltrables) {
                    // No se carga: cargada ocupa ~2,9 GB, y sumada al pico de la reconstrucción
                    // acercaba la sesión al límite de systemd-oomd.
                    await this.prepararReconstruccion(name, 'tiene el esquema viejo');
                    return;
                }
                await this.cargar(name);
                return;
            }
        }

        await this.crearColeccion(name, dimension);
        await this.cargar(name);
    }

    private async crearColeccion(name: string, dimension: number) {
        console.log(`[MilvusService] Creating collection ${name} with dimension ${dimension}...`);
        const filtrables = this.llevaCamposFiltrables(name)
            ? CAMPOS_FILTRABLES.map(c => ({ name: c, data_type: DataType.VarChar, max_length: 256 }))
            : [];
        await this.client.createCollection({
            collection_name: name,
            fields: [
                {
                    name: 'id',
                    data_type: DataType.VarChar,
                    max_length: 64,
                    is_primary_key: true,
                },
                {
                    name: 'vector',
                    data_type: DataType.FloatVector,
                    dim: dimension,
                },
                {
                    name: 'content',
                    data_type: DataType.VarChar,
                    max_length: 8192,
                },
                {
                    name: 'metadata',
                    data_type: DataType.JSON,
                },
                {
                    name: 'timestamp',
                    data_type: DataType.Int64,
                    description: 'Unix timestamp'
                },
                ...filtrables,
            ],
        });

        await this.client.createIndex({
            collection_name: name,
            field_name: 'vector',
            index_type: 'FLAT',
            metric_type: 'COSINE',
            params: { nlist: 1024 }
        });
        console.log(`[MilvusService] Collection ${name} created.`);
        this.dimensiones.set(name, dimension);
    }

    private llevaCamposFiltrables(name: string): boolean {
        const knowledge = MilvusService.COLLECTIONS.KNOWLEDGE;
        return name === knowledge || name === MilvusService.nombreReconstruccion(knowledge);
    }

    public static nombreReconstruccion(collection: string): string {
        return `${collection}__reconstruccion`;
    }

    // Colecciones con el esquema viejo, a la espera de reconstruirse o reconstruyéndose.
    private reconstruyendo = new Set<string>();
    private progreso = new Map<string, { hechas: number; total: number }>();
    private enCurso = new Map<string, Promise<void>>();
    private estadosEnMemoria = new Map<string, EstadoReconstruccion>();

    /** `null` si la colección no se está reconstruyendo. */
    public estadoReconstruccion(collection: string): { hechas: number; total: number } | null {
        if (!this.reconstruyendo.has(collection)) return null;
        return this.progreso.get(collection) ?? { hechas: 0, total: 0 };
    }

    public necesitaReconstruir(collection: string): boolean {
        return this.reconstruyendo.has(collection);
    }

    /**
     * Dónde se apunta por dónde va, para retomar si se cierra la app a medias. Sin directorio de
     * datos —scripts, tests— se guarda en memoria y un corte empieza de cero.
     */
    private static rutaEstado(collection: string): string | null {
        const dir = process.env.BOORIE_DATA_DIR;
        return dir ? path.join(dir, 'boorie-milvus', `reconstruccion-${collection}.json`) : null;
    }

    private leerEstado(collection: string): EstadoReconstruccion | null {
        const ruta = MilvusService.rutaEstado(collection);
        if (!ruta) return this.estadosEnMemoria.get(collection) ?? null;
        try {
            return JSON.parse(fs.readFileSync(ruta, 'utf-8'));
        } catch {
            return null;
        }
    }

    private escribirEstado(collection: string, estado: EstadoReconstruccion | null) {
        const ruta = MilvusService.rutaEstado(collection);
        if (!ruta) {
            if (estado) this.estadosEnMemoria.set(collection, estado);
            else this.estadosEnMemoria.delete(collection);
            return;
        }
        if (!estado) {
            fs.rmSync(ruta, { force: true });
            return;
        }
        // Escribir y renombrar: un corte a mitad de escritura no deja un estado ilegible.
        fs.writeFileSync(`${ruta}.tmp`, JSON.stringify(estado));
        fs.renameSync(`${ruta}.tmp`, ruta);
    }

    private async existe(collection: string): Promise<boolean> {
        const res = await this.client.hasCollection({ collection_name: collection, timeout: MilvusService.PLAZO_COLECCION_MS });
        return Boolean(res.value);
    }

    /**
     * La dimensión es la del modelo configurado, no la de la colección vieja: es la que tendrán las
     * preguntas. Con la de la vieja, una base traída de otro equipo con otro modelo se saltaba
     * todos sus vectores y la reconstrucción dejaba la colección vacía.
     */
    private async prepararReconstruccion(collection: string, motivo: string) {
        if (this.reconstruyendo.has(collection)) return;
        const nueva = MilvusService.nombreReconstruccion(collection);
        const dimension = dimensionEsperada();
        const estado = this.leerEstado(collection);
        const hayNueva = await this.existe(nueva);

        // Sin apunte no se sabe hasta dónde llegó, y si se cambió de modelo entre medias lo hecho
        // no vale: en los dos casos se empieza de cero.
        const retomable = hayNueva && estado !== null && (await this.dimensionDe(nueva)) === dimension;
        if (hayNueva && !retomable) {
            await this.client.dropCollection({ collection_name: nueva, timeout: MilvusService.PLAZO_COLECCION_MS });
        }
        if (!retomable) {
            await this.crearColeccion(nueva, dimension);
            this.escribirEstado(collection, { ultimoId: null, hechas: 0 });
        }
        this.dimensiones.set(nueva, dimension);
        this.reconstruyendo.add(collection);
        console.warn(`[MilvusService] ${collection} ${motivo}: se reconstruirá en ${nueva}.`);
    }

    /**
     * Una colección vacía con los vectores esperando en SQLite —una base traída de otro equipo, o
     * una instalación nueva a la que se le copia— se llena por la misma vía que la reconstrucción.
     * La sincronización de `HybridSearchService` va de 50 en 50 y no empieza hasta la primera
     * pregunta al chat. Devuelve si hay que reconstruir.
     */
    public async prepararSiVacia(collection: string): Promise<boolean> {
        await this.ensureConnection();
        if (this.reconstruyendo.has(collection)) return true;
        if (!(await this.estaVacia(collection))) return false;
        await this.prepararReconstruccion(collection, 'está vacía y SQLite tiene vectores');
        return true;
    }

    private async dimensionDe(collection: string): Promise<number> {
        const desc: any = await this.client.describeCollection({ collection_name: collection, timeout: MilvusService.PLAZO_COLECCION_MS });
        const vector = desc?.schema?.fields?.find((f: any) => f.name === 'vector');
        return parseInt(vector?.type_params?.find((p: any) => p.key === 'dim')?.value || '0');
    }

    private async abandonarReconstruccion(collection: string) {
        if (!this.reconstruyendo.has(collection)) return;
        try { await this.client.dropCollection({ collection_name: MilvusService.nombreReconstruccion(collection) }); } catch { /* ignore */ }
        this.escribirEstado(collection, null);
        this.reconstruyendo.delete(collection);
        this.progreso.delete(collection);
    }

    /**
     * Rellena la colección nueva desde `fuente` y la pone en lugar de la vieja. Varias llamadas a
     * la vez comparten la misma reconstrucción.
     */
    public reconstruir(collection: string, fuente: FuenteDeReconstruccion): Promise<void> {
        const pendiente = this.enCurso.get(collection);
        if (pendiente) return pendiente;
        const tarea = this.reconstruirUnaVez(collection, fuente).finally(() => this.enCurso.delete(collection));
        this.enCurso.set(collection, tarea);
        return tarea;
    }

    private async reconstruirUnaVez(collection: string, fuente: FuenteDeReconstruccion) {
        await this.ensureConnection();
        if (!this.reconstruyendo.has(collection)) return;

        const nueva = MilvusService.nombreReconstruccion(collection);
        const dimension = this.dimensiones.get(nueva);
        let estado = this.leerEstado(collection) ?? { ultimoId: null, hechas: 0 };
        const total = await fuente.total();
        this.progreso.set(collection, { hechas: estado.leidas ?? estado.hechas, total });
        console.log(
            estado.ultimoId
                ? `[MilvusService] Retomando la reconstrucción de ${collection}: ${estado.hechas} de ${total}.`
                : `[MilvusService] Reconstruyendo ${collection} con ${total} fragmentos.`
        );

        const inicio = Date.now();
        let sinVolcar = 0;
        for (;;) {
            const filas = await fuente.lote(estado.ultimoId, MilvusService.LOTE_RECONSTRUCCION);
            if (filas.length === 0) break;

            const validas = filas.filter(f => f.vector?.length === dimension).map(conCamposFiltrables);
            if (validas.length > 0) {
                // `upsert` y no `insert`: tras un corte, el lote que entró sin llegar a apuntarse
                // vuelve a mandarse, y lo que se indexó durante la reconstrucción ya está dentro.
                const res = await this.client.upsert({ collection_name: nueva, data: validas as any[] });
                MilvusService.exigirExito(res, `la reconstrucción de ${collection}`);
            }

            estado = {
                ultimoId: filas[filas.length - 1].id,
                hechas: estado.hechas + validas.length,
                leidas: (estado.leidas ?? estado.hechas) + filas.length,
            };
            this.escribirEstado(collection, estado);
            this.progreso.set(collection, { hechas: estado.leidas!, total });

            sinVolcar += validas.length;
            if (sinVolcar >= MilvusService.VOLCADO_CADA) {
                await this.client.flush({ collection_names: [nueva] });
                sinVolcar = 0;
                console.log(`[MilvusService] Reconstrucción de ${collection}: ${estado.leidas} de ${total}, ${estado.hechas} copiados.`);
            }
        }
        await this.client.flush({ collection_names: [nueva] });

        const guardadas = await this.contar(nueva);
        if (guardadas < estado.hechas) {
            throw new Error(
                `La reconstrucción de ${collection} guarda ${guardadas} filas de ${estado.hechas} enviadas: no se sustituye la colección.`
            );
        }

        this.escribirEstado(collection, { ...estado, completa: true });
        await this.rematarCambio(collection);
        this.reconstruyendo.delete(collection);
        this.progreso.delete(collection);
        this.dimensiones.set(collection, dimension!);
        await this.cargar(collection);
        console.log(`[MilvusService] ${collection} reconstruida: ${guardadas} filas en ${Math.round((Date.now() - inicio) / 1000)} s.`);
    }

    /**
     * El cambio de la vieja por la nueva, en dos pasos que no se pueden hacer a la vez. Si se corta
     * entre tirar la vieja y renombrar la nueva, el apunte `completa` hace que el siguiente
     * arranque lo termine en lugar de crear una colección vacía.
     */
    private async rematarCambio(collection: string) {
        const estado = this.leerEstado(collection);
        if (!estado?.completa) return;
        const nueva = MilvusService.nombreReconstruccion(collection);
        if (!(await this.existe(nueva))) {
            this.escribirEstado(collection, null);
            return;
        }
        // Tirar la vieja —2,2 GB en la base de Luis— pasa de los 15 s del SDK: la llamada lanzaba con
        // la colección ya borrada en el servidor, y el renombrado no llegaba a pedirse.
        const plazo = MilvusService.PLAZO_COLECCION_MS;
        if (await this.existe(collection)) {
            await this.client.dropCollection({ collection_name: collection, timeout: plazo });
        }
        const res = await this.client.renameCollection({ collection_name: nueva, new_collection_name: collection, timeout: plazo });
        MilvusService.exigirExito(res, `el cambio de ${nueva} por ${collection}`);
        this.escribirEstado(collection, null);
    }

    private async contar(collection: string): Promise<number> {
        const res: any = await this.client.query({
            collection_name: collection,
            output_fields: ['count(*)'],
            consistency_level: ConsistencyLevelEnum.Strong,
        });
        MilvusService.exigirExito(res, `el recuento de ${collection}`);
        return Number(res?.data?.[0]?.['count(*)'] ?? 0);
    }

    /**
     * Carga la colección en memoria. Milvus Lite no recuerda entre arranques que estaba cargada,
     * así que hay que hacerlo en cada uno. No lanza: si falla aquí, `search` lo vuelve a intentar.
     */
    private async cargar(name: string): Promise<boolean> {
        try {
            const res = await this.client.loadCollection({ collection_name: name, timeout: MilvusService.PLAZO_COLECCION_MS });
            MilvusService.exigirExito(res, `la carga de ${name}`);
            return true;
        } catch (e) {
            console.warn(`[MilvusService] No se pudo cargar ${name}:`, (e as Error).message);
            return false;
        }
    }

    private static sinCargar(res: any): boolean {
        const status = res?.status;
        return status?.code === 101 || /released|not loaded/i.test(status?.reason ?? '');
    }

    public isAvailable(): boolean {
        return this.connected && !this.unavailable;
    }

    public async search(collection: string, vector: number[], limit: number = 10, filter?: string, consistency: boolean = true) {
        try {
            await this.ensureConnection();
        } catch {
            // Fail-soft: return empty results so RAG can fall back to in-DB chunks.
            return { results: [] } as any;
        }
        if (this.reconstruyendo.has(collection)) {
            const p = this.estadoReconstruccion(collection)!;
            console.warn(`[MilvusService] ${collection} se está reconstruyendo (${p.hechas} de ${p.total}): la búsqueda no devuelve nada hasta que termine.`);
            return { results: [] } as any;
        }
        // Buscar con un vector de otro tamaño no es un error para Milvus: responde
        // «Success» y una lista vacía. Sin este aviso, cambiar de modelo de
        // embeddings sin reindexar deja el RAG mudo y sin rastro en el log.
        const dimensionColeccion = this.dimensiones.get(collection);
        if (dimensionColeccion && dimensionColeccion !== vector.length) {
            console.warn(
                `[MilvusService] Search on ${collection} with a ${vector.length}-dim vector, but the collection holds ${dimensionColeccion}-dim vectors. ` +
                `Returning no results — reindex the knowledge base with the embedding model in use.`
            );
            return { results: [] } as any;
        }

        const buscar = () => this.client.search({
            collection_name: collection,
            data: vector,
            limit: limit,
            filter: filter,
            output_fields: ['content', 'metadata', 'timestamp'],
            // Sin metric_type explícito, Milvus Lite devuelve unos resultados
            // nulos que el SDK intenta leer y revienta con «Cannot read
            // properties of null (reading 'scores')». El error lo recoge el
            // llamante y la búsqueda semántica se quedaba en cero sin decir
            // nada: el agente respondía sin ninguno de los documentos
            // indexados. Es el mismo métrico con el que se crea el índice.
            params: { metric_type: 'COSINE' },
            consistency_level: consistency ? ConsistencyLevelEnum.Strong : ConsistencyLevelEnum.Eventually
        });

        // Una colección sin cargar tampoco lanza: responde con el error en el estado y la lista
        // vacía, y el chat contestaba sin fuentes. Se carga y se repite una vez.
        let res: any = await buscar();
        if (MilvusService.sinCargar(res) && await this.cargar(collection)) {
            res = await buscar();
        }
        MilvusService.exigirExito(res, `la búsqueda en ${collection}`);
        return res;
    }

    public async insert(collection: string, rows: any[]) {
        try {
            await this.ensureConnection();
        } catch {
            // Skip silently — chunks remain in DB and can be synced later via wisdom:syncMilvus.
            return { insert_cnt: 0, skipped: true } as any;
        }

        // Los vectores que llegan son la única fuente fiable de la dimensión: el
        // modelo de embeddings lo elige quien usa el programa y puede cambiarlo.
        // Indexar con OpenAI (1536) contra la colección de 768 que se creaba fija
        // al arrancar era el fallo mudo: Milvus devolvía «FieldData 'vector' has
        // 1536 elements, expected dim(768)» en el estado —sin lanzar—, nadie lo
        // miraba, y la búsqueda con ese mismo vector contestaba «Success» con
        // cero resultados. El documento quedaba en la lista, marcado como
        // indexado porque sus trozos sí están en SQLite, y el RAG no lo veía.
        if (this.llevaCamposFiltrables(collection)) rows = rows.map(conCamposFiltrables);

        if (this.reconstruyendo.has(collection)) {
            // La vieja no admite los campos nuevos y se va a tirar: lo que se indexe mientras
            // tanto va directo a la que la sustituye.
            const res = await this.client.upsert({ collection_name: MilvusService.nombreReconstruccion(collection), data: rows });
            MilvusService.exigirExito(res, `la inserción de ${rows.length} vectores en ${collection}`);
            return res;
        }

        const dimension = rows[0]?.vector?.length;
        if (dimension) {
            await this.ensureCollection(collection, dimension);

            const actual = this.dimensiones.get(collection);
            if (actual && actual !== dimension) {
                // Rehacer la colección es tirar todos sus vectores. Se hace sólo
                // si está vacía —el caso de la instalación nueva, donde la
                // dimensión de arranque fue una suposición y no hay nada que
                // perder—. Con documentos dentro, cambiar de modelo de
                // embeddings exige regenerarlos todos: borrarlos aquí, y encima
                // en silencio, dejaría al usuario sin su base indexada.
                if (!(await this.estaVacia(collection))) {
                    throw new Error(
                        `La base vectorial ${collection} guarda vectores de ${actual} números y el modelo de embeddings actual produce ${dimension}. ` +
                        `Cambiar de modelo obliga a reindexar toda la base de conocimientos: hasta entonces no se puede añadir nada.`
                    );
                }
                await this.ensureCollection(collection, dimension, true);
            }
        }

        const res = await this.client.insert({
            collection_name: collection,
            data: rows
        });
        MilvusService.exigirExito(res, `la inserción de ${rows.length} vectores en ${collection}`);
        return res;
    }

    public async delete(collection: string, ids: string[]) {
        await this.ensureConnection();
        const filter = `id in ["${ids.join('","')}"]`;
        if (this.reconstruyendo.has(collection)) {
            await this.client.delete({ collection_name: MilvusService.nombreReconstruccion(collection), filter });
        }
        return this.client.delete({ collection_name: collection, filter });
    }

    public async listCollections() {
        await this.ensureConnection();
        return this.client.listCollections();
    }

    public async describeCollection(collectionName: string) {
        await this.ensureConnection();
        return this.client.describeCollection({ collection_name: collectionName });
    }

    public async getCollectionStatistics(collectionName: string) {
        await this.ensureConnection();
        return this.client.getCollectionStatistics({ collection_name: collectionName });
    }

    public async query(collection: string, filter: string = '', output_fields: string[] = ['*'], limit: number = 50, offset: number = 0) {
        await this.ensureConnection();
        // Determine filter. If empty, Milvus might expect an expression that matches all, or we might need to be careful.
        // Usually "" is not valid. "id != ''" or similar might be needed if filter is mandatory, 
        // but often query() without filter implies "all" if the SDK supports it, or it might fail.
        // Safe default might be a simple tautology if available, but let's try passing undefined/empty first.
        // Actually, for Milvus query, 'expr' is required. "id > 0" or similar depends on PK type.
        // Let's assume the caller provides a valid filter or we use a fallback if possible.
        // For now, if filter is empty, we'll try to use a "match all" strategy if we know the PK.
        // But simply exposing the method is enough for now; the handler can deal with the filter.

        return this.client.query({
            collection_name: collection,
            filter: filter || 'id != ""', // rudimentary fallback for string IDs, might fail for int IDs
            output_fields: output_fields,
            limit: limit,
            offset: offset
        });
    }
}
