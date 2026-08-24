# Boorie - Client d'Escriptori AI Avançat per a Enginyers Hidràulics

![Logo de Boorie](resources/icon.png)

**Boorie** és un client d'escriptori AI especialitzat dissenyat específicament per a enginyers hidràulics. Construït amb tecnologies web modernes i integrat amb capacitats AI avançades, combina xat AI multiproveïdors amb eines especialitzades d'enginyeria hidràulica, integració WNTR per a anàlisi de xarxes d'aigua i funcions completes de gestió de projectes.

## 🎯 Característiques Principals

### 🤖 Integració AI Multiproveïdors
- **Proveïdors Suportats**: OpenAI, Anthropic Claude, Google Gemini, OpenRouter, Ollama
- **Context Especialitzat**: Experiència en el domini d'enginyeria hidràulica
- **Sistema RAG**: Recuperació de coneixement de documentació tècnica i regulacions
- **Respostes Conscients del Context**: Processament de consultes específiques d'enginyeria

### 🔧 Eines d'Enginyeria Hidràulica
- **Integració WNTR**: Anàlisi amb Water Network Tool for Resilience
- **Anàlisi de Xarxes**: Carregar i visualitzar fitxers EPANET (.inp)
- **Simulacions Hidràuliques**: Executar simulacions completes de sistemes d'aigua
- **Motor de Càlcul**: Dimensionat de canonades, selecció de bombes, càlculs de volum de dipòsits
- **Compliment Normatiu**: Suport per a múltiples estàndards regionals

### 📊 Analítiques Avançades
- **Microsoft Clarity**: Analítiques completes de comportament de l'usuari
- **Seguiment de Rendiment**: Seguiment especialitzat per a càlculs hidràulics
- **Monitoratge d'Errors**: Seguiment i informe d'errors en temps real
- **Perspectives d'Ús**: Analítiques detallades per a fluxos de treball d'enginyeria

### 🌐 Visualització de Xarxes
- **Diagrames Interactius**: Integració vis-network per a xarxes hidràuliques
- **Vistes Geogràfiques**: Integració Mapbox per a anàlisi espacial
- **Topologia de Xarxa**: Anàlisi de connectivitat i components
- **Actualitzacions en Temps Real**: Visualització dinàmica de resultats de simulació

### 🗂️ Gestió de Projectes
- **Projectes Hidràulics**: Crear i gestionar projectes d'enginyeria
- **Gestió de Documents**: Pujar i organitzar documents tècnics
- **Col·laboració en Equip**: Suport de projectes multiusuari
- **Control de Versions**: Seguiment de canvis i historial de projectes

## 📦 Descarregar i Instal·lar

### 🚀 Última Versió - v1.21.1

| Plataforma | Arquitectura | Descàrrega | Mida |
|------------|-------------|------------|------|
| 🍎 **macOS** | ARM64 (M1/M2/M3) | [Boorie-1.21.1-arm64.dmg](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.21.1/Boorie-1.21.1-arm64.dmg) | ~279 MB |
| 🪟 **Windows** | x64 | [Boorie-Setup-1.21.1.exe](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.21.1/Boorie-Setup-1.21.1.exe) | ~223 MB |
| 🐧 **Linux** | x64 | [Boorie-1.21.1.AppImage](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.21.1/Boorie-1.21.1.AppImage) | ~344 MB |



### 📝 Novetats a v1.21.1
- Simular just després d'obrir una xarxa desada fallava: la xarxa apareixia a l'instant però preparar-la per simular triga una mica més, i en aquell buit l'aplicació deia que no hi havia cap fitxer carregat. Ja espera el que hagi d'esperar.
- Si preparar la xarxa falla, ara es diu: abans no hi havia manera de saber que la podies veure però no simular.
- Mentre simulava es dibuixaven dues barres de progrés en lloc d'una.
- Corregides les instruccions d'instal·lació d'aquest README, que manaven descarregar la versió 1.15.0.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.21.1).

