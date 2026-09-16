import { useTranslation } from 'react-i18next'
import {
  formatearHoras, resolverHoras, HORAS_DE_RESPALDO, HORAS_LARGAS, type Ventana
} from '@/services/network/ventanaSimulacion'

interface Props {
  valor: Ventana
  onChange: (v: Ventana) => void
  horasFichero: number | null
  /** Para ocupar las dos columnas cuando va dentro de una rejilla de campos. */
  className?: string
  disabled?: boolean
}

export function SelectorVentana({ valor, onChange, horasFichero, className, disabled }: Props) {
  const { t } = useTranslation()
  const horas = resolverHoras(valor, horasFichero)

  return (
    <div className={`bg-background p-2 rounded border ${className ?? ''}`}>
      <div className="text-[10px] text-muted-foreground mb-1">
        {t('networkView.window.label')}
      </div>
      <select
        value={valor}
        onChange={e => onChange(e.target.value as Ventana)}
        disabled={disabled}
        className="w-full bg-transparent font-mono text-sm border-b border-border focus:outline-none focus:border-primary disabled:opacity-50"
      >
        <option value="fichero">
          {horasFichero === null
            ? t('networkView.window.fileUnknown')
            : t('networkView.window.file', { horas: formatearHoras(horasFichero) })}
        </option>
        <option value="24">{t('networkView.window.day')}</option>
        <option value="72">{t('networkView.window.threeDays')}</option>
        <option value="168">{t('networkView.window.week')}</option>
      </select>
      {valor === 'fichero' && horasFichero === null && (
        <div className="text-[10px] text-muted-foreground mt-1">
          {t('networkView.window.fallback', { horas: HORAS_DE_RESPALDO })}
        </div>
      )}
      {horas > HORAS_LARGAS && (
        <div className="text-[10px] text-muted-foreground mt-1">
          {t('networkView.window.slow')}
        </div>
      )}
    </div>
  )
}
