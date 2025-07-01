# Implementación de Chat Multi-Proveedor

## Resumen de Cambios

Se ha implementado un sistema completo de chat que soporta múltiples proveedores de IA (OpenAI, Anthropic, Google AI, OpenRouter) con streaming en tiempo real y características específicas para cada proveedor.

## Problema Solucionado

### 🚫 **Antes:**
```
API integration for OpenAI is not yet implemented. 
Please select an Ollama model to continue.
```

### ✅ **Ahora:**
- **Chat funcional** con OpenAI, Anthropic, Google AI y OpenRouter
- **Streaming en tiempo real** para todos los proveedores
- **Configuración persistente** de API keys y modelos
- **Manejo específico** de cada proveedor según sus características

## Arquitectura Implementada

### 1. **Servicios de Chat por Proveedor**
Cada proveedor tiene su implementación específica optimizada para sus características:

```
src/services/chat/
├── types.ts         # Interfaces comunes
├── openai.ts        # Implementación OpenAI
├── anthropic.ts     # Implementación Anthropic  
├── google.ts        # Implementación Google AI
├── openrouter.ts    # Implementación OpenRouter
└── index.ts         # Gestión centralizada
```

### 2. **Características por Proveedor**

#### **OpenAI (openai.ts)**
- **API:** `https://api.openai.com/v1/chat/completions`
- **Streaming:** Server-Sent Events con `data: [DONE]`
- **Modelos:** GPT-4, GPT-3.5-turbo, etc.
- **Headers:** `Authorization: Bearer ${apiKey}`

#### **Anthropic (anthropic.ts)**
- **API:** `https://api.anthropic.com/v1/messages`
- **Streaming:** Server-Sent Events con tipos de mensaje
- **Formato especial:** Conversión de mensajes sistema/usuario/asistente
- **Headers:** `x-api-key`, `anthropic-version: 2023-06-01`

#### **Google AI (google.ts)**
- **API:** `https://generativelanguage.googleapis.com/v1beta/models/{model}`
- **Streaming:** SSE con `?alt=sse` para streaming
- **Formato único:** `contents` y `systemInstruction` separados
- **Headers:** `x-goog-api-key`

#### **OpenRouter (openrouter.ts)**
- **API:** `https://openrouter.ai/api/v1/chat/completions`
- **Streaming:** Compatible con OpenAI
- **Headers especiales:** `HTTP-Referer`, `X-Title` (requeridos)
- **Modelo dinámico:** Puede cambiar el modelo en respuesta

## Implementación Técnica

### 1. **Tipos Base (types.ts)**
```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatResponse {
  response: string
  metadata: {
    model: string
    provider: string
    tokens?: number
    usage?: TokenUsage
    finish_reason?: string
  }
}

interface ChatProvider {
  name: string
  sendMessage: (model, messages, apiKey, onStream?) => Promise<ChatResponse>
  supportsStreaming: boolean
}
```

### 2. **Gestión Centralizada (index.ts)**
```typescript
export const chatProviders: Record<string, ChatProvider> = {
  'openai': openaiProvider,
  'anthropic': anthropicProvider,
  'google': googleProvider,
  'openrouter': openrouterProvider,
}

export async function sendChatMessage(
  providerName: string,
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  onStream?: (chunk: string) => void
): Promise<ChatResponse>
```

### 3. **Integración con ChatStore**
```typescript
// Nuevo método en chatStore
callAPIProvider: async (provider, model, prompt, context) => {
  // 1. Obtener configuración del proveedor desde aiConfigStore
  // 2. Validar API key y estado de conexión
  // 3. Convertir mensajes al formato ChatMessage
  // 4. Llamar sendChatMessage con streaming
  // 5. Retornar respuesta formateada
}
```

## Flujo de Conversación

### 1. **Usuario Envía Mensaje**
```
User Input → ChatStore.sendMessage()
```

### 2. **Selección de Proveedor**
```typescript
if (conversation.provider === 'Ollama') {
  // Usar implementación local existente
  callOllamaAPI()
} else {
  // Usar nuevo sistema multi-proveedor
  callAPIProvider(provider, model, prompt, context)
}
```

### 3. **Procesamiento por Proveedor**
```
callAPIProvider() → 
  ↓ Buscar configuración en aiConfigStore
  ↓ Validar API key y estado
  ↓ Convertir mensajes
  ↓ sendChatMessage(provider, ...)
  ↓ Proveedor específico (openai.ts, anthropic.ts, etc.)
  ↓ Streaming chunks → setStreamingMessage()
  ↓ Respuesta final → addMessageToConversation()
```

