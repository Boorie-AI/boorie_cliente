/**
 * Conceptos de hidrogeología e hidráulica, de una pregunta en castellano o
 * catalán a como los nombra un libro en inglés.
 *
 * Las consultas que escribe el modelo traducen palabra por palabra: qwen2.5:7b
 * convirtió la «prueba de bombeo a caudal variable» en «variable discharge
 * test», y el capítulo del libro de Walton que respondía, el del «step drawdown
 * test», no entró en la selección. El nombre técnico no se deduce de las
 * palabras; se sabe o no se sabe, y aquí se sabe.
 *
 * Los patrones van sobre el texto en minúsculas y sin acentos.
 */

const GLOSARIO: Array<[RegExp, string[]]> = [
  // Pruebas de bombeo
  [/caudal(es)? variable|escalon|escalonad|cabal(s)? variable|esglaon/, ['step drawdown test']],
  [/caudal constante|cabal constant/, ['constant discharge test']],
  [/tabla de tiempos|intervalos? de (tiempo|medici)|frecuencia de (las )?medici|taula de temps|intervals? de (temps|mesura)/, ['time intervals water level measurements']],
  [/recuperacion del (nivel|pozo)|prueba de recuperacion|recuperacio del (nivell|pou)/, ['recovery test']],
  [/curva(s)? tipo|corba tipus/, ['type curve matching']],
  // El pozo
  // «well efficiency» no: en el libro de Walton trae la eficiencia barométrica, y el modelo la tomó por la del pozo.
  [/eficiencia (del?|de un) po(z|u)|eficiencia del pou|rendimiento del pozo/, ['well loss coefficient']],
  [/perdida(s)? (de carga )?en el pozo|perdua (de carrega )?al pou/, ['well loss coefficient']],
  [/capacidad especifica|caudal especifico|capacitat especifica/, ['specific capacity']],
  [/diametro (del?|de la) (po|perforaci|captaci)|diametre del pou/, ['production well diameter discharge rate']],
  [/equipo(s)? de bombeo|electrobomba|\bbombas?\b|equip(s)? de bombament/, ['pump selection']],
  [/rejilla|ranurad|reixeta/, ['well screen']],
  [/desarroll(o|ar) (del |el )?pozo|desenvolupament del pou/, ['well development']],
  [/pozo(s)? de observacion|piezometr|pou(s)? d'observacio/, ['observation well']],
  [/almacenamiento del pozo|efecto de almacenamiento/, ['well storage capacity']],
  // El acuífero
  [/abatimiento|descenso(s)? de(l)? nivel|abatiment|descens del nivell/, ['drawdown']],
  [/nivel dinamico|nivell dinamic/, ['pumping water level']],
  [/transmisividad|transmissivitat/, ['transmissivity']],
  [/coeficiente de almacenamiento|coeficient d'emmagatzematge/, ['storativity storage coefficient']],
  [/conductividad hidraulica|permeabilidad|conductivitat hidraulica|permeabilitat/, ['hydraulic conductivity']],
  [/semiconfinado|acuitardo|semiconfinat|aquitard/, ['leaky artesian aquifer aquitard']],
  [/acuifero (confinado|cautivo)|aquifer confinat/, ['artesian aquifer']],
  [/acuifero libre|freatico|aquifer lliure|freatic/, ['water table aquifer']],
  [/cono de (depresion|abatimiento)|radio de influencia|con de depressio|radi d'influencia/, ['cone of depression radius of influence']],
  [/penetracion parcial|penetracio parcial/, ['partial penetration']],
  [/barrera|limite(s)? (del acuifero|impermeable)|contorno impermeable/, ['aquifer boundaries']],
  [/infiltracion (inducida|desde el rio)|infiltracio induida/, ['induced streambed infiltration']],
  // Redes y conducciones
  [/perdida(s)? de carga|perdua de carrega/, ['head loss']],
  [/golpe de ariete|cop d'ariet/, ['water hammer']],
  [/rugosidad|rugositat/, ['roughness coefficient']],
  [/cavitacion|cavitacio|npsh/, ['cavitation NPSH']],
  [/curva (caracteristica|de la bomba)|corba (caracteristica|de la bomba)/, ['pump characteristic curve']],
  [/dotacion|dotacio/, ['per capita water demand']],
  [/red(es)? de distribucion|xarxa de distribucio/, ['water distribution network']],
  // Los generales, al final: si la pregunta nombra algo concreto, son los que sobran.
  [/prueba(s)? de bombeo|ensayo(s)? de bombeo|aforo de(l)? pozo|prova de bombament|assaig de bombament/, ['pumping test']],
  // Solo si va de bombeo: «planificar la red» no es el diseño de una prueba.
  [/(precaucion|planific|disen)[^.]*(bombeo|pozo|bombament|pou)|(bombeo|pozo|bombament|pou)[^.]*(precaucion|planific)/, ['pumping test design']],
]

const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

const MAXIMO = 6

/** Los términos en inglés de lo que nombra la pregunta, sin repetir y en el orden del glosario. */
export function terminosDelGlosario(pregunta: string): string[] {
  const texto = normalizar(pregunta)
  const terminos = new Set<string>()
  for (const [patron, suyos] of GLOSARIO) {
    if (patron.test(texto)) suyos.forEach(t => terminos.add(t))
  }
  return [...terminos].slice(0, MAXIMO)
}
