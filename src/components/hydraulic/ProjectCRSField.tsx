import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { nombreCRS } from '@/services/geo/crs'
import { CRSSelector } from './CRSSelector'

interface ProjectCRSFieldProps {
  epsg: string | null
  pais: string | null
  onChange: (epsg: string | null) => void
}

/**
 * Sistema de coordenadas por defecto de las redes del proyecto. El `.inp` no
 * dice en qué sistema están sus coordenadas, así que sin esto había que
 * declararlo red a red al abrir cada una en el mapa.
 */
export function ProjectCRSField({ epsg, pais, onChange }: ProjectCRSFieldProps) {
  const { t } = useTranslation()
  const [abierto, setAbierto] = useState(false)

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-2">
        {t('crs.projectField')}
      </label>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={cn(
          "w-full flex items-center gap-2 px-4 py-2 rounded-lg text-left",
          "bg-input border border-border hover:border-primary/50",
          "focus:outline-hidden focus:ring-2 focus:ring-ring"
        )}
      >
        <Globe2 className="w-4 h-4 shrink-0 text-muted-foreground" />
        {epsg ? (
          <span className="truncate">
            <span className="font-mono">{epsg}</span>
            <span className="ml-2 text-muted-foreground">{nombreCRS(epsg)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{t('crs.projectNone')}</span>
        )}
      </button>
      <p className="mt-1 text-xs text-muted-foreground">{t('crs.projectHint')}</p>

      {abierto && (
        <CRSSelector
          abierto
          ambito="proyecto"
          pais={pais}
          onCerrar={() => setAbierto(false)}
          limites={null}
          epsgActual={epsg}
          onDeclarado={onChange}
        />
      )}
    </div>
  )
}
