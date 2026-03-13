# Guia d'Integració AI

Boorie integra múltiples proveïdors AI per oferir assistència conscient del context per a tasques d'enginyeria hidràulica. Aquesta guia cobreix la configuració, l'ús i els fluxos de treball avançats.

## Proveïdors AI Suportats

### Models OpenAI GPT
**Ideal per a**: Consultes generals d'enginyeria hidràulica, generació de codi, documentació

- **Models**: GPT-4 Turbo, GPT-4, GPT-3.5 Turbo
- **Fortaleses**: Coneixement ampli, excel·lent raonament, generació de codi
- **Casos d'Ús**: Càlculs de disseny, resolució de problemes, documentació

### Anthropic Claude
**Ideal per a**: Escriptura tècnica, anàlisi complex, compliment regulatori

- **Models**: Claude-3 Opus, Claude-3 Sonnet, Claude-3 Haiku
- **Fortaleses**: Precisió tècnica, context extens, enfocat a la seguretat

### Google Gemini
**Ideal per a**: Anàlisi multimodal, interpretació de dades visuals

- **Models**: Gemini Pro, Gemini Pro Vision
- **Fortaleses**: Capacitats multimodals, integració amb serveis de Google

### OpenRouter
**Ideal per a**: Accés a múltiples models, optimització de costos

- **Models**: Tots els models principals a través d'una API
- **Fortaleses**: Varietat de models, preus competitius, API unificada

### Ollama (AI Local)
**Ideal per a**: Projectes sensibles a la privacitat, ús sense connexió

- **Models**: Llama 2, Mistral, CodeLlama, models personalitzats
- **Fortaleses**: Privacitat total, sense costos d'API, personalitzable

## Configuració

### 1. Configuració de Proveïdors

#### Als Ajustos de l'Aplicació
1. Navega a **Ajustos** -> **Proveïdors AI**
2. Fes clic a **Afegir Proveïdor**
3. Selecciona el tipus de proveïdor
4. Introdueix les credencials API
5. Prova la connexió
6. Estableix com a predeterminat (opcional)

#### Variables d'Entorn
```env
# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-4-turbo-preview

# Anthropic
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
ANTHROPIC_MODEL=claude-3-sonnet-20240229

# Google
GOOGLE_API_KEY=your-google-api-key
GOOGLE_MODEL=gemini-pro

# OpenRouter
OPENROUTER_API_KEY=sk-or-your-openrouter-key
OPENROUTER_MODEL=anthropic/claude-3-sonnet

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2:7b
```

### 2. Paràmetres del Model

#### Ajustos de Temperatura
- **0.0-0.2**: Càlculs precisos, respostes factuals
- **0.3-0.7**: Equilibri entre creativitat i precisió
- **0.8-1.0**: Solucions creatives, pluja d'idees

#### Gestió de Finestra de Context
- **Context Curt** (1K-4K tokens): Càlculs ràpids
- **Context Mitjà** (8K-16K tokens): Anàlisi estàndard
- **Context Llarg** (32K+ tokens): Informes exhaustius

## Interfície de Xat

### 1. Xat Bàsic
```
Usuari: Calcula la pèrdua per fricció en una canonada de 300mm de diàmetre amb 150 L/s de cabal

AI: T'ajudaré a calcular la pèrdua per fricció de la teva canonada.

Paràmetres donats:
- Diàmetre de canonada: 300 mm (0.3 m)
- Cabal: 150 L/s (0.15 m³/s)

Usant l'equació de Darcy-Weisbach:
hf = f × (L/D) × (V²/2g)

Primer, calculem la velocitat:
Àrea = π × (D/2)² = π × (0.15)² = 0.0707 m²
Velocitat = Q/A = 0.15/0.0707 = 2.12 m/s

[Continua amb càlcul detallat...]
```

### 2. Respostes Conscients del Context
Boorie proporciona context automàtic sobre:

#### Dades del Projecte Actual
- Topologia de xarxa i components
- Resultats recents de simulació
- Especificacions i restriccions del projecte

#### Estàndards Regionals
- Regulacions i codis locals
- Especificacions de materials
- Requisits de seguretat

#### Historial de Càlculs
- Resultats d'anàlisi previs
- Variacions de paràmetres
- Suggeriments d'optimització

