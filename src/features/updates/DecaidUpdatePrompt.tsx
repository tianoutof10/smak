import { useEffect, useRef, useState } from 'react'
import { subscribeWithCommands, type CommandSocketSubscription } from '../../api/decaid/socket'
import { t } from '../../i18n/index.ts'
import { isUpdateState, shouldPresentUpdate, updateProgressPercent, type DecaidUpdateCommand, type DecaidUpdateMessage, type DecaidUpdateState } from './decaidUpdate'

const dismissalKey = 'smak.decaid-update-dismissed'

function dismissedVersion() {
  try { return window.sessionStorage.getItem(dismissalKey) }
  catch { return null }
}

interface DecaidUpdatePromptProps {
  defer?: boolean
}

export function DecaidUpdatePrompt({ defer = false }: DecaidUpdatePromptProps) {
  const channel = useRef<CommandSocketSubscription<DecaidUpdateCommand> | null>(null)
  const installRequested = useRef(false)
  const [state, setState] = useState<DecaidUpdateState | null>(null)
  const [dismissed, setDismissed] = useState(dismissedVersion)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    channel.current = subscribeWithCommands<DecaidUpdateMessage, DecaidUpdateCommand>(
      '/update',
      (message) => {
        if (!isUpdateState(message)) {
          if (installRequested.current) setActionError(message.error)
          return
        }
        setState(message)
        if (message.phase === 'downloading' || message.phase === 'installing') installRequested.current = true
        if (message.phase === 'error' && installRequested.current) setActionError(message.error || t('shell.updates.installFailed'))
      },
      () => {},
      (send) => { send({ command: 'check' }) },
    )
    return () => {
      channel.current?.close()
      channel.current = null
    }
  }, [])

  const busy = state?.phase === 'downloading' || state?.phase === 'installing'
  if ((defer && !busy) || (!shouldPresentUpdate(state, dismissed) && !actionError)) return null

  const version = state?.latestVersion || t('shell.updates.newerVersionFallback')
  const progress = updateProgressPercent(state?.progress)

  const dismiss = () => {
    const versionToDismiss = state?.latestVersion || ''
    try { window.sessionStorage.setItem(dismissalKey, versionToDismiss) } catch { /* session persistence is optional */ }
    setDismissed(versionToDismiss)
    setActionError(null)
  }

  const update = () => {
    if (!state) return
    setActionError(null)
    installRequested.current = true
    if (!state.installable) {
      window.location.assign(state.releaseUrl)
      return
    }
    if (!channel.current?.send({ command: 'install' })) {
      setActionError(t('shell.updates.connectionLost'))
    }
  }

  return <div className="decaid-update-overlay" role="presentation">
    <section className="decaid-update" role="dialog" aria-modal="true" aria-labelledby="decaid-update-title" aria-describedby="decaid-update-description" aria-busy={busy}>
      <div className="decaid-update__mark" aria-hidden="true">↑</div>
      <div className="decaid-update__copy">
        <h2 id="decaid-update-title">{t('shell.updates.title')}</h2>
        <p id="decaid-update-description">{t('shell.updates.description', { version })}</p>
        {state?.currentVersion && <small>{t('shell.updates.installedVersion', { version: state.currentVersion })}</small>}
        {actionError && <p className="decaid-update__error" role="alert">{actionError}</p>}
        {state?.phase === 'downloading' && <div className="decaid-update__progress" aria-label={t('shell.updates.downloadingAria', { progress })}><span style={{ width: `${progress}%` }} /></div>}
        {state?.phase === 'downloading' && <small>{t('shell.updates.downloading', { progress })}</small>}
        {state?.phase === 'installing' && <small>{t('shell.updates.installing')}</small>}
      </div>
      <div className="decaid-update__actions">
        <button className="decaid-update__later" type="button" disabled={busy} onClick={dismiss}>{actionError ? t('shell.updates.close') : t('shell.updates.later')}</button>
        {!actionError && <button className="decaid-update__primary" type="button" disabled={busy} onClick={update}>{busy ? t('shell.updates.updating') : state?.installable ? t('shell.updates.updateDecaid') : t('shell.updates.viewDownload')}</button>}
      </div>
    </section>
  </div>
}
