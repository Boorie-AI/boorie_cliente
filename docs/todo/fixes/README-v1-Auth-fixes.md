# Todo Authentication Fixes

Este documento detalla los arreglos realizados en el sistema de autenticación del módulo Todo para resolver problemas de tokens y comunicación con las APIs de Google Tasks y Microsoft To Do.

## Problemas Identificados

### 1. Token Decryption Errors
**Error:** `Error while decrypting the ciphertext provided to safeStorage.decryptString. Ciphertext does not appear to be encrypted.`

**Causa:** El sistema Todo estaba creando nuevas instancias del `TokenSecurityService` en lugar de usar el singleton compartido, y no pasaba el parámetro `tokenType` requerido.

### 2. Architecture Mismatch
**Problema:** Los servicios Todo no seguían el mismo patrón de autenticación que los servicios Calendar que funcionaban correctamente.

## Soluciones Implementadas

### 1. Fix Token Security Service Usage

**Antes (❌ Roto):**
```typescript
// google.tasks.service.ts y microsoft.todo.service.ts
import { TokenSecurityService } from '../security/token.security.service';

export class GoogleTasksService {
  private tokenSecurityService: TokenSecurityService;
  
  constructor(databaseService?: DatabaseService) {
    this.tokenSecurityService = new TokenSecurityService(); // ❌ Nueva instancia
    // ...
  }
  
  private async getAccessToken(): Promise<string> {
    const tokenData = await this.tokenSecurityService.retrieveTokenSecurely(
      this.databaseService, 
      'google'  // ❌ Solo 2 parámetros
    );
  }
}
```

**Después (✅ Correcto):**
```typescript
// google.tasks.service.ts y microsoft.todo.service.ts
import { tokenSecurityService } from '../security/token.security.service'; // ✅ Singleton

export class GoogleTasksService {
  // ✅ Removido tokenSecurityService privado
  
  constructor(databaseService: DatabaseService) { // ✅ Requerido, no opcional
    this.databaseService = databaseService;
    // ...
  }
  
  private async getValidToken(): Promise<string | null> {
    const tokenData = await tokenSecurityService.retrieveTokenSecurely(
      this.databaseService,
      'google',
      'access'  // ✅ Agregado tokenType parámetro
    );
    
    // ✅ Verificación de expiración como en Calendar
    if (tokenSecurityService.isTokenExpired(tokenData)) {
      return null;
    }
    
    return tokenData.accessToken;
  }
}
```

### 2. Fix Database Service Injection

**Antes:**
```typescript
// todo.handler.ts
constructor(databaseService?: DatabaseService) {
  this.databaseService = databaseService || new DatabaseService(null as any); // ❌ Permite null
}
```

**Después:**
```typescript
// todo.handler.ts
constructor(databaseService: DatabaseService) { // ✅ Requerido
  this.databaseService = databaseService;
}
```

### 3. Fix List Format Conversion

**Problema:** Las listas se retornaban en formato raw de Google/Microsoft sin convertir al formato unificado.

**Solución:**
```typescript
// todo.handler.ts - initializeTodoData()
// ❌ Antes: Formato raw
const googleLists = await this.googleTasksService.getTaskLists();
allLists.push(...googleLists);

// ✅ Después: Formato unificado
const allLists = await this.todoAggregatorService.getAllLists(validProviders);
const allTasks = await this.todoAggregatorService.getAllTasks(allLists);
```

### 4. Pattern Alignment with Calendar System

Se alineó el patrón de autenticación de Todo con el sistema Calendar que funcionaba:

| Aspecto | Calendar (Funcionando) | Todo (Antes) | Todo (Después) |
|---------|----------------------|--------------|----------------|
| TokenSecurityService | Singleton import | Nueva instancia | Singleton import ✅ |
| retrieveTokenSecurely | 3 parámetros | 2 parámetros | 3 parámetros ✅ |
| Database service | Requerido | Opcional/null | Requerido ✅ |
| Token refresh | Integrado | Faltante | Integrado ✅ |
| Method naming | `getValidToken()` | `getAccessToken()` | `getValidToken()` ✅ |

## Archivos Modificados

### Core Services
- `electron/services/todo/google.tasks.service.ts`
- `electron/services/todo/microsoft.todo.service.ts`
- `electron/handlers/todo.handler.ts`

### Changes Summary
1. **Import Change:** `TokenSecurityService` → `tokenSecurityService` (singleton)
2. **Constructor Fix:** Mandatory DatabaseService parameter
3. **Method Update:** `getAccessToken()` → `getValidToken()` with proper error handling
4. **Parameter Fix:** Added missing `tokenType: 'access'` parameter
5. **Format Fix:** Use TodoAggregatorService for unified list/task format

## Testing Results

**Antes:** 
- ❌ Token decryption errors
- ❌ Lists: 8, googleLists: 0, microsoftLists: 0
- ❌ Authentication failures

**Después:**
- ✅ Token decryption working
- ✅ Lists properly converted to unified format
- ✅ Authentication following Calendar pattern
- ✅ Proper provider filtering

## Key Lessons

1. **Singleton Pattern:** Usar siempre el singleton `tokenSecurityService` compartido
2. **Parameter Completeness:** `retrieveTokenSecurely()` requiere 3 parámetros: db, provider, tokenType
3. **Database Injection:** DatabaseService debe ser requerido, no opcional
4. **Pattern Consistency:** Seguir patrones establecidos que funcionan (Calendar)
5. **Unified Format:** Usar agregator services para conversión de formatos

## Future Considerations

- Considerar crear una clase base abstracta para servicios de autenticación
- Implementar validación de tipos en tiempo de compilación para parámetros requeridos
- Documentar patrones de autenticación para futuros desarrolladores