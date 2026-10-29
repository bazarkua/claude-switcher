import { useCallback, useEffect, useRef, useState } from 'react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { MotionConfig } from 'motion/react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  Sun,
  Moon,
  Monitor,
  Trash2,
  X,
} from 'lucide-react'
import type {
  Diagnostics,
  Profile,
  Reply,
  Settings as Preferences,
  Snapshot,
  UsageSummary,
} from '../shared/types'
import logo from '../../resources/logo-v2.png'
import claudeMark from '../../resources/claude-favicon.ico'
import { Dialog } from './components/ui/dialog'

const unwrap = <T,>(reply: Reply<T>): T => {
  if (!reply.ok) throw new Error(reply.error)
  return reply.value
}
const progressLabels: Record<string, string> = {
  VALIDATING: 'Checking account',
  CHECKING_ACTIVITY: 'Checking Claude',
  CLOSING_SOURCE: 'Closing Claude',
  SNAPSHOTTING: 'Checking history',
  SYNCHRONIZING: 'Synchronizing history',
  LAUNCHING_TARGET: 'Opening account',
  VERIFYING: 'Verifying profile',
  RECOVERING: 'Restoring history',
}
function UsageLines({
  usage,
  detailed = false,
}: {
  usage: UsageSummary
  detailed?: boolean
}): React.JSX.Element {
  const rows = [
    {
      label: '5-hour window',
      remaining: usage.available ? usage.fiveHourRemaining : null,
      reset: usage.available ? usage.fiveHourResetAt : null,
    },
    {
      label: 'Weekly',
      remaining: usage.available ? usage.weeklyRemaining : null,
      reset: usage.available ? usage.weeklyResetAt : null,
    },
  ]
  return (
    <dl className="account-usage">
      {rows.map(({ label, remaining, reset }, index) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {remaining === null ? (
              <span className="usage-unknown" aria-label={`${label} usage unavailable`}>
                Unavailable
              </span>
            ) : (
              <>
                {Math.round(remaining)}% <span>left</span>
              </>
            )}
          </dd>
          <dd
            className={`remaining-track ${index ? 'weekly-track' : ''} ${remaining === null ? 'unknown-track' : ''}`}
            role={remaining === null ? undefined : 'progressbar'}
            aria-hidden={remaining === null ? true : undefined}
            aria-label={remaining === null ? undefined : `${label} remaining`}
            aria-valuenow={remaining ?? undefined}
            aria-valuemin={remaining === null ? undefined : 0}
            aria-valuemax={remaining === null ? undefined : 100}
          >
            <i
              style={{
                width: remaining === null ? '0%' : `${Math.max(0, Math.min(100, remaining))}%`,
              }}
            />
          </dd>
          {detailed && (
            <dd className="reset-caption">
              {reset ? `Resets ${new Date(reset).toLocaleString()}` : 'Reset time unavailable'}
            </dd>
          )}
        </div>
      ))}
    </dl>
  )
}
function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <button
      className="toggle"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  )
}
export function App(): React.JSX.Element {
  const [data, setData] = useState<Snapshot | null>(null)
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [page, setPage] = useState<'accounts' | 'settings'>('accounts')
  const [tab, setTab] = useState<'general' | 'usage' | 'profiles' | 'diagnostics'>('general')
  const [editor, setEditor] = useState<{ profile?: Profile } | null>(null)
  const [name, setName] = useState('')
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)
  const panel = useRef<HTMLElement>(null)
  const operationPending = useRef(false)
  const refresh = useCallback(async () => {
    const snapshot = unwrap(await window.claudeSwitcher.snapshot())
    setData(snapshot)
    setSelectedId((current) =>
      snapshot.profiles.some((p) => p.id === current)
        ? current
        : (snapshot.activeId ?? snapshot.lastUsedId ?? snapshot.profiles[0]?.id),
    )
  }, [])
  useEffect(() => {
    const update = (): void => {
      refresh().catch((error) => setError(error.message))
    }
    Promise.resolve().then(update)
    window.addEventListener('focus', update)
    const timer = window.setInterval(update, 300_000)
    const unsubscribe = window.claudeSwitcher.onProgress((progress) =>
      setData((current) => (current ? { ...current, progress } : current)),
    )
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', update)
      unsubscribe()
    }
  }, [refresh])
  useEffect(() => {
    const mode = data?.settings.appearance ?? 'system'
    const media = matchMedia('(prefers-color-scheme: dark)')
    const update = (): void => {
      document.documentElement.dataset.theme =
        mode === 'system' ? (media.matches ? 'dark' : 'light') : mode
    }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [data?.settings.appearance])
  useEffect(() => {
    if (!panel.current) return
    const observer = new ResizeObserver((entries) => {
      const height = Math.min(
        820,
        Math.max(editor ? 380 : 220, Math.ceil(entries[0].target.getBoundingClientRect().height)),
      )
      window.claudeSwitcher.resizePanel(height).catch(() => {})
    })
    observer.observe(panel.current)
    return () => observer.disconnect()
  }, [editor])
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n' && !busy) {
        event.preventDefault()
        setName('')
        setEditor({})
      }
      if (event.key === 'Escape' && !document.querySelector('[role="dialog"], [role="menu"]')) {
        event.preventDefault()
        window.claudeSwitcher.dismiss()
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [busy])
  const perform = async (operation: () => Promise<void>): Promise<void> => {
    if (operationPending.current) return
    operationPending.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await operation()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The operation could not be completed.')
    } finally {
      await refresh().catch(() => {})
      operationPending.current = false
      setBusy(false)
    }
  }
  const save = (change: Partial<Preferences>): void => {
    if (data)
      void perform(async () => {
        unwrap(await window.claudeSwitcher.saveSettings({ ...data.settings, ...change }))
      })
  }
  const selected = data?.profiles.find((p) => p.id === selectedId)
  const usageFor = (id: string): UsageSummary =>
    data?.usageByProfile[id] ?? { available: false, label: 'Connect usage in Settings → Usage.' }
  const openEditor = (profile?: Profile): void => {
    setName(profile?.name ?? '')
    setError(null)
    setEditor({ profile })
  }
  const showDiagnostics = (): void => {
    setTab('diagnostics')
    void perform(async () => {
      setDiagnostics(unwrap(await window.claudeSwitcher.diagnostics()))
    })
  }
  const message = error ?? notice
  return (
    <MotionConfig reducedMotion="user">
      <main className="app" ref={panel} aria-busy={busy}>
        <header className="app-header">
          <button
            className="brand"
            aria-label="Claude Switcher home"
            onClick={() => setPage('accounts')}
          >
            <img src={logo} alt="" />
            <span>Claude Switcher</span>
          </button>
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label={page === 'accounts' ? 'Settings' : 'Close settings'}
              data-tip={page === 'accounts' ? 'Settings' : 'Close settings'}
              onClick={() => setPage(page === 'accounts' ? 'settings' : 'accounts')}
            >
              {page === 'accounts' ? <Settings strokeWidth={1.5} /> : <X />}
            </button>
            <button
              className="icon-button add"
              aria-label="Add account"
              data-tip="Add account"
              disabled={busy}
              onClick={() => openEditor()}
            >
              <Plus />
            </button>
          </div>
        </header>
        {page === 'accounts' ? (
          <section aria-label="Account switcher">
            <div className="page-heading">
              <h1>Switch account</h1>
            </div>
            <div className="accounts" role="group" aria-label="Choose an account">
              {data?.profiles.length ? (
                data.profiles.map((profile) => (
                  <button
                    key={profile.id}
                    className={`account ${selectedId === profile.id ? 'selected' : ''}`}
                    aria-label={`Select ${profile.name}`}
                    aria-pressed={selectedId === profile.id}
                    disabled={busy}
                    onClick={() => setSelectedId(profile.id)}
                  >
                    <span className="account-heading">
                      <span className="avatar">
                        <img src={claudeMark} alt="Claude" />
                      </span>
                      <span className="account-identity">
                        <span className="account-name-row">
                          <span className="account-name">{profile.name}</span>
                          {data.activeId === profile.id && (
                            <span className="current-badge">Current</span>
                          )}
                        </span>
                      </span>
                      <span className="account-select-indicator">
                        {selectedId === profile.id && <Check />}
                      </span>
                    </span>
                    <UsageLines usage={usageFor(profile.id)} />
                  </button>
                ))
              ) : (
                <div className="empty-card">
                  <span className="avatar">
                    <img src={claudeMark} alt="Claude" />
                  </span>
                  <h2>Add your first account</h2>
                  <p>
                    Create a separate profile, then
                    <br />
                    sign in through Claude.
                  </p>
                </div>
              )}
            </div>
            {data?.recoveryPending && (
              <button
                className="recovery-notice"
                onClick={() => {
                  setPage('settings')
                  setTab('general')
                }}
              >
                An interrupted sync needs recovery <ChevronRight size={13} />
              </button>
            )}
            <div className="action-area">
              <button
                className="primary"
                disabled={busy || !data}
                onClick={() => {
                  if (selected)
                    void perform(async () => {
                      unwrap(await window.claudeSwitcher.switchProfile(selected.id))
                    })
                  else openEditor()
                }}
              >
                <span aria-live="polite">
                  {busy
                    ? (progressLabels[data?.progress.stage ?? ''] ?? 'Saving changes')
                    : selected
                      ? `${data?.activeId === selected.id ? 'Open' : 'Switch to'} ${selected.name}`
                      : 'Add account'}
                </span>
                <ArrowRight />
              </button>
            </div>
          </section>
        ) : (
          <section className="preferences-view">
            <button className="back-button" onClick={() => setPage('accounts')}>
              <ArrowLeft />
              Accounts
            </button>
            <h1>Settings</h1>
            <nav className="settings-tabs" aria-label="Settings sections">
              {(['general', 'usage', 'profiles'] as const).map((id) => (
                <button
                  key={id}
                  className={tab === id ? 'selected' : ''}
                  aria-pressed={tab === id}
                  onClick={() => setTab(id)}
                >
                  {id[0].toUpperCase() + id.slice(1)}
                </button>
              ))}
            </nav>
            {tab === 'general' ? (
              <>
                <div className="setting-block">
                  <label>Appearance</label>
                  <div className="segmented">
                    {(
                      [
                        { id: 'light', text: 'Light', Icon: Sun },
                        { id: 'dark', text: 'Dark', Icon: Moon },
                        { id: 'system', text: 'Auto', Icon: Monitor },
                      ] as const
                    ).map(({ id, text, Icon }) => (
                      <button
                        key={id}
                        className={data?.settings.appearance === id ? 'selected' : ''}
                        aria-pressed={data?.settings.appearance === id}
                        disabled={busy}
                        onClick={() => save({ appearance: id })}
                      >
                        <Icon />
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-block">
                  <div className="setting-row">
                    <div>
                      <strong>Keep Code history</strong>
                      <p>Sync local references when switching.</p>
                    </div>
                    <Toggle
                      label="Keep Code history"
                      disabled={busy}
                      checked={data?.settings.syncOnSwitch ?? true}
                      onChange={(checked) => save({ syncOnSwitch: checked })}
                    />
                  </div>
                  <div className="setting-divider" />
                  <div className="setting-row">
                    <div>
                      <strong>Open at login</strong>
                      <p>Start quietly in the menu bar.</p>
                    </div>
                    <Toggle
                      label="Open at login"
                      disabled={busy}
                      checked={data?.settings.launchAtLogin ?? false}
                      onChange={(checked) => save({ launchAtLogin: checked })}
                    />
                  </div>
                </div>
                <button
                  className="settings-link"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      unwrap(await window.claudeSwitcher.openClaude())
                    })
                  }
                >
                  Open Claude Desktop
                  <ArrowUpRight />
                </button>
                <button className="settings-link" disabled={busy} onClick={showDiagnostics}>
                  Diagnostics
                  <ArrowRight />
                </button>
                <button
                  className="settings-link"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      unwrap(await window.claudeSwitcher.revealBackups())
                    })
                  }
                >
                  Open session backups
                  <ArrowUpRight />
                </button>
                <button
                  className="settings-link"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      unwrap(await window.claudeSwitcher.chooseInstallation())
                    })
                  }
                >
                  Locate Claude Desktop
                  <ArrowRight />
                </button>
                {data?.recoveryPending && (
                  <button
                    className="settings-link"
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        unwrap(await window.claudeSwitcher.recover())
                        setNotice('Session references restored.')
                      })
                    }
                  >
                    Restore interrupted sync
                    <History />
                  </button>
                )}
                <p className="settings-note">
                  Your profiles stay on this device.
                  <br />
                  Unofficial. Not affiliated with Anthropic.
                  <br />
                  Authentication is handled by Claude.
                </p>
                <footer className="settings-version">
                  <span>Claude Switcher</span>
                  <span>Version 0.1.0</span>
                </footer>
                <button
                  className="quit-button"
                  disabled={busy}
                  onClick={() => window.claudeSwitcher.quit()}
                >
                  Quit Claude Switcher
                </button>
              </>
            ) : tab === 'usage' ? (
              <>
                <p className="tab-description">Limits and reset times for each account.</p>
                <p className="usage-explanation">
                  Connect each account with a separate Claude web sign-in. Sign in to the same
                  account as its Desktop profile, then close the sign-in window. Refreshes every
                  five minutes. No percentages or reset times are estimated.
                </p>
                {data?.profiles.map((profile) => {
                  const usage = usageFor(profile.id)
                  const connected = data.usageConnections[profile.id]
                  return (
                    <section className="detail-card" key={profile.id}>
                      <h2>{profile.name}</h2>
                      <UsageLines usage={usage} detailed />
                      <p className="settings-note" role="status">
                        {usage.available
                          ? `${usage.organization} · Updated ${new Date(usage.updatedAt).toLocaleTimeString()}`
                          : usage.label}
                      </p>
                      {connected && <p className="settings-note">Connected to {connected}</p>}
                      <button
                        className="settings-link"
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            unwrap(await window.claudeSwitcher.connectUsage(profile.id))
                            setNotice(
                              'Usage connected. Check the organization shown for this account.',
                            )
                          })
                        }
                      >
                        {connected ? 'Reconnect usage' : 'Connect usage'}
                        <ArrowUpRight />
                      </button>
                      {connected && (
                        <button
                          className="settings-link"
                          disabled={busy}
                          onClick={() =>
                            void perform(async () => {
                              unwrap(await window.claudeSwitcher.disconnectUsage(profile.id))
                            })
                          }
                        >
                          Disconnect usage
                        </button>
                      )}
                    </section>
                  )
                })}
                {!data?.profiles.length && (
                  <p className="settings-note">Add an account to see its usage status here.</p>
                )}
              </>
            ) : tab === 'profiles' ? (
              <>
                <p className="tab-description">Rename, check sign-in, or remove a profile.</p>
                {data?.profiles.map((profile) => (
                  <div className="manage-profile" key={profile.id}>
                    <span className="avatar">
                      <img src={claudeMark} alt="Claude" />
                    </span>
                    <div className="managed-name">
                      <span>{profile.name}</span>
                      <small>
                        {profile.connection === 'local-account-detected'
                          ? 'Local account detected'
                          : 'Sign-in unverified'}
                      </small>
                    </div>
                    <Menu.Root>
                      <Menu.Trigger
                        className="more"
                        aria-label={`Manage ${profile.name}`}
                        disabled={busy}
                      >
                        <MoreHorizontal />
                      </Menu.Trigger>
                      <Menu.Portal>
                        <Menu.Content
                          className="account-menu"
                          align="end"
                          sideOffset={5}
                          collisionPadding={12}
                          onCloseAutoFocus={(event) => {
                            if (editor) event.preventDefault()
                          }}
                        >
                          <Menu.Item onSelect={() => openEditor(profile)}>
                            Rename account
                            <Pencil />
                          </Menu.Item>
                          <Menu.Item
                            onSelect={() =>
                              void perform(async () => {
                                const updated = unwrap(
                                  await window.claudeSwitcher.inspectProfile(profile.id),
                                )
                                setNotice(
                                  updated.connection === 'local-account-detected'
                                    ? 'Local metadata found. Live authentication is unverified.'
                                    : 'Sign in and create one Code conversation, then check again.',
                                )
                              })
                            }
                          >
                            Check local profile
                            <Check />
                          </Menu.Item>
                          <Menu.Item
                            onSelect={() =>
                              void perform(async () => {
                                unwrap(await window.claudeSwitcher.openClaude(profile.id))
                              })
                            }
                          >
                            Open sign-in
                            <ArrowUpRight />
                          </Menu.Item>
                          <Menu.Separator />
                          <Menu.Item
                            className="remove-item"
                            onSelect={() =>
                              void perform(async () => {
                                unwrap(await window.claudeSwitcher.removeProfile(profile.id))
                                setNotice('Removed from the list. Profile files are preserved.')
                              })
                            }
                          >
                            Remove from list
                            <Trash2 />
                          </Menu.Item>
                        </Menu.Content>
                      </Menu.Portal>
                    </Menu.Root>
                  </div>
                ))}
                <button className="settings-link" disabled={busy} onClick={() => openEditor()}>
                  Add account
                  <Plus />
                </button>
              </>
            ) : (
              <>
                <button className="back-button" onClick={() => setTab('general')}>
                  <ArrowLeft />
                  General
                </button>
                <h2 className="diagnostics-title">Diagnostics</h2>
                {diagnostics && (
                  <dl className="diagnostics-list">
                    {[
                      ['System', diagnostics.os],
                      [
                        'Claude Desktop',
                        diagnostics.installation.found
                          ? `${diagnostics.installation.version} · ${diagnostics.installation.kind}`
                          : 'Not found',
                      ],
                      ['Open managed profile', diagnostics.activeProfile ?? 'None'],
                      [
                        'Code transcripts',
                        diagnostics.transcriptDirectory ? 'Directory found' : 'Not found',
                      ],
                      ['Session stores', String(diagnostics.sessionStores)],
                      ['Compatibility', diagnostics.compatibility],
                      ['Last synchronization', diagnostics.lastSync?.message ?? 'Not run yet'],
                      [
                        'Recovery',
                        diagnostics.recoveryPending
                          ? 'Restore needed'
                          : 'No interrupted operations',
                      ],
                      ['Last switch error', diagnostics.lastError ?? 'None'],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <button className="settings-link" disabled={busy} onClick={showDiagnostics}>
                  Refresh diagnostics
                  <History />
                </button>
              </>
            )}
          </section>
        )}
        {message && !editor && (
          <div
            className={`feedback ${error ? 'feedback-error' : ''}`}
            role={error ? 'alert' : 'status'}
          >
            <span>{message}</span>
            <button
              aria-label="Dismiss message"
              onClick={() => {
                setError(null)
                setNotice(null)
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </main>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null)
        }}
        title={editor?.profile ? 'Rename account' : 'Add account'}
        description={
          editor?.profile
            ? 'Update the name shown in your account list.'
            : 'Give the profile a name. Sign-in happens in Claude’s own window.'
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void perform(async () => {
              if (editor?.profile) {
                unwrap(await window.claudeSwitcher.renameProfile(editor.profile.id, name))
                setEditor(null)
              } else {
                const profile = unwrap(await window.claudeSwitcher.addProfile(name))
                setSelectedId(profile.id)
                setEditor(null)
                unwrap(await window.claudeSwitcher.switchProfile(profile.id))
              }
            })
          }}
        >
          <label htmlFor="account-name">Account name</label>
          <input
            id="account-name"
            autoFocus
            value={name}
            maxLength={40}
            required
            autoComplete="off"
            placeholder="For example, Personal"
            onChange={(event) => setName(event.target.value)}
          />
          {error && (
            <p className="dialog-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-buttons">
            <button type="button" onClick={() => setEditor(null)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !name.trim()}>
              {editor?.profile ? 'Save name' : 'Add & sign in'}
              {editor?.profile ? <Check /> : <Plus />}
            </button>
          </div>
        </form>
      </Dialog>
    </MotionConfig>
  )
}
