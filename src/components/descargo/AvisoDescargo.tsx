import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'

/**
 * El aviso que acompaña a una cifra (issue #108, capa 2).
 *
 * Es la capa que de verdad protege a quien usa Boorie: el diálogo del arranque
 * se lee una vez y se olvida, y esto está al pie de la cifra en el momento en
 * que alguien la va a usar.
 *
 * Vive en un componente propio para que se vea igual en todas partes y se
 * cambie en un solo sitio. Nace del patrón que ya usaba el visor para avisar de
 * lo que tardan las rutinas de resiliencia: una línea discreta, no un modal.
 */
export function AvisoDescargo({ variante = 'modelo' }: { variante?: 'modelo' | 'ia' }) {
  const { t } = useTranslation()

  return (
    <p className="text-[10px] text-muted-foreground flex items-start gap-1.5 pt-1">
      <AlertTriangle className="h-3 w-3 mt-px shrink-0" />
      <span>{t(variante === 'ia' ? 'descargo.avisoIA' : 'descargo.avisoCorto')}</span>
    </p>
  )
}
