# Las dos redes que usa la batería del agente

`backend/services/hydraulic/agentEval/casos.ts` mide contra dos redes concretas, y los
valores esperados de cada caso salieron **de estas dos**: sustituirlas por otras invalida
la comparación.

| Fichero | Qué es |
|---|---|
| `Net3 2.inp` | El *Example Network 3* de EPANET, con la duración alargada. 117 tuberías, 92 nudos. |
| `villa_100_casas.inp` | Red sintética de una urbanización de 100 casas (400 hab, 250 l/hab/día). |

Están aquí porque **la base de datos no viaja en el repositorio**: `prisma/hydraulic.db`
entra en `.gitignore` por el `*.db`. Sin estos ficheros, quien clone el repositorio no puede
correr la batería, y el fallo que ve es «falta la red Net3 2.inp» sin más pistas.

## Cómo se meten en la base

Las redes viven en SQLite, no en disco, así que hay que importarlas por la aplicación —que
es también la única forma de que el `networkData` lo genere la misma tubería que en
producción—:

1. `npm run dev`
2. **Proyectos** → abrir o crear un proyecto
3. **Red WNTR** → cargar el fichero

El nombre de la red en la base es el del fichero, así que hay que cargarlos **sin
renombrarlos**: los casos buscan exactamente `Net3 2.inp` —con el espacio— y
`villa_100_casas.inp`.

## Qué necesita cada medida

- **La batería determinista** (`bateria.test.ts`) comprueba las cifras que devuelven las
  herramientas contra los valores esperados, así que necesita estas redes **y** que la
  importación produzca el mismo `networkData`.
- **Las medidas contra un modelo** (`modelo.test.ts`, `disciplinaDelModelo.test.ts`) sólo
  necesitan que las redes **existan**: miden qué elige y qué escribe el agente, no si la
  cifra de la herramienta es la esperada. Para el #133 basta con importarlas.