### 📝 Novetats a v1.21.0
- El quadre amb les xifres d'un node o d'una canonada ja segueix el control temporal: abans es quedava amb les del moment en què el vas obrir, així que podien no tenir res a veure amb l'instant que estaves mirant.
- La fitxa d'una canonada al mapa mostra també la velocitat, que ja es calculava i no es mostrava.
- El botó «Simulate» del visor calculava i no es veia el resultat: no arribava a la barra de temps, ni als colors de la xarxa, ni al plafó de resultats. Ja hi arriba, i calcula la simulació completa en el temps en lloc de només l'instant inicial.
- Es retira el botó de carregar un fitxer `.inp` de la capçalera del visor: era al costat de la xarxa que ja s'està veient i només duia a confusió. Quan no hi ha cap xarxa carregada, el visor continua oferint carregar-la al centre.
- Corregit un consum de memòria del mapa: acumulava una còpia més dels seus detectors de clic amb cada canvi de pas o d'ajustos.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.21.0).

### 📝 Novetats a v1.20.2
- A Linux l'aplicació obria sense base de dades: no apareixien els projectes, ni les xarxes, ni les converses. Ja està arreglat.
- El paquet triava un component compilat per a Alpine, que no es pot carregar a Ubuntu, Debian ni Fedora; ara tria el que correspon al teu sistema i el comprova abans d'usar-lo.
- Si feies servir l'AppImage i no veies les teves dades, no s'havien perdut: el fitxer no es va arribar a obrir mai.
- L'instal·lador ja no porta bases de dades a dins: només s'empaqueta la definició de les taules.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.20.2).

### 📝 Novetats a v1.20.1
- Manteniment de seguretat: no canvia res del que veus, no hi ha funcions noves ni canvis de comportament.
- S'actualitzen les dependències amb vulnerabilitats conegudes: 23 a zero, dues de crítiques.
- Electron passa a 42.9.3, que porta els pedaços de seguretat de Chromium.
- Abans de publicar-la es va comprovar que l'actualització automàtica des de la 1.20.0 segueix funcionant i que l'aplicació arrenca, carrega una xarxa i simula igual que abans.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.20.1).

### 📝 Novetats a v1.20.0
- Cada mesura d'eficiència energètica es pot marcar com a útil o incorrecta, al panell i al xat.
- Si la marques com a incorrecta pots explicar per què, i aquesta explicació és el més valuós que es guarda.
- El que valores queda guardat al costat de la simulació que va avalar la xifra, així que la valoració es pot llegir sencera.
- Al tornar al panell, les mesures ja valorades apareixen marcades en lloc de preguntar-t'ho una altra vegada.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.20.0).

### 📝 Novetats a v1.19.0
- Pregunta-li «com puc reduir el consum energètic del bombament?» i et proposa mesures, simulant-ne cadascuna abans de donar-te una xifra.
- Cada estalvi cita la simulació que l'avala, guardada a l'historial del projecte.
- També et diu què costa tenir una bomba fora del seu punt òptim, simulant la mateixa xarxa amb aquesta bomba al millor punt de la seva corba.
- Les mesures que no funcionen també es mostren amb la seva xifra: aturar el bombament a les hores cares consumeix més en algunes xarxes.
- Corregit un error dels escenaris de la v1.18.0: en una xarxa on els automatismes governen el bombament, aturar una bomba no tenia efecte i l'escenari deia que no passava res. Si ho vas simular, torna-ho a llançar.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.19.0).

### 📝 Novetats a v1.18.0
- Escenaris d'interrupció del servei: trencament de canonada, bomba fora de servei, pèrdua del control dels automatismes, sobredemanda per incendi o sequera a l'origen, combinables entre si.
- Pregunta-ho al xat: «quants clients queden sense servei si es perd el control de les bombes 4 hores?». Boorie proposa l'escenari, l'ensenya sencer i espera la teva confirmació: res no se simula sense el teu vistiplau.
- Les xifres surten de la simulació i la resposta cita l'execució que les avala, així que pots anar-hi des de l'historial del projecte.
- L'impacte es mesura contra la teva xarxa sense l'esdeveniment: el dèficit que ja arrossegava no s'atribueix a l'escenari.
- Consum i cost de bombament per bomba, amb el repartiment entre hores punta i vall segons la tarifa del teu projecte.
- Boorie assenyala la bomba que treballa fora del seu punt òptim, comparant amb la corba d'eficiència del teu propi fitxer.
- I pots comprovar si una mesura estalvia de veritat: se simula la xarxa amb ella i es resta, amb el que li costa al servei.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.18.0).

