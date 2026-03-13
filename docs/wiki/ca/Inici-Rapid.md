# Guia d'Inici Ràpid

Benvingut a Boorie! Aquesta guia t'ajudarà a començar amb el client d'escriptori AI avançat per a enginyers hidràulics en només uns minuts.

## Primer Llançament

### 1. Iniciar Boorie
- **macOS**: Obre la carpeta Aplicacions i fes doble clic a Boorie.app
- **Windows**: Fes doble clic a Boorie.exe
- **Linux**: Executa `./boorie` des del directori d'instal·lació

### 2. Assistent de Configuració Inicial
Al primer llançament, Boorie et guiarà a través del procés de configuració:

1. **Pantalla de Benvinguda**: Introducció a les funcions de Boorie
2. **Selecció d'Idioma**: Tria el teu idioma preferit (EN/ES/CA)
3. **Configuració de Proveïdor AI**: Configura els teus proveïdors AI (opcional)
4. **Configuració WNTR**: Configura l'entorn Python per a anàlisi hidràulica
5. **Consentiment d'Analítiques**: Tria les teves preferències de privacitat

## Configurar Proveïdors AI

### Configuració Ràpida
1. Fes clic a **Ajustos** a la cantonada superior dreta
2. Navega a la pestanya **Proveïdors AI**
3. Tria el teu proveïdor preferit:

#### OpenAI (Recomanat per a principiants)
```
API Key: sk-your-openai-api-key
Model: gpt-4-turbo-preview
```

#### Anthropic Claude (Millor per a escriptura tècnica)
```
API Key: sk-ant-your-anthropic-key
Model: claude-3-sonnet-20240229
```

#### Google Gemini (Bo per a anàlisi multimodal)
```
API Key: your-google-api-key
Model: gemini-pro
```

#### OpenRouter (Accés a múltiples models)
```
API Key: sk-or-your-openrouter-key
Model: anthropic/claude-3-sonnet
```

#### Ollama (AI Local, enfocat a la privacitat)
```
URL: http://localhost:11434
Model: llama2 (o qualsevol model local)
```

### Provar Connexió AI
1. Fes clic a **Provar Connexió** al costat del teu proveïdor configurat
2. Hauries de veure una marca verda si és exitós
3. Si falla, verifica la teva clau API i la connexió de xarxa

## El Teu Primer Projecte Hidràulic

### 1. Crear un Nou Projecte
1. Fes clic a **Nou Projecte** al panell principal
2. Omple els detalls del projecte:
   - **Nom**: La Meva Primera Xarxa d'Aigua
   - **Tipus**: Sistema de Distribució d'Aigua
   - **Ubicació**: La teva ciutat/regió
   - **Descripció**: Aprenent els conceptes bàsics de Boorie

3. Fes clic a **Crear Projecte**

### 2. Importar una Xarxa d'Exemple
Boorie inclou arxius EPANET d'exemple per a l'aprenentatge:

1. Fes clic a **Importar Xarxa** al teu projecte
2. Navega a la carpeta `test-files/` a la instal·lació
3. Selecciona `simple-network.inp` o `mexico-city-network.inp`
4. Fes clic a **Obrir**

### 3. Visualitzar la Xarxa
Després d'importar:
1. La xarxa apareixerà al **Visor de Xarxa**
2. Usa el ratolí per:
   - **Desplaçar**: Fes clic i arrossega
   - **Zoom**: Roda del ratolí o gest de pessic
   - **Seleccionar**: Fes clic als nodes o canonades
3. Prova diferents modes de vista:
   - **Vista Topològica**: Disseny esquemàtic
   - **Vista Geogràfica**: Basada en mapa (si hi ha coordenades disponibles)

## Executar la Teva Primera Anàlisi

### 1. Simulació Hidràulica Bàsica
1. Fes clic a **Anàlisi** -> **Simulació Hidràulica**
2. Configura els ajustos de simulació:
   - **Durada**: 24 hores (predeterminat)
   - **Pas de Temps**: 1 hora
   - **Solucionador**: EPANET (predeterminat)
3. Fes clic a **Executar Simulació**

### 2. Veure Resultats
Després que la simulació es completi:
1. El **Panell de Resultats** s'obre automàticament
2. Explora diferents tipus de resultats:
   - **Pressió**: Valors de pressió als nodes
   - **Cabal**: Taxes de flux a les canonades
   - **Velocitat**: Velocitats de flux
   - **Pèrdua de Càrrega**: Pèrdues per fricció

### 3. Exportar Resultats
1. Fes clic a **Exportar** al panell de Resultats
2. Tria el format:
   - **JSON**: Per a anàlisi addicional
   - **CSV**: Per a aplicacions de fulls de càlcul
   - **PDF**: Per a informes

## Xatejar amb AI Sobre la Teva Xarxa

### 1. Obrir Xat AI
1. Fes clic a la icona de **Xat** a la barra lateral esquerra
2. Selecciona el teu proveïdor AI configurat
3. Inicia una conversa sobre el teu projecte hidràulic

### 2. Preguntes d'Exemple per Provar
```
Analitza la distribució de pressió en aquesta xarxa
```

```
Quins són els possibles problemes amb la canonada P-101?
```

```
Suggereix millores per a l'eficiència de la bomba
```

```
Genera un informe resum per a aquesta anàlisi
```

### 3. Respostes Conscients del Context
Boorie proporciona automàticament context sobre:
- Dades actuals de la xarxa
- Resultats recents de simulació
- Especificacions del projecte
- Estàndards regionals (si estan configurats)

