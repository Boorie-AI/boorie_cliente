/**
 * La demanda del sistema paso a paso, para la curva del panel (#79).
 *
 * Estaba escrita dentro del componente y sumaba **todos** los nudos de los
 * resultados. Los depósitos y los embalses también traen `demand`, pero en
 * negativo: es lo que aportan. En una red en equilibrio lo que entra es lo que
 * sale, así que la suma se cancelaba y la curva quedaba en el residuo numérico
 * —en Net3, 1,5·10⁻⁸ m³/s en vez de 680 l/s—: una recta pegada al eje con los
 * rótulos en notación exponencial.
 *
 * Vive aquí y no en el componente para poder fijarlo en una prueba: es una
 * cuenta, no una decisión de dibujo.
 */

import { tipoNudo } from './capas'
import { valorEnPaso, type DatosRed, type ResultadosSimulacion } from './topologia'

/**
 * Serie de demanda total de los nudos de consumo, **en m³/s**, que es como la da
 * el motor. Quien la enseñe la convierte con `unidades.ts`.
 *
 * @param pasos Cuántos instantes tiene la simulación.
 */
export function demandaDelSistema(
  datos: DatosRed | null | undefined,
  resultados: ResultadosSimulacion | null | undefined,
  pasos: number
): number[] {
  const consumo = new Set((datos?.nodes ?? []).filter(n => tipoNudo(n) === 'junction').map(n => n.id))
  const tabla = resultados?.node_results ?? {}

  const serie: number[] = []
  for (let paso = 0; paso < pasos; paso++) {
    let suma = 0
    for (const [id, valores] of Object.entries(tabla)) {
      if (!consumo.has(id)) continue
      const q = valorEnPaso(valores?.demand, paso)
      if (typeof q === 'number' && Number.isFinite(q)) suma += q
    }
    serie.push(suma)
  }
  return serie
}