### 📝 Novetats a v1.17.1
- Si preguntaves per les teves simulacions i Boorie contestava «no hi ha dades», ja està resolt: la cerca triga una sisena part i el xat cita els documents d'on treu cada dada.
- La cerca del Wisdom Center ja no diu «no he trobat informació» quan sí que l'ha trobada: si no acaba de redactar a temps, ho diu i enumera les fonts localitzades.
- El «Max Results» del selector de coneixement per fi fa alguna cosa, i ve a 3.
- La comprovació de seguretat sobre el que es recupera torna a funcionar: abans es quedava a mitges per manca de temps i rebutjava documents que sí que responien.
- Boorie espera el que calgui per respondre: fins a tres minuts per les fonts i vuit per la resposta completa.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.17.1).

### 📝 Novetats a v1.17.0
- El desplegable de models desapareix del xat: les respostes les escriu sempre el model que Boorie té fixat per a enginyeria hidràulica.
- Dos papers, cadascun amb el seu model: un raona sobre el que es recupera i redacta; l'altre, més ràpid, reformula la pregunta i decideix quins documents serveixen.
- Si el model principal no està disponible respon l'auxiliar, i la resposta ho diu, en lloc de quedar-se sense contestar.
- A sota de cada resposta ja no apareix el nom del model: queda registrat per a diagnòstic.
- La primera instal·lació descarrega 2,7 GB en lloc de 24 GB, i una resposta que trigava uns 45 minuts en un equip sense targeta gràfica dedicada surt ara en dos i mig.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.17.0).

### 📝 Novetats a v1.16.0
- Els ajustos d'indexació de simulacions es poden fixar per projecte, no només per a tot Boorie: a Configuració → General tries si toques els generals o els del projecte actiu.
- Útil quan un projecte es regeix per una normativa diferent o és en una etapa d'ajust fi.
- Un projecte hereta fins que el toques: mentre no canviïs res en el seu àmbit, segueix els ajustos generals.
- «Tornar a heretar» desfà aquesta separació i torna el projecte als ajustos generals.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.16.0).

### 📝 Novetats a v1.15.1
- Si Boorie no et deixava obrir ni llistar les xarxes d'un projecte, ja està resolt: a les instal·lacions els faltaven tres columnes que l'aplicació donava per fetes des de la v1.6.0.
- Les teves dades no es van perdre mai: les xarxes, les seves versions i les seves simulacions continuaven desades i es reparen soles en obrir aquesta versió.
- Afectava qui instal·lés de zero i qui actualitzés des d'una versió anterior a la v1.6.0.
- La pestanya de guardrails torna a poder llistar les violacions registrades.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.15.1).

### 📝 Novetats a v1.15.0
- Cada simulació deixa constància en el coneixement del projecte: resum de l'execució, estadístiques, elements fora de llindar i en què ha canviat respecte a l'anterior.
- Pregunta al xat «quins problemes va trobar l'última simulació?» i respon amb les anomalies reals, citant l'execució d'on surten.
- No es jutja la pressió d'embassaments ni dipòsits, que per definició no en tenen.
- Els llindars són ajustables —14 a 70 m de pressió i 3 m/s de velocitat per defecte— perquè la referència normativa canvia segons el país.
- La simulació no espera la indexació: si falla, l'execució continua sent vàlida i es reintenta des de l'historial de la xarxa.
- En esporgar una versió de xarxa se'n van també els documents indexats.
- L'agent torna a citar el coneixement indexat: s'han corregit quatre errors que deixaven la cerca a zero sense dir-ho.
- L'historial de xarxa i els ajustos que faltaven ja són en anglès i català, amb les dates en el format de cada idioma.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.15.0).

### 📝 Novetats a v1.14.0
- El Wisdom Center distingeix l'àmbit **general** —normativa i bones pràctiques, compartides— de l'**àmbit del projecte**, amb els seus documents interns.
- Un document d'un projecte no apareix a les cerques d'un altre, en cap manera.
- Des d'un projecte continues veient la normativa general: l'herència va en un sol sentit.
- Cada document diu d'on ve, per no confondre una norma amb un document intern del teu client.
- Pujar a l'àmbit d'un projecte és una decisió explícita, no un descuit.
- Els teus documents actuals queden a l'àmbit general sense perdre res ni reindexar.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.14.0).

