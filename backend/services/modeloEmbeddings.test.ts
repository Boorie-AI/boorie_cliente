/**
 * La dimensión tiene que salir del nombre del modelo y acertar con los que se
 * parecen entre sí (#155). Antes se resolvía con una lista de `includes` en la
 * que `bge-m3` no aparecía: caía al 768 por defecto siendo de 1024, y el almacén
 * vectorial se quedaba esperando vectores del tamaño equivocado.
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  dimensionDeModelo,
  dimensionEsperada,
  modeloEmbeddingsOllama,
  MODELO_OLLAMA_POR_DEFECTO,
  DIMENSION_DESCONOCIDA,
} from './modeloEmbeddings'

describe('modelo de embeddings', () => {
  afterEach(() => {
    delete process.env.BOORIE_MODELO_EMBEDDINGS
    delete process.env.EMBEDDING_DIMENSION
  })

  it('el modelo por defecto es multilingüe, no nomic', () => {
    expect(modeloEmbeddingsOllama()).toBe(MODELO_OLLAMA_POR_DEFECTO)
    expect(modeloEmbeddingsOllama()).not.toContain('nomic')
  })

  it('bge-m3 son 1024, y no los 768 de bge-base al que se parece', () => {
    expect(dimensionDeModelo('bge-m3')).toBe(1024)
    expect(dimensionDeModelo('bge-m3:latest')).toBe(1024)
    expect(dimensionDeModelo('bge-base')).toBe(768)
  })

  it('reconoce los modelos con el nombre del repositorio delante', () => {
    expect(dimensionDeModelo('zylonai/multilingual-e5-large')).toBe(1024)
    expect(dimensionDeModelo('nomic-embed-text:latest')).toBe(768)
  })

  it('un modelo que no conoce no devuelve un número inventado', () => {
    expect(dimensionDeModelo('un-modelo-que-no-existe')).toBeUndefined()
    // Quien necesita un número sí lo recibe, pero por una puerta distinta.
    expect(DIMENSION_DESCONOCIDA).toBeGreaterThan(0)
  })

  it('la dimensión esperada sigue al modelo configurado', () => {
    process.env.BOORIE_MODELO_EMBEDDINGS = 'nomic-embed-text'
    expect(dimensionEsperada()).toBe(768)

    process.env.BOORIE_MODELO_EMBEDDINGS = 'bge-m3'
    expect(dimensionEsperada()).toBe(1024)
  })

  it('EMBEDDING_DIMENSION manda sobre el nombre del modelo', () => {
    process.env.BOORIE_MODELO_EMBEDDINGS = 'bge-m3'
    process.env.EMBEDDING_DIMENSION = '1536'
    expect(dimensionEsperada()).toBe(1536)
  })

  it('un EMBEDDING_DIMENSION con basura no deja la dimensión en NaN', () => {
    process.env.BOORIE_MODELO_EMBEDDINGS = 'bge-m3'
    process.env.EMBEDDING_DIMENSION = 'mil'
    expect(dimensionEsperada()).toBe(1024)
  })
})