### 3. Funcions Avançades de Xat

#### Conversacions Multi-torn
```
Usuari: Analitza la distribució de pressió a Xarxa-01

AI: He analitzat la distribució de pressió a la teva xarxa. Aquests són els resultats principals:

1. Pressió mínima: 15.2 m al Node J-45
2. Pressió màxima: 87.3 m al Node J-12
3. 3 nodes per sota de la pressió mínima (20 m)

Vols que suggereixi solucions per a les àrees de baixa pressió?

Usuari: Sí, enfoca't en les solucions més rendibles

AI: Basant-me en una anàlisi de rendibilitat, aquestes són les meves recomanacions:

1. Instal·lar bomba de reforç al Node J-40 (€15,000)
   - Beneficis: Millora la pressió per a 12 nodes
   - ROI: 3.2 anys

2. Augmentar diàmetre de canonada de J-23 a J-45 (€8,500)
   - Beneficis: Redueix pèrdua de càrrega en 8.3 m
   - ROI: 2.1 anys (recomanat)
```

## Eines Potenciades per AI

### 1. Assistent de Disseny Intel·ligent

#### Optimització de Dimensionament de Canonades
```
Usuari: Optimitza les mides de canonada per a cost mínim mantenint 20m de pressió mínima

Resposta AI:
Cost actual de la xarxa: €145,230
Cost optimitzat de la xarxa: €128,940 (reducció del 11.3%)

Canvis recomanats:
- Canonada P-01: 400mm → 350mm (estalvi €3,200)
- Canonada P-15: 250mm → 300mm (cost €2,100, millora pressió)
- Canonada P-23: 200mm → 250mm (cost €1,800, elimina coll d'ampolla)

Estalvi net: €16,290
```

### 2. Analítica Predictiva

- Anàlisi de consum històric
- Projeccions de creixement poblacional
- Models d'envelliment de components
- Optimització del consum energètic

### 3. Compliment Regulatori

#### Verificació d'Estàndards
```
Usuari: Verifica el compliment NOM-127-SSA1 per a connexions residencials

Resposta AI:
Anàlisi de Compliment NOM-127-SSA1:

COMPLEIX:
- Pressió mínima: 22.5 m (requerit: 20 m)
- Pressió màxima: 48.3 m (límit: 50 m)
- Continuïtat del servei: 99.2% (requerit: 95%)

ATENCIÓ REQUERIDA:
- Clor residual: 0.18 mg/L al Node J-67 (mín: 0.2 mg/L)

RECOMANACIONS:
1. Instal·lar cloració automàtica al Node J-60
2. Revisar sistema de filtració a la Planta WTP-01
```

## Seguretat i Privacitat

### 1. Protecció de Dades
- Claus API encriptades amb el clauer del SO
- Dades del projecte mai enviades a proveïdors AI sense consentiment
- Opcions de processament local disponibles
- Compliment GDPR/CCPA

### 2. Controls de Privacitat

```typescript
{
  shareProjectData: false,
  shareCalculationInputs: true,
  shareResults: false,
  anonymizeQueries: true,
  localProcessingOnly: false
}
```

## Millors Pràctiques

### 1. Disseny de Consultes
- Ser específic sobre requisits i restriccions
- Incloure context rellevant (unitats, estàndards, ubicació)
- Demanar explicacions pas a pas
- Sol·licitar múltiples alternatives de solució

### 2. Selecció de Model
- **Càlculs ràpids**: GPT-3.5 Turbo, Claude Haiku
- **Anàlisi complex**: GPT-4, Claude Sonnet/Opus
- **Anàlisi visual**: Gemini Pro Vision
- **Sensible a la privacitat**: Models locals d'Ollama

### 3. Optimització de Costos
- Usar context més curt per a consultes simples
- Guardar en caché càlculs sol·licitats freqüentment
- Agrupar consultes similars
- Monitoritzar ús amb analítiques

### 4. Assegurament de Qualitat
- Sempre verificar càlculs AI de forma independent
- Creuar referències amb estàndards i regulacions
- Revisar suggeriments amb enginyers experimentats
- Mantenir el judici professional en la presa de decisions

---

**Propers Passos**: Explora [Integració WNTR](Integracio-WNTR.md) per combinar les perspectives d'AI amb modelat hidràulic avançat.