### 📝 Novetats a v1.13.0
- Reimportar un `.inp` corregit ja no destrueix l'anterior: Boorie congela l'estat que hi havia i el deixa a l'historial.
- Cada xarxa té el seu historial de versions, amb nota, fites, comparació amb l'anterior i restauració. Restaurar desa abans l'estat actual.
- Instantànies del projecte sencer, per tornar a l'estat d'un lliurament.
- Cada simulació queda lligada a la versió amb què es va executar, i pots comparar dues execucions.
- Pots exportar una versió o una instantània a un fitxer i obrir-la en una altra instal·lació de Boorie; el paquet es comprova en importar-lo.
- La neteja de l'historial es configura a Configuració → General.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.13.0).

### 📝 Novetats a v1.12.0
- El control temporal marca el temps real de la teva simulació: si el teu model reporta cada 15 minuts, el rellotge avança 15 minuts per pas. Abans sumava una hora fixa i la data no sortia de cap dada.
- Sense hora declarada al `.inp`, el temps es mostra transcorregut (`+04:15:00`) en comptes de fingir una hora del dia.
- Moure la barra repinta el mapa; abans els colors es quedaven al primer pas.
- Pots acolorir la xarxa per pressió, demanda, cabal o velocitat, amb la llegenda del rang real de la teva xarxa.
- Pots encendre i apagar la xarxa per tipus d'element, amb el comptador de cadascun.
- En prémer «Simulacions» sense xarxa, Boorie et diu que en cal una i et dona el botó per importar-la.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.12.0).

### 📝 Novetats a v1.11.0
- La teva xarxa es pot veure com a **esquema** encara que no es pugui situar al mapa: una xarxa sense coordenades, o amb un sistema que ningú ha declarat, ja no es queda sense cap vista.
- Si el teu `.inp` porta coordenades de dibuix en comptes de coordenades reals, Boorie t'ho diu en comptes de convidar-te a declarar un EPSG que plantaria la teva xarxa en un altre continent.
- Tots els ajustos del mapa són en un sol tauler. Abans eren en tres llocs i la majoria no arribava al dibuix.
- La vista de satèl·lit torna: estava desactivada per a tots els equips i el missatge culpava el teu sistema sense haver-lo mirat.
- Canviar el mapa base ja no esborra la teva xarxa, i amb la finestra maximitzada ja no es talla la fila de botons.
- El botó «Obrir» de la llista de projectes obre el projecte.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.11.0).

### 📝 Novetats a v1.10.0
- Boorie ja no endevina el sistema de coordenades de la teva xarxa: te'l pregunta. Un selector nou et deixa declarar l'EPSG —els 120 fusos UTM, MAGNA-SIRGAS de Colòmbia, ETRS89 i ED50 d'Espanya, ITRF2008 de Mèxic, o qualsevol codi que escriguis— i t'ensenya on caurà el centre de la xarxa abans que acceptis.
- Una xarxa sense sistema declarat ja no es dibuixa en un lloc inventat: el mapa et diu que falta declarar-lo i et dona el botó. Abans, qualsevol xarxa que no encaixés en els rangs amb què es va programar acabava pintada al Carib colombià sense avisar.
- Canviar l'EPSG recol·loca la xarxa a l'instant, sense tornar a carregar el `.inp`.
- Si la xarxa reprojectada cau fora del país del teu projecte, Boorie t'avisa: és la manera de caçar un fus equivocat abans de treballar sobre una ubicació falsa.
- Les coordenades del teu `.inp` no es toquen mai: la reprojecció existeix només per pintar el mapa.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.10.0).

### 📝 Novetats a v1.9.0
- El menú s'organitza en tres blocs: el que pertany al projecte actiu, les eines que funcionen sense ell i el del sistema. Abans era una llista plana on «Xarxa WNTR» era al mateix nivell que «Configuració».
- El nom del projecte on treballes és sempre a la vista, i d'ell pengen la seva xarxa, les seves simulacions i el seu xat. Sense projecte actiu aquests ítems no apareixen i el menú ho diu.
- «Projectes» t'ensenya sempre la teva llista, amb l'actiu marcat. Abans, amb un projecte obert, aquella pantalla mostrava el mateix que «Xarxa WNTR» i no hi havia manera de tornar a la llista sense tancar el projecte.
- El xat general i el xat del projecte són dues entrades diferents, cadascuna amb les seves converses.
- Sense projecte actiu, Boorie obre a Projectes; amb projecte, continua obrint on el vas deixar.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.9.0).

