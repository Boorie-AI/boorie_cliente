/**
 * El puente entre los dos catálogos de fórmulas de la calculadora (#128).
 *
 * El panel lo sirve el calculador de Python (`hydraulicCalculator.py`) y
 * `calculationEngine.ts` es sólo el respaldo si Python falla. Pero los ids no
 * coinciden —`darcy_weisbach` frente a `darcy-weisbach`— así que el `catch` del
 * handler llamaba al motor de JavaScript con el id de Python y moría en
 * «Formula ... not found». El respaldo no había funcionado nunca.
 *
 * Y no basta con traducir el id: **hay que comprobar que la fórmula es la
 * misma**. `tank_volume` en Python recibe el diámetro y la altura del depósito;
 * `tank-volume` en el motor de JavaScript lo dimensiona por demanda, con
 * `Qmax`, `t`, `Vfire` y `Vemergency`. Son dos fórmulas distintas con el mismo
 * nombre, y un mapeo por parecido mandaría las dimensiones de un depósito a una
 * fórmula que espera caudales: no un error, una cifra equivocada.
 */

/**
 * Sólo las fórmulas que los dos motores resuelven **con los mismos
 * parámetros**. Los que el motor de JavaScript pide de más —`ρ` en el golpe de
 * ariete, `ρ` y `g` en la potencia— tienen valor por defecto, así que los que
 * manda el panel bastan.
 */
export const EQUIVALENTE_EN_JS: Record<string, string> = {
  darcy_weisbach: 'darcy-weisbach',
  hazen_williams: 'hazen-williams',
  pump_power: 'pump-power',
  water_hammer_pressure: 'water-hammer',
}

/**
 * Las que **no** tienen respaldo, y por qué. Están aquí y no ausentes sin más
 * para que se sepa que la ausencia es una decisión.
 */
export const SIN_EQUIVALENTE: Record<string, string> = {
  continuity_equation: 'el motor de JavaScript no la implementa',
  orifice_flow: 'el motor de JavaScript no la implementa',
  tank_volume: 'existe `tank-volume`, pero dimensiona por demanda y no por las dimensiones del depósito: son dos fórmulas distintas',
}

/**
 * El id con el que llamar al motor de JavaScript, o `null` si esa fórmula no
 * tiene respaldo. Acepta ya el id del motor de JavaScript, para que da igual
 * de qué lado venga.
 */
export function idParaElMotorJS(id: string): string | null {
  if (Object.values(EQUIVALENTE_EN_JS).includes(id)) return id
  return EQUIVALENTE_EN_JS[id] ?? null
}
