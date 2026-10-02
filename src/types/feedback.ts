/** Contrato del canal `feedback:*` (#217); el main valida todo lo que recibe. */

export type TipoAyuda = 'bug' | 'mejora'
export type Frecuencia = 'una-vez' | 'a-veces' | 'siempre'

export interface FormularioBug {
  tipo: 'bug'
  haciendo: string
  paso: string
  esperabas: string
  frecuencia: Frecuencia
}

export interface FormularioMejora {
  tipo: 'mejora'
  necesitas: string
  paraQue: string
  comoHoy: string
}

export type FormularioAyuda = FormularioBug | FormularioMejora

export interface OpcionesReporte {
  incluirTecnica: boolean
  pantalla: string
}

export interface EntornoReporte {
  version: string
  so: string
  arquitectura: string
  python: string | null
  venvGestionado: boolean
  pantalla: string
  registro: string[]
}

type Resultado<T = object> = Promise<({ success: true } & T) | { success: false; error?: string }>

export interface FeedbackAPI {
  getEnvironment: (pantalla?: string) => Resultado<{ entorno: EntornoReporte }>
  preview: (form: FormularioAyuda, opciones: OpcionesReporte) => Resultado<{ titulo: string; cuerpo: string; recortado: boolean }>
  openGithub: (form: FormularioAyuda, opciones: OpcionesReporte) => Resultado<{ recortado: boolean }>
  copy: (form: FormularioAyuda, opciones: OpcionesReporte) => Resultado
  snapshot: () => Resultado
  copySnapshot: () => Resultado
  discardSnapshot: () => Resultado
}