### 📝 Novetats a v1.8.0
- L'agent rep les dades reals de la xarxa carregada —nusos, dipòsits, canonades, longitud total, demanda i rang de diàmetres— en lloc d'un escarit «hi ha una xarxa carregada». Abans, a «com puc millorar el cabal al nus J3?» responia consells genèrics sobre netejar una junta mecànica, sense adonar-se que J3 és un nus de la teva xarxa.
- Pot consultar un nus o un tram concret quan l'hi preguntes, en comptes de respondre amb xifres aproximades. En una xarxa de 92 nusos el resum no cap sencer a la conversa, així que mira només allò que necessita per respondre't.
- La capçalera del xat indica quina xarxa està veient l'agent. Si no en veu cap, ho diu i t'explica que carreguis un arxiu .inp al projecte.
- Sense projecte obert, el xat respon amb coneixement general d'enginyeria hidràulica i amb la teva base de coneixement, però ja no descriu xarxes que no té al davant ni etziba exemples numèrics que es puguin confondre amb la teva.
- Quan el model que fas servir no admet consultes a la xarxa, l'agent ho sap i et diu que no ho pot mirar, en lloc d'estimar-ho.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.8.0).

### 📝 Novetats a v1.7.0
- Si entres a la xarxa hidràulica sense un projecte actiu, Boorie t'ho diu i t'ofereix triar-ne un. Abans et canviava la pantalla per la llista de projectes sense explicar per què.
- Els ítems del menú que necessiten alguna cosa apareixen atenuats i amb un cadenat, i et diuen què els falta. Es poden continuar prement, perquè arribis a la pantalla que t'ho resol.
- El tutorial de primer ús et porta ara a crear un projecte i carregar la teva xarxa, en lloc d'acabar a la calculadora.
- La calculadora continua funcionant sola, sense demanar-te cap projecte.
- Els noms del menú ja surten en el teu idioma: «Projects», «Calculator» i «WNTR Network» eren en anglès.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.7.0).

### 📝 Novetats a v1.6.0
- La simulació d'interrupció del servei diu ara a quanta gent deixa sense aigua: habitants afectats, en quins nusos, quant dura el dèficit i quanta aigua no arriba a lliurar-se.
- Tot surt de la mateixa execució: no cal llançar una segona simulació ni tornar a descriure l'avaria.
- Pots ajustar el mòdul de demanda de la teva zona en litres per habitant i dia, i el resultat es recalcula.
- Si indiques quants habitants té una escomesa, Boorie tradueix la població a nombre de clients afectats.
- Boorie separa el que causa l'avaria del que la xarxa ja tenia malament, i mostra ambdues xifres.
- Les simulacions d'interrupció passen a calcular-se amb demanda dependent de la pressió, el correcte quan falta aigua: abans un nus amb molt poca pressió es donava per ben servit i l'impacte sortia zero.
- **Fix**: les hores fora de servei podien superar la durada de la mateixa simulació.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.6.0).

### 📝 Novetats a v1.5.2
- Un únic projecte actiu per a tota l'aplicació: el xat, la xarxa i el Wisdom Center treballen sobre el mateix context.
- En tancar i reobrir Boorie es recupera l'últim projecte en què estaves.
- Si obres una conversa d'un altre projecte, Boorie avisa i et deixa triar, perquè l'assistent no respongui amb el context equivocat.
- Les teves xarxes i càlculs es guarden al projecte i no només en aquest equip. En actualitzar es traslladen sols, conservant les dades anteriors.
- Una xarxa guardada s'obre encara que hagis mogut o esborrat el fitxer .inp original.
- Els escenaris derivats d'una xarxa es poden guardar penjant d'ella, amb la seva pròpia carpeta de resultats. Encara es poden guardar com a projecte a part.
- **Fix**: en analitzar o simular podia fer-se servir una xarxa diferent de la mostrada en pantalla.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.5.2).

<details>
<summary>Novetats a v1.5.1</summary>