## Características Implementadas

### ✅ **Streaming Universal**
- **Todos los proveedores** soportan streaming
- **Throttling inteligente** (30-80ms delay) para UX suave
- **Manejo de errores** específico por proveedor

### ✅ **Configuración Persistente**
- **API keys** se obtienen de `aiConfigStore`
- **Validación automática** de estado de conexión
- **Error messaging** claro si falta configuración

### ✅ **Formato de Mensajes Específico**

#### **OpenAI/OpenRouter:** Directo
```typescript
messages: [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi!' }
]
```

#### **Anthropic:** Conversión especial
```typescript
// Sistema → Prepend a primer mensaje usuario
// Alternancia user/assistant estricta
```

#### **Google AI:** Formato único
```typescript
{
  contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
  systemInstruction: { parts: [{ text: 'System prompt' }] }
}
```

### ✅ **Metadata Rica**
- **Tokens usados** (prompt + completion + total)
- **Razón de finalización** (stop, length, etc.)
- **Modelo real usado** (importante para OpenRouter)
- **Timestamps** precisos

## Casos de Uso Solucionados

### ✅ **Chat con OpenAI**
1. Usuario configura API key de OpenAI
2. Selecciona modelo GPT-4
3. **Ahora puede chatear** con streaming funcional
4. Metadata muestra tokens usados

### ✅ **Chat con Anthropic Claude**
1. Usuario configura API key de Anthropic
2. Selecciona Claude 3.5 Sonnet
3. **Mensajes se convierten** al formato Anthropic
4. **Streaming funciona** con tipos de evento específicos

### ✅ **Chat con Google Gemini**
1. Usuario configura API key de Google AI
2. Selecciona Gemini Pro
3. **Formato se adapta** a la API de Google
4. **Instrucciones sistema** se manejan separadamente

### ✅ **Chat con OpenRouter**
1. Usuario configura API key de OpenRouter
2. Agrega modelos personalizados (ej: `anthropic/claude-3-haiku`)
3. **Headers específicos** incluidos automáticamente
4. **Modelo puede cambiar** en respuesta (tracked en metadata)

## Archivos Creados/Modificados

### **Nuevos:**
- `src/services/chat/types.ts` - Interfaces comunes
- `src/services/chat/openai.ts` - Proveedor OpenAI
- `src/services/chat/anthropic.ts` - Proveedor Anthropic
- `src/services/chat/google.ts` - Proveedor Google AI
- `src/services/chat/openrouter.ts` - Proveedor OpenRouter
- `src/services/chat/index.ts` - Gestión centralizada

### **Modificados:**
- `src/stores/chatStore.ts` - Integración multi-proveedor

## Beneficios

- ✅ **Chat funcional** con todos los proveedores principales
- ✅ **Streaming consistente** en toda la aplicación
- ✅ **Manejo específico** de características únicas por proveedor
- ✅ **Escalabilidad** fácil para agregar nuevos proveedores
- ✅ **Error handling** robusto y específico
- ✅ **Configuración integrada** con el sistema existente

## Consideraciones de Seguridad

### **API Keys**
- Almacenadas en `aiConfigStore` con persistencia
- Validadas antes de cada llamada
- No se exponen en logs (solo se logean longitudes)

### **Rate Limiting**
- Cada proveedor maneja sus propios límites
- Errores HTTP específicos se propagan correctamente
- Timeouts configurables por proveedor

## Testing Recomendado

### **Para cada proveedor:**
1. **Configurar API key** válida
2. **Activar proveedor** y testear conexión
3. **Seleccionar modelo** y enviarlo al chat
4. **Verificar streaming** funciona correctamente
5. **Probar manejo de errores** (API key inválida, modelo inexistente)

### **Casos edge:**
- API key vacía o inválida
- Proveedor desactivado
- Modelo no soportado
- Network errors
- Rate limiting

## Próximos Pasos Sugeridos

1. **Configuración avanzada:** Temperature, max_tokens por proveedor
2. **Cache de respuestas:** Para mejorar performance
3. **Métricas de uso:** Tracking de tokens y costos
4. **Fallback providers:** Sistema de respaldo automático
5. **Custom prompts:** Sistema prompts por proveedor