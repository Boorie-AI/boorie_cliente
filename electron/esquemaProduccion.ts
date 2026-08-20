/**
 * El esquema que la aplicación empaquetada garantiza al arrancar.
 *
 * En desarrollo el esquema lo pone `prisma db push`; en producción no corre
 * nadie, así que estas sentencias son lo único que crea las tablas que faltan y
 * añade las columnas nuevas sobre una base que ya existe. Se ejecutan en cada
 * arranque y cada una va en su propio `try`: la que sobra avisa y se ignora.
 *
 * **Tienen que ir al día con `prisma/schema.prisma`.** Cuando se separan no falla
 * nada visible aquí —en desarrollo el `db push` tapa el hueco— y el error sale en
 * la máquina del cliente como «no such column». Pasó con la jerarquía de
 * escenarios (#31): sus tres columnas de `hydraulic_networks` entraron en la
 * v1.6.0 sin llegar a esta lista, y desde entonces cualquier instalación cuya
 * base no la creara `db push` no podía ni listar sus redes. `esquemaProduccion.test.ts`
 * compara ambos ficheros y falla cuando vuelven a separarse.
 *
 * Dos reglas al añadir algo al esquema:
 *
 * - **Tabla nueva** → su `CREATE TABLE IF NOT EXISTS` con todas sus columnas.
 * - **Columna nueva en una tabla que ya existía** → además del `CREATE TABLE`, un
 *   `ALTER TABLE ADD COLUMN`. `CREATE TABLE IF NOT EXISTS` no toca una tabla que
 *   ya está, así que sin el `ALTER` la columna no llega a quien actualiza.
 *   SQLite no admite añadir una clave foránea con `ADD COLUMN`: la relación se
 *   declara igualmente en el esquema y el código no puede descansar en ella.
 */