- L'arrencada de Python/WNTR a Windows sobreviu a un reinici: la ruta de l'entorn virtual es conserva entre sessions.
- L'assistent de preparació explica **per què** falla una instal·lació, en lloc de limitar-se a «verification-failed», i indica quin paquet falta.
- Rang admès limitat a **Python 3.10 – 3.13**: WNTR 1.5 no publica cap paquet per a la 3.14. Un entorn fora de rang es conserva i es recrea.
- **Fix**: «Reindexar» al Wisdom Center esborrava els fragments del document i reportava èxit sense recrear-los.
- Els indicadors de resiliència es presenten en taula amb encapçalaments, distingint l'escenari anterior del posterior a la interrupció simulada.
- Els nusos afectats per una interrupció del servei es ressalten sobre el mapa.
- La corba de fragilitat i els indicadors de resiliència es poden exportar a CSV.
- Nova secció **Quant a** a Configuració, amb la versió instal·lada i l'historial de versions (#30).
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.5.1).
</details>

<details>
<summary>Novetats a v1.5.0</summary>

- Noves rutines de resiliència al mòdul WNTR Network: esqueletització de xarxes, simulació d'interrupció del servei, indicadors de resiliència (índex de Todini, entropia de xarxa, redundància hidràulica) i corbes de fragilitat sísmica.
- **Fix #16**: la interfície es congelava en canviar el model d'IA d'indexació al Wisdom Center.
- **Fix #17**: el selector de projecte del Chat no aplicava la selecció, i el LLM no rebia context del projecte hidràulic vinculat.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.5.0).
</details>

<details>
<summary>Novetats a v1.4.3</summary>

- **Fix #15**: els projectes no apareixien al selector de projectes del Chat (un sol projecte amb dades corruptes buidava silenciosament tota la llista).
- **Fix #14**: documents del Wisdom Center encallats en "Not Indexed" a Windows (URL d'Ollama fixada a una IP de LAN en lloc de `localhost`).
- Refactorització del logger de backend i actualització de dependències.
- Vegeu les [notes completes de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.4.3).
</details>

📖 Documentació completa: [GitHub Wiki](https://github.com/Boorie-AI/boorie_cliente/wiki)

### Instruccions d'Instal·lació

#### macOS
1. Descarrega l'arxiu DMG de l'enllaç anterior
2. Obre l'arxiu DMG descarregat
3. Arrossega Boorie.app a la teva carpeta Aplicacions
4. Executa Boorie des d'Aplicacions

#### Linux
1. Descarrega `Boorie-1.21.1.AppImage` de l'enllaç anterior
2. Dona-li permisos d'execució: `chmod +x Boorie-1.21.1.AppImage`
3. Executa: `./Boorie-1.21.1.AppImage`

#### Windows
1. Descarrega `Boorie-Setup-1.21.1.exe` de l'enllaç anterior
2. Executa l'instal·lador i segueix l'assistent
3. Inicia Boorie des del Menú Inici o l'accés directe de l'Escriptori

### 🔗 Totes les Versions
Veure totes les versions disponibles: [**GitHub Releases**](https://github.com/Boorie-AI/boorie_cliente/releases)

## 🛠️ Configuració de Desenvolupament

### Requisits Previs
- Node.js 18+ i npm
- Python 3.10 – 3.13 amb pip (la 3.14 encara no serveix: WNTR no publica cap paquet per a ella)
- Git

### Instal·lació

1. **Clonar el repositori**
   ```bash
   git clone https://github.com/your-username/boorie_cliente.git
   cd boorie_cliente
   ```

2. **Instal·lar dependències**
   ```bash
   npm install
   ```

3. **Configurar entorn Python per a WNTR**
   ```bash
   ./setup-python-wntr.sh
   ```

4. **Configurar variables d'entorn**
   ```bash
   cp .env.example .env
   # Editar .env amb la teva configuració
   ```

5. **Inicialitzar base de dades**
   ```bash
   npm run db:generate
   npm run db:push
   ```

6. **Iniciar entorn de desenvolupament**
   ```bash
   npm run dev
   ```

## 🛠️ Desenvolupament

### Scripts Disponibles

| Comanda | Descripció |
|---------|-------------|
| `npm run dev` | Iniciar entorn de desenvolupament complet |
| `npm run dev:vite` | Només frontend (http://localhost:3000) |
| `npm run dev:electron` | Només Electron |
| `npm run build` | Construir frontend i Electron |
| `npm run build:app` | Crear paquets distribuïbles |
| `npm run dist` | Crear paquets distribuïbles (DMG/NSIS/AppImage) |
| `npm run lint` | Executar verificacions ESLint |
| `npm run lint:fix` | Auto-corregir problemes ESLint |
| `npm run typecheck` | Verificació de tipus TypeScript |

### Comandes de Base de Dades

| Comanda | Descripció |
|---------|-------------|
| `npm run db:generate` | Generar client Prisma |
| `npm run db:push` | Enviar canvis d'esquema |
| `npm run db:migrate` | Executar migracions de base de dades |

### Comandes Python/WNTR

| Comanda | Descripció |
|---------|-------------|
| `./setup-python-wntr.sh` | Configuració inicial entorn WNTR |
| `./activate-wntr.sh` | Activar entorn WNTR |
| `./run-with-wntr.sh` | Executar comandes en entorn WNTR |
| `./check-python-wntr.js` | Verificar instal·lació WNTR |

## 🏗️ Arquitectura

### Stack Tecnològic
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS
- **Gestió d'Estat**: Zustand + React Context
- **Components UI**: Primitius Radix UI
- **Backend**: Electron 28 + TypeScript + Prisma ORM
- **Base de Dades**: SQLite amb suport d'encriptació
- **Analítiques**: Integració Microsoft Clarity
- **Hidràulica**: Integració Python WNTR
- **Visualització**: vis-network + Mapbox
- **Build**: Vite + scripts de build Electron personalitzats

### Estructura del Projecte
```
boorie_cliente/
├── backend/              # Lògica de negoci backend
│   ├── models/           # Models de dades
│   └── services/         # Serveis principals
│       └── hydraulic/    # Serveis específics hidràulics
├── electron/             # Procés principal Electron
│   ├── handlers/         # Manejadors IPC per domini
│   └── services/         # Serveis del sistema
├── src/                  # Frontend React
│   ├── components/       # Components UI
│   │   ├── hydraulic/    # Components enginyeria hidràulica
│   │   └── ui/           # Components UI reutilitzables
│   ├── services/         # Serveis frontend
│   ├── stores/           # Gestió estat Zustand
│   └── types/            # Definicions TypeScript
├── prisma/               # Esquema base de dades
├── rag-knowledge/        # Base de coneixement hidràulic
│   ├── hydraulics/       # Documentació tècnica
│   ├── regulations/      # Estàndards regionals
│   └── best-practices/   # Guies d'indústria
└── venv-wntr/           # Entorn Python WNTR
```

## 🔧 Configuració

### Variables d'Entorn

Crear un fitxer `.env` al directori arrel:

```env
# Analítiques Microsoft Clarity
VITE_CLARITY_PROJECT_ID=el_teu_projecte_clarity_id
VITE_CLARITY_ENABLED=true

# Configuració Mapbox
VITE_MAPBOX_ACCESS_TOKEN=el_teu_token_mapbox
VITE_DEFAULT_MAP_LNG=-70.9
VITE_DEFAULT_MAP_LAT=42.35
VITE_DEFAULT_MAP_ZOOM=9

# Configuració Python
PYTHON_PATH=/ruta/a/python/amb/wntr

# Configuració OAuth (Opcional)
MS_CLIENT_ID=el_teu_microsoft_client_id
GOOGLE_CLIENT_ID=el_teu_google_client_id
GOOGLE_CLIENT_SECRET=el_teu_google_secret
```

### Configuració Proveïdors AI

Configura els teus proveïdors AI als ajustos de l'aplicació:

1. **OpenAI**: Requereix clau API
2. **Anthropic Claude**: Requereix clau API
3. **Google Gemini**: Requereix clau API
4. **OpenRouter**: Requereix clau API
5. **Ollama**: Requereix instal·lació local

## 🌊 Característiques d'Enginyeria Hidràulica

### Integració WNTR
- **Suport d'Arxius**: Importar/exportar arxius EPANET (.inp)
- **Tipus de Simulació**: Anàlisi hidràulic i de qualitat d'aigua
- **Anàlisi de Xarxa**: Topologia, connectivitat i anàlisi de components
- **Exportació de Resultats**: Format JSON amb dades completes

### Motor de Càlcul
- **Dimensionat de Canonades**: Equacions Darcy-Weisbach i Hazen-Williams
- **Anàlisi de Bombes**: Anàlisi de corbes i eines de selecció
- **Càlculs de Dipòsits**: Còmputs de volum i dimensionat
- **Pèrdua de Càrrega**: Càlculs complets de pèrdua per fricció

### Estàndards Regionals
- **Mèxic**: Normes NOM i regulacions
- **Colòmbia**: Estàndards tècnics i millors pràctiques
- **Espanya**: Normes UNE i regulacions
- **Internacional**: ISO i altres estàndards globals

## 📊 Analítiques i Monitoratge

### Integració Microsoft Clarity
- **Comportament de l'Usuari**: Seguiment complet d'interaccions
- **Mètriques de Rendiment**: Monitoratge de rendiment d'aplicació
- **Seguiment d'Errors**: Detecció i informe d'errors en temps real
- **Esdeveniments Personalitzats**: Seguiment especialitzat per a operacions hidràuliques

### Esdeveniments Rastrejats
- Càlculs i simulacions hidràuliques
- Operacions d'anàlisi WNTR
- Importacions i exportacions d'arxius
- Activitats de gestió de projectes
- Interaccions de xat AI
- Ocurrències d'errors i problemes del sistema

## 🔒 Característiques de Seguretat

- **Aïllament de Context**: Arquitectura Electron segura
- **Emmagatzematge Encriptat**: Encriptació de claus API i dades sensibles
- **Integració OAuth**: Autenticació segura amb proveïdors principals
- **Política de Seguretat de Contingut**: CSP estricta per a seguretat web
- **Seguretat IPC**: Comunicació inter-procés tipus-segura

## 🌍 Internacionalització

Suport per a múltiples idiomes:
- **Anglès** (predeterminat)
- **Espanyol (ES)**
- **Català (CA)**

La terminologia tècnica està localitzada per als estàndards d'enginyeria de cada regió.

## 🧪 Proves

### Arxius de Prova
- Arxius de prova WNTR a `test-files/`
- Guies de proves visuals incloses
- Xarxes d'exemple per a validació

### Executar Proves
```bash
# Proves de funcionalitat WNTR
python test-files/test-wntr-complete.py

# Amb entorn WNTR
./run-with-wntr.sh python test-files/test-wntr-complete.py
```

## 📦 Construcció i Distribució

### Build de Desenvolupament
```bash
npm run build
```

### Distribució de Producció
```bash
npm run dist
```

### Builds Específics per Plataforma
- **macOS**: Instal·lador DMG
- **Windows**: Instal·lador NSIS  
- **Linux**: AppImage

## 🤝 Contribuir

1. Fer fork del repositori
2. Crear branca de característica (`git checkout -b feature/caracteristica-increible`)
3. Commit de canvis (`git commit -m 'Afegir característica increïble'`)
4. Push a la branca (`git push origin feature/caracteristica-increible`)
5. Obrir Pull Request

### Guies de Desenvolupament
- Seguir millors pràctiques TypeScript
- Usar components UI existents de Radix UI
- Mantenir millors pràctiques de seguretat Electron
- Afegir proves per a nous càlculs hidràulics
- Actualitzar documentació per a noves característiques

## 📄 Llicència

Aquest projecte està llicenciat sota la Llicència MIT - veure l'arxiu [LICENSE](LICENSE) per a detalls.

## 🙏 Reconeixements

- **Equip WNTR**: Water Network Tool for Resilience
- **Equip Electron**: Aplicacions d'escriptori multiplataforma
- **Equip React**: Biblioteca d'interfície d'usuari
- **Comunitat d'Enginyeria Hidràulica**: Experiència del domini i retroalimentació

## 📞 Suport

Per a suport i preguntes:
- 📧 Email: support@boorie.com
- 💬 Discord: [Comunitat Boorie](https://discord.gg/boorie)
- 📖 Documentació: [GitHub Wiki](https://github.com/your-username/boorie_cliente/wiki)
- 🐛 Problemes: [GitHub Issues](https://github.com/your-username/boorie_cliente/issues)

## 📚 Documentació Addicional

### Wiki Multiidioma
- 🇺🇸 [English Documentation](docs/wiki/en/Home.md)
- 🇪🇸 [Documentación en Español](docs/wiki/es/Home.md)
- 🏴󠁥󠁳󠁣󠁴󠁿 [Documentació en Català](docs/wiki/ca/Home.md)

---

**Fet amb ❤️ per a Enginyers Hidràulics**