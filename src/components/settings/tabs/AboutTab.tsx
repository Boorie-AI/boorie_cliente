import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bug, ExternalLink, Lightbulb } from 'lucide-react'
import changelogRaw from '../../../../CHANGELOG.md?raw'
import { parseChangelog, isChangelogInSync, trocearEnLinea, fechaDeChangelog } from '../../../utils/changelog'
import { useAyudaStore } from '@/stores/ayudaStore'

const NOTAS_GITHUB = 'https://github.com/Boorie-AI/boorie_cliente/blob/main/CHANGELOG.md'

/** Una versión con sufijo (1.5.1-rc.9) es una candidata, no una liberación estable. */
const esPrerelease = (v: string) => v.includes('-')

function TextoChangelog({ texto }: { texto: string }) {
  return (
    <>
      {trocearEnLinea(texto).map((t, i) =>
        t.tipo === 'negrita' ? <strong key={i} className="font-semibold text-foreground">{t.texto}</strong>
          : t.tipo === 'cursiva' ? <em key={i}>{t.texto}</em>
            : t.tipo === 'codigo' ? <code key={i} className="rounded bg-muted px-1 font-mono text-[12px]">{t.texto}</code>
              : t.texto
      )}
    </>
  )
}

export function AboutTab() {
  const { t, i18n } = useTranslation()
  const [version, setVersion] = useState<string | null>(null)
  const [entorno, setEntorno] = useState<{ so: string; python: string | null } | null>(null)
  const abrirAyuda = useAyudaStore(s => s.abrir)

  useEffect(() => {
    // Misma fuente que consume electron-builder para nombrar el instalador, así
    // que lo que se muestra no puede desincronizarse del artefacto entregado.
    window.electronAPI?.getAppVersion?.()
      .then((v: string) => setVersion(v))
      .catch(() => setVersion(null))
    window.electronAPI?.feedback?.getEnvironment('settings:about')
      .then(r => { if (r.success) setEntorno({ so: r.entorno.so, python: r.entorno.python }) })
      .catch(() => setEntorno(null))
  }, [])

  const entries = useMemo(() => parseChangelog(changelogRaw), [])
  const sincronizado = version ? isChangelogInSync(entries, version) : true

  const fechaLarga = (iso: string) =>
    fechaDeChangelog(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 shrink-0 rounded-xl bg-linear-to-br from-amber-400 to-amber-600 flex items-center justify-center text-2xl font-extrabold text-amber-950">
            B
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-foreground">{t('settings.about.appName')}</h3>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {t('settings.about.currentVersion')}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-9 gap-y-3">
              <div>
                <div className="text-xs text-muted-foreground">{t('settings.about.version')}</div>
                <div className="font-mono text-sm font-semibold text-foreground">
                  {version ?? t('settings.about.loading')}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t('settings.about.buildDate')}</div>
                <div className="text-sm font-semibold text-foreground">{fechaLarga(__BUILD_DATE__)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t('settings.about.channel')}</div>
                <div className="text-sm font-semibold text-foreground">
                  {version && esPrerelease(version)
                    ? t('settings.about.channelPrerelease')
                    : t('settings.about.channelStable')}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t('settings.about.environment')}</div>
                <div className="text-sm font-semibold text-foreground" data-testid="entorno">
                  {entorno
                    ? `${entorno.so} · ${entorno.python ?? t('settings.about.noPython')}`
                    : t('settings.about.loading')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-base font-semibold text-foreground">{t('ayuda.tarjetaTitulo')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('ayuda.tarjetaDesc')}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => abrirAyuda('bug')}
            className="flex items-center gap-3 rounded-lg bg-primary px-4 py-3 text-left text-primary-foreground hover:bg-primary/90"
          >
            <Bug size={20} className="shrink-0" />
            <span>
              <span className="block text-sm font-semibold">{t('ayuda.reportar')}</span>
              <span className="block text-xs opacity-80">{t('ayuda.reportarDesc')}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => abrirAyuda('mejora')}
            className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-left text-foreground hover:bg-accent"
          >
            <Lightbulb size={20} className="shrink-0" />
            <span>
              <span className="block text-sm font-semibold">{t('ayuda.sugerir')}</span>
              <span className="block text-xs text-muted-foreground">{t('ayuda.sugerirDesc')}</span>
            </span>
          </button>
        </div>
      </div>

      {/* El texto íntegro, para poder consultarlo sin depender de haberlo leído
          el primer día (#108). Va antes del historial: es lo que se busca
          cuando se entra aquí a mirarlo. */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-base font-semibold text-foreground">{t('descargo.enAcercaDe')}</h3>
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <p>{t('descargo.parrafoModelos')}</p>
          <p>{t('descargo.parrafoIA')}</p>
          <p className="text-foreground font-medium">{t('descargo.parrafoDecision')}</p>
          <p>{t('descargo.parrafoResponsabilidad')}</p>
          <p className="italic pt-1">{t('descargo.prevalece')}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-base font-semibold text-foreground">{t('settings.about.historyTitle')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('settings.about.historyDesc')}</p>

        {/* Un fallo de formato en el CHANGELOG no debe pasar desapercibido. */}
        {!sincronizado && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-yellow-700 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{t('settings.about.outOfSync')}</span>
          </div>
        )}

        {entries.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('settings.about.historyEmpty')}</p>
        ) : (
          <ol className="mt-4">
            {entries.map((e, i) => (
              <li
                key={e.version}
                className="flex gap-4 border-t border-border/60 py-4 first:border-t-0 first:pt-1"
              >
                <span className="flex w-3 shrink-0 justify-center pt-1.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      i === 0 ? 'bg-green-500 ring-4 ring-green-500/20' : 'bg-muted-foreground/50'
                    }`}
                  />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-sm font-bold text-foreground">v{e.version}</span>
                    {e.date && <span className="text-xs text-muted-foreground">{fechaLarga(e.date)}</span>}
                  </div>
                  {e.summary && (
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground"><TextoChangelog texto={e.summary} /></p>
                  )}
                  {e.details.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-muted-foreground">
                      {e.details.map((d) => (
                        <li key={d}><TextoChangelog texto={d} /></li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        <a
          href={NOTAS_GITHUB}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
        >
          {t('settings.about.releaseNotes')}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}