export const SENTENCIAS_ESQUEMA: string[] = [
    // Conversations
    `CREATE TABLE IF NOT EXISTS "conversations" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL,
      "model" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "projectId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "conversations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "hydraulic_projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    // Messages
    `CREATE TABLE IF NOT EXISTS "messages" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "conversationId" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "metadata" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    // AI Providers
    `CREATE TABLE IF NOT EXISTS "ai_providers" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "apiKey" TEXT,
      "isActive" INTEGER NOT NULL DEFAULT 0,
      "isConnected" INTEGER NOT NULL DEFAULT 0,
      "lastTestResult" TEXT,
      "lastTestMessage" TEXT,
      "config" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    // AI Models
    `CREATE TABLE IF NOT EXISTS "ai_models" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "providerId" TEXT NOT NULL,
      "modelName" TEXT NOT NULL,
      "modelId" TEXT NOT NULL,
      "isDefault" INTEGER NOT NULL DEFAULT 0,
      "isAvailable" INTEGER NOT NULL DEFAULT 1,
      "isSelected" INTEGER NOT NULL DEFAULT 0,
      "description" TEXT,
      "metadata" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "ai_models_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ai_providers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    // App Settings
    `CREATE TABLE IF NOT EXISTS "app_settings" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "key" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "category" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    // Documents
    `CREATE TABLE IF NOT EXISTS "documents" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "filename" TEXT NOT NULL,
      "filepath" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "metadata" TEXT,
      "embeddings" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    // Document Chunks
    `CREATE TABLE IF NOT EXISTS "document_chunks" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "documentId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "embedding" TEXT,
      "metadata" TEXT,
      "startPos" INTEGER,
      "endPos" INTEGER,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "document_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    // Auth Tokens
    `CREATE TABLE IF NOT EXISTS "auth_tokens" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "provider" TEXT NOT NULL,
      "tokenType" TEXT NOT NULL,
      "accessToken" TEXT NOT NULL,
      "refreshToken" TEXT,
      "expiresAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    // Email Messages
    `CREATE TABLE IF NOT EXISTS "email_messages" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "provider" TEXT NOT NULL,
      "messageId" TEXT NOT NULL,
      "subject" TEXT NOT NULL,
      "from" TEXT NOT NULL,
      "to" TEXT NOT NULL,
      "cc" TEXT,
      "bcc" TEXT,
      "body" TEXT NOT NULL,
      "htmlBody" TEXT,
      "attachments" TEXT,
      "isRead" INTEGER NOT NULL DEFAULT 0,
      "isImportant" INTEGER NOT NULL DEFAULT 0,
      "receivedAt" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    // Calendar Events
    `CREATE TABLE IF NOT EXISTS "calendar_events" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "provider" TEXT NOT NULL,
      "eventId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "location" TEXT,
      "startTime" DATETIME NOT NULL,
      "endTime" DATETIME NOT NULL,
      "isAllDay" INTEGER NOT NULL DEFAULT 0,
      "attendees" TEXT,
      "organizer" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    // User Profiles
    `CREATE TABLE IF NOT EXISTS "user_profiles" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "provider" TEXT NOT NULL,
      "providerId" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "name" TEXT,
      "pictureUrl" TEXT,
      "isActive" INTEGER NOT NULL DEFAULT 1,
      "metadata" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    // Hydraulic Projects
    `CREATE TABLE IF NOT EXISTS "hydraulic_projects" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "type" TEXT NOT NULL,
      "networkType" TEXT NOT NULL,
      "location" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "regulations" TEXT NOT NULL,
      "wntrModel" TEXT,
      "metadata" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    // Hydraulic Calculations
    `CREATE TABLE IF NOT EXISTS "hydraulic_calculations" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "inputs" TEXT NOT NULL,
      "results" TEXT NOT NULL,
      "formulas" TEXT NOT NULL,
      "verified" INTEGER NOT NULL DEFAULT 0,
      "verifiedBy" TEXT,
      "notes" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "hydraulic_calculations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "hydraulic_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    // Project Documents
    `CREATE TABLE IF NOT EXISTS "project_documents" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "metadata" TEXT NOT NULL,
      "attachments" TEXT,
      "version" TEXT NOT NULL DEFAULT '1.0',
      "status" TEXT NOT NULL DEFAULT 'draft',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "project_documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "hydraulic_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    // Project Team Members
    `CREATE TABLE IF NOT EXISTS "project_team_members" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "permissions" TEXT NOT NULL,
      "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "project_team_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "hydraulic_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    // Hydraulic Knowledge (the main table causing BUG-1)
    `CREATE TABLE IF NOT EXISTS "hydraulic_knowledge" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "category" TEXT NOT NULL,
      "subcategory" TEXT NOT NULL,
      "region" TEXT NOT NULL,
      "secondaryCategories" TEXT,
      "title" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "metadata" TEXT NOT NULL,
      "keywords" TEXT NOT NULL,
      "language" TEXT NOT NULL DEFAULT 'es',
      "version" TEXT NOT NULL DEFAULT '1.0',
      "status" TEXT NOT NULL DEFAULT 'active',
      "projectId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    // Knowledge Chunks
    `CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "knowledgeId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "embedding" TEXT NOT NULL,
      "metadata" TEXT,
      "chunkIndex" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "knowledge_chunks_knowledgeId_fkey" FOREIGN KEY ("knowledgeId") REFERENCES "hydraulic_knowledge" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    // Hydraulic Components
    `CREATE TABLE IF NOT EXISTS "hydraulic_components" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "type" TEXT NOT NULL,
      "manufacturer" TEXT,
      "model" TEXT,
      "specifications" TEXT NOT NULL,
      "priceInfo" TEXT,
      "availability" TEXT,
      "documentation" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    // Hydraulic Networks
    `CREATE TABLE IF NOT EXISTS "hydraulic_networks" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "filename" TEXT NOT NULL,
      "fileContent" TEXT NOT NULL,
      "networkData" TEXT NOT NULL,
      "coordinateSystem" TEXT,
      "summary" TEXT NOT NULL,
      "simulationResults" TEXT,
      "version" TEXT NOT NULL DEFAULT '1.0',
      "isActive" INTEGER NOT NULL DEFAULT 1,
      "lastLoaded" DATETIME,
      "parentId" TEXT,
      "scenarioLabel" TEXT,
      "resultsPath" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "hydraulic_networks_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "hydraulic_networks" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "hydraulic_networks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "hydraulic_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    // Feedback
    `CREATE TABLE IF NOT EXISTS "feedback" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "query" TEXT NOT NULL,
      "response" TEXT NOT NULL,
      "rating" INTEGER NOT NULL,
      "correction" TEXT,
      "context" TEXT,
      "modelUsed" TEXT,
      "category" TEXT,
      "userId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    // Long Term Memory
    `CREATE TABLE IF NOT EXISTS "long_term_memory" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "key" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "category" TEXT,
      "confidence" REAL NOT NULL DEFAULT 1.0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    /**
     * Columnas añadidas a tablas que ya existen. `CREATE TABLE IF NOT EXISTS` no
     * las agrega en una instalación que actualiza, y sin ellas la consulta que
     * las nombra falla: el ámbito del Wisdom Center (#39) dejaría de funcionar
     * en cuanto se abriera. `ADD COLUMN` protesta si ya está, y el bucle de
     * abajo registra el aviso sin abortar, que es lo que hace idempotente esto.
     */
    `ALTER TABLE "hydraulic_knowledge" ADD COLUMN "projectId" TEXT`,
    `CREATE INDEX IF NOT EXISTS "hydraulic_knowledge_projectId_idx" ON "hydraulic_knowledge"("projectId")`,

    // Jerarquía madre/hija de escenarios (#31). Estas tres entraron en la v1.6.0
    // sin su ALTER, y sin él una base anterior se queda sin las columnas: la
    // aplicación no podía ni listar las redes del proyecto («no such column:
    // main.hydraulic_networks.parentId»). La clave foránea de parentId no viaja
    // en el ADD COLUMN porque SQLite no lo admite; queda declarada en el esquema.
    `ALTER TABLE "hydraulic_networks" ADD COLUMN "parentId" TEXT`,
    `ALTER TABLE "hydraulic_networks" ADD COLUMN "scenarioLabel" TEXT`,
    `ALTER TABLE "hydraulic_networks" ADD COLUMN "resultsPath" TEXT`,
    `CREATE INDEX IF NOT EXISTS "hydraulic_networks_parentId_idx" ON "hydraulic_networks"("parentId")`,

    // Indexación de simulaciones en el RAG (#41), sobre tablas que ya existen
    // en cualquier instalación que venga de la 1.13 o posterior.
    `ALTER TABLE "hydraulic_knowledge" ADD COLUMN "simulationRunId" TEXT`,
    `CREATE INDEX IF NOT EXISTS "hydraulic_knowledge_simulationRunId_idx" ON "hydraulic_knowledge"("simulationRunId")`,
    `ALTER TABLE "simulation_runs" ADD COLUMN "estadoIndexacion" TEXT NOT NULL DEFAULT 'pendiente'`,
    `ALTER TABLE "simulation_runs" ADD COLUMN "errorIndexacion" TEXT`,

    // Historial inmutable de redes y simulaciones (#38)
    `CREATE TABLE IF NOT EXISTS "network_versions" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "networkId" TEXT NOT NULL,
      "versionNumber" INTEGER NOT NULL,
      "networkData" TEXT NOT NULL,
      "fileContent" TEXT NOT NULL,
      "coordinateSystem" TEXT,
      "summary" TEXT NOT NULL,
      "changeNote" TEXT,
      "author" TEXT,
      "origen" TEXT NOT NULL DEFAULT 'manual',
      "marcada" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "network_versions_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "hydraulic_networks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "simulation_runs" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "networkVersionId" TEXT NOT NULL,
      "tipo" TEXT NOT NULL,
      "parameters" TEXT NOT NULL,
      "results" TEXT NOT NULL,
      "engineVersion" TEXT,
      "marcada" INTEGER NOT NULL DEFAULT 0,
      "estadoIndexacion" TEXT NOT NULL DEFAULT 'pendiente',
      "errorIndexacion" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "simulation_runs_networkVersionId_fkey" FOREIGN KEY ("networkVersionId") REFERENCES "network_versions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS "network_versions_networkId_idx" ON "network_versions"("networkId")`,
    `CREATE INDEX IF NOT EXISTS "simulation_runs_networkVersionId_idx" ON "simulation_runs"("networkVersionId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "network_versions_networkId_versionNumber_key" ON "network_versions"("networkId", "versionNumber")`,
    `CREATE TABLE IF NOT EXISTS "project_snapshots" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "label" TEXT NOT NULL,
      "note" TEXT,
      "author" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "project_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "hydraulic_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "project_snapshot_entries" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "snapshotId" TEXT NOT NULL,
      "networkVersionId" TEXT NOT NULL,
      CONSTRAINT "project_snapshot_entries_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "project_snapshots" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "project_snapshot_entries_networkVersionId_fkey" FOREIGN KEY ("networkVersionId") REFERENCES "network_versions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS "project_snapshots_projectId_idx" ON "project_snapshots"("projectId")`,
    `CREATE INDEX IF NOT EXISTS "project_snapshot_entries_networkVersionId_idx" ON "project_snapshot_entries"("networkVersionId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "project_snapshot_entries_snapshotId_networkVersionId_key" ON "project_snapshot_entries"("snapshotId", "networkVersionId")`,

    // Auditoría de guardrails. La escritura va dentro de un try/catch, así que su
    // ausencia no rompía nada a la vista: sólo dejaba la pestaña de violaciones
    // sin poder listar y la auditoría sin guardar nada.
    `CREATE TABLE IF NOT EXISTS "guardrail_violations" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "conversationId" TEXT,
      "messageId" TEXT,
      "rail" TEXT NOT NULL,
      "severity" TEXT NOT NULL,
      "reason" TEXT NOT NULL,
      "blocked" INTEGER NOT NULL DEFAULT 1,
      "judgeModel" TEXT,
      "judgeProvider" TEXT,
      "payload" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "guardrail_violations_conversationId_idx" ON "guardrail_violations"("conversationId")`,
    `CREATE INDEX IF NOT EXISTS "guardrail_violations_rail_createdAt_idx" ON "guardrail_violations"("rail", "createdAt")`,

    // Unique indexes
    `CREATE UNIQUE INDEX IF NOT EXISTS "ai_providers_name_key" ON "ai_providers"("name")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ai_models_providerId_modelId_key" ON "ai_models"("providerId", "modelId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "app_settings_key_key" ON "app_settings"("key")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "auth_tokens_provider_tokenType_key" ON "auth_tokens"("provider", "tokenType")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "email_messages_provider_messageId_key" ON "email_messages"("provider", "messageId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "calendar_events_provider_eventId_key" ON "calendar_events"("provider", "eventId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "user_profiles_provider_providerId_key" ON "user_profiles"("provider", "providerId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "project_team_members_projectId_userId_key" ON "project_team_members"("projectId", "userId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "hydraulic_networks_projectId_name_key" ON "hydraulic_networks"("projectId", "name")`
  ]

/**
 * Aplica el esquema. Cada sentencia va aparte porque las que sobran —una columna
 * que ya está, una tabla que ya existe— tienen que poder fallar sin detener a las
 * demás.
 */
export async function ensureProductionSchema(prismaClient: {
  $executeRawUnsafe: (sql: string) => Promise<unknown>
}): Promise<void> {
  for (const sql of SENTENCIAS_ESQUEMA) {
    try {
      await prismaClient.$executeRawUnsafe(sql)
    } catch (error) {
      // Avisa y sigue: la tabla puede existir ya, o la columna estar puesta.
      console.warn('Schema statement warning:', (error as Error).message?.substring(0, 100))
    }
  }
}