## Càlculs Bàsics

### 1. Calculadora de Dimensionament de Canonades
1. Navega a **Eines** -> **Calculadora Hidràulica**
2. Selecciona **Dimensionament de Canonades**
3. Introdueix paràmetres:
   - **Cabal**: 100 L/s
   - **Límit de Velocitat**: 2.0 m/s
   - **Material**: PVC
4. Fes clic a **Calcular**
5. Revisa el diàmetre de canonada recomanat

### 2. Selecció de Bomba
1. Selecciona la calculadora de **Selecció de Bomba**
2. Introdueix els requisits del sistema:
   - **Cabal**: 150 L/s
   - **Altura**: 50 m
   - **Eficiència**: 80%
3. Visualitza la corba de la bomba i els requisits de potència

### 3. Dimensionament de Dipòsit
1. Tria la calculadora de **Volum de Dipòsit**
2. Especifica els patrons de demanda i requisits d'emmagatzematge
3. Obtén les dimensions optimitzades del dipòsit

## Gestió de Projectes

### 1. Afegir Documents
1. Ves a **Projecte** -> **Documents**
2. Fes clic a **Pujar Document**
3. Afegeix arxius rellevants:
   - Especificacions tècniques
   - Plànols de disseny
   - Documents regulatoris
   - Fotos

### 2. Col·laboració en Equip
1. Navega a **Projecte** -> **Equip**
2. Afegeix membres de l'equip amb adreces de correu electrònic
3. Estableix permisos:
   - **Visor**: Accés de només lectura
   - **Editor**: Pot modificar el projecte
   - **Administrador**: Control total del projecte

### 3. Control de Versions
1. Tots els canvis es rastregen automàticament
2. Visualitza l'historial del projecte a **Projecte** -> **Historial**
3. Restaura versions anteriors si cal

## Personalització

### 1. Ajustos d'Idioma
1. Ves a **Ajustos** -> **General**
2. Selecciona el teu idioma preferit:
   - **English**: Estàndards internacionals
   - **Español**: Estàndards llatinoamericans
   - **Català**: Estàndards europeus

### 2. Estàndards Regionals
1. Navega a **Ajustos** -> **Estàndards**
2. Tria la teva regió:
   - **Mèxic**: Estàndards NOM
   - **Colòmbia**: Regulacions tècniques
   - **Espanya**: Estàndards UNE
   - **Internacional**: Estàndards ISO

### 3. Tema i Visualització
1. **Ajustos** -> **Aparença**
2. Tria tema:
   - **Clar**: Tema professional predeterminat
   - **Fosc**: Reducció de fatiga visual
   - **Auto**: Segueix la preferència del sistema

## Solucions Ràpides de Problemes

### Problemes Comuns

#### El Proveïdor AI No Respon
1. Verifica la connexió a internet
2. Comprova que la clau API sigui correcta
3. Verifica l'estat del servei del proveïdor
4. Prova amb un proveïdor diferent

#### L'Anàlisi WNTR Falla
1. Verifica l'entorn Python: `./check-python-wntr.js`
2. Comprova el format de l'arxiu de xarxa
3. Busca dades invàlides de nodes/canonades
4. Prova primer amb un arxiu d'exemple

#### La Xarxa No Es Mostra
1. Verifica el format de l'arxiu (ha de ser .inp)
2. Comprova que existeixin dades de coordenades
3. Intenta fer zoom cap enfora (la xarxa pot ser molt petita/gran)
4. Busca errors d'importació a la consola

#### Problemes de Rendiment
1. Tanca aplicacions innecessàries
2. Verifica la RAM disponible (4GB mínim)
3. Redueix la mida de la xarxa per a proves
4. Desactiva funcions innecessàries temporalment

### Obtenir Ajuda
- [Documentació Completa](Home.md)
- [Reportar Problemes](https://github.com/Boorie-AI/boorie_cliente/issues)
- [Xat de la Comunitat](https://discord.gg/boorie)
- [Suport per Email](mailto:support@boorie.com)

## Propers Passos

### Explorar Funcions Avançades
1. **[Integració WNTR](Integracio-WNTR.md)**: Aprofundeix en l'anàlisi de xarxes d'aigua
2. **[Integració AI](Integracio-IA.md)**: Fluxos de treball avançats amb AI
3. **[Gestió de Projectes](Gestio-Projectes.md)**: Gestió de projectes complexos

### Aprèn Enginyeria Hidràulica amb Boorie
1. **[Càlculs d'Enginyeria](Calculs-Enginyeria.md)**: Referència de fórmules
2. **[Estàndards Regionals](Estandards-Regionals.md)**: Guies de compliment
3. **[Millors Pràctiques](Millors-Practiques.md)**: Fluxos de treball professionals

### Uneix-te a la Comunitat
1. **[Contribuir](Contribuir.md)**: Ajuda a millorar Boorie
2. **[Discussions](https://github.com/Boorie-AI/boorie_cliente/discussions)**: Fes preguntes
3. **[Discord](https://discord.gg/boorie)**: Suport de la comunitat en temps real

---

**Felicitats!** Has completat la guia d'inici ràpid. Ara estàs preparat per utilitzar Boorie en projectes professionals d'enginyeria hidràulica.

**Temps estimat de finalització**: 15-30 minuts

**El que has après**:
- Navegació bàsica de Boorie
- Configuració de proveïdor AI
- Creació i gestió de projectes
- Importació i visualització de xarxes
- Conceptes bàsics de simulació hidràulica
- Anàlisi amb assistència AI
- Solució de problemes bàsica
