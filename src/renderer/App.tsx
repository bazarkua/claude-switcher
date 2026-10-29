import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { ArrowLeft, ArrowUpRight, ArrowRightLeft, Check, ChevronRight, CircleHelp, Code2, Ellipsis, FolderHeart, Layers3, LoaderCircle, LockKeyhole, Monitor, Moon, Plus, RefreshCw, Settings2, ShieldCheck, Sparkles, Sun, Terminal, Trash2, X } from 'lucide-react'
import type { Diagnostics, Profile, Reply, Snapshot } from '../shared/types'
import logo from '../../resources/logo.png'
import { Button } from './components/ui/button'
import { Dialog } from './components/ui/dialog'

const unwrap = <T,>(reply: Reply<T>): T => { if (!reply.ok) throw new Error(reply.error); return reply.value }
const stageLabels: Record<string, string> = { VALIDATING: 'Checking account', CHECKING_ACTIVITY: 'Checking Claude', CLOSING_SOURCE: 'Closing Claude', SNAPSHOTTING: 'Checking history', SYNCHRONIZING: 'Synchronizing history', LAUNCHING_TARGET: 'Opening account', VERIFYING: 'Verifying profile', RECOVERING: 'Restoring history' }
export function App(): React.JSX.Element {
  const [data, setData] = useState<Snapshot | null>(null)
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [page, setPage] = useState<'accounts' | 'settings' | 'diagnostics'>('accounts')
  const [addOpen, setAddOpen] = useState(false)
  const [manage, setManage] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)
  const refresh = useCallback(async () => {
    const value = unwrap(await window.claudeSwitcher.snapshot())
    setData(value)
    setSelectedId(current => value.profiles.some(p => p.id === current) ? current : value.activeId ?? value.profiles[0]?.id)
  }, [])
  useEffect(() => {
    Promise.resolve().then(refresh).catch(error => setError(error.message))
    return window.claudeSwitcher.onProgress(progress => setData(current => current ? { ...current, progress } : current))
  }, [refresh])
  useEffect(() => {
    if (!data) return
    document.documentElement.dataset.theme = data.settings.appearance
  }, [data])
  const perform = async (operation: () => Promise<void>): Promise<void> => {
    if (busy) return
    setBusy(true); setError(null); setNotice(null)
    try { await operation() } catch (error) { setError(error instanceof Error ? error.message : 'Something needs attention.') }
    finally { await refresh().catch(() => {}); setBusy(false) }
  }
  const selected = data?.profiles.find(p => p.id === selectedId)
  const active = selected && data?.activeId === selected.id
  const hasProfiles = !!data?.profiles.length
  const openDiagnostics = (): void => { setPage('diagnostics'); perform(async () => { setDiagnostics(unwrap(await window.claudeSwitcher.diagnostics())) }) }
  const saveAppearance = (appearance: 'system' | 'light' | 'dark'): void => { if (data) perform(async () => { unwrap(await window.claudeSwitcher.saveSettings({ ...data.settings, appearance })) }) }
  return <MotionConfig reducedMotion="user">
    <main className="app-shell" aria-busy={busy}>
      <div className="ambient ambient-peach" /><div className="ambient ambient-lilac" />
      <header className="header">
        <div className="brand"><div className="brand-mark"><img src={logo} alt="" /></div><span>claude<span className="brand-light">switcher</span><span className="brand-dot" /></span></div>
        <Button variant="ghost" size="icon" aria-label={page === 'accounts' ? 'Settings' : 'Back to accounts'} onClick={() => setPage(page === 'accounts' ? 'settings' : 'accounts')}>{page === 'accounts' ? <Settings2 size={18} /> : <X size={18} />}</Button>
      </header>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={page} className="page" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: .16 }}>
          {page === 'accounts' ? <>
            <div className="section-heading"><div><p className="eyebrow">A LITTLE MORE HEADSPACE</p><h1>Your accounts.</h1></div><span className="count-pill">{data?.profiles.length ?? 0} profiles</span></div>
            {hasProfiles ? <div className="account-list" role="group" aria-label="Claude accounts">
              {data.profiles.map(profile => <motion.div layout key={profile.id} className={`account-card ${selectedId === profile.id ? 'selected' : ''}`}>
                <button className="account-select" disabled={busy} aria-pressed={selectedId === profile.id} onClick={() => setSelectedId(profile.id)}>
                  <span className={`avatar ${profile.color}`}>{profile.name.slice(0, 1).toUpperCase()}</span>
                  <span className="account-info"><span className="account-name">{profile.name}{data.activeId === profile.id && <span className="active-label"><span />Open</span>}</span><span className="account-detail">{profile.connection === 'local-account-detected' ? 'Local account detected' : 'Sign-in unverified'}</span><span className="usage-label">Usage unavailable</span></span>
                  <span className="selection-dot">{selectedId === profile.id && <Check size={11} strokeWidth={3} />}</span>
                </button>
                <button className="account-menu" aria-label={`Manage ${profile.name}`} disabled={busy} onClick={() => { setManage(profile); setName(profile.name) }}><Ellipsis size={17} /></button>
              </motion.div>)}
            </div> : <div className="welcome-card">
              <div className="welcome-art"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><div className="floating-chip chip-one"><Layers3 size={16} /></div><img src={logo} alt="Interlocking peach and lavender glass ribbons" /><div className="floating-chip chip-two"><ArrowRightLeft size={15} /></div></div>
              <h2>A place for every<br />side of your work.</h2><p>Keep your Claude accounts together.<br />Give each one a space of its own.</p>
              <span className="welcome-tag"><LockKeyhole size={11} /> Private by design</span>
            </div>}
            {hasProfiles && <button className="add-account" disabled={busy} onClick={() => { setName(''); setAddOpen(true) }}><Plus size={15} /> Add another account<span>⌘ N</span></button>}
            <div className="continuity-card"><div className="continuity-icon"><Code2 size={19} /></div><div><h3>{data?.lastSync?.status === 'synced' ? 'Local Code history checked' : 'Keep the context.'}</h3><p>{data?.lastSync?.status === 'synced' ? 'Session references checked. Continuation unverified.' : 'Your original conversations stay on this Mac or PC.'}</p></div><ShieldCheck size={15} className="continuity-shield" /></div>
            <div className="bottom-actions">
              <AnimatePresence>{(error || notice) && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}><span>{error ?? notice}</span><button aria-label="Dismiss message" onClick={() => { setError(null); setNotice(null) }}><X size={13} /></button></motion.div>}</AnimatePresence>
              {data?.recoveryPending && <button className="recovery-alert" onClick={() => setPage('settings')}>An interrupted sync needs recovery <ChevronRight size={14} /></button>}
              <Button className="switch-button" disabled={busy || !data} onClick={() => { if (selected) perform(async () => { unwrap(await window.claudeSwitcher.switchProfile(selected.id)) }); else { setName(''); setAddOpen(true) } }}>
                {busy ? <LoaderCircle size={17} className="spin" /> : hasProfiles ? <ArrowRightLeft size={17} /> : <Plus size={18} />}
                {busy ? stageLabels[data?.progress.stage ?? ''] ?? 'Just a moment' : selected ? active ? `Open ${selected.name}` : `Switch to ${selected.name}` : 'Add your first account'}
                {!busy && <span className="action-key">↵</span>}
              </Button>
              <button className="open-claude" disabled={busy} onClick={() => perform(async () => { unwrap(await window.claudeSwitcher.openClaude()) })}>Open Claude Desktop <ArrowUpRight size={14} /></button>
            </div>
          </> : page === 'settings' ? <>
            <div className="subpage-heading"><p className="eyebrow">MAKE YOURSELF AT HOME</p><h1>A few preferences.</h1><p>The small things, just how you like them.</p></div>
            <section className="settings-card"><h2>Appearance</h2><div className="segmented">{([{ id: 'light', Icon: Sun, text: 'Light' }, { id: 'dark', Icon: Moon, text: 'Dark' }, { id: 'system', Icon: Monitor, text: 'System' }] as const).map(({ id, Icon, text }) => <button key={id} aria-pressed={data?.settings.appearance === id} disabled={busy} onClick={() => saveAppearance(id)}><Icon size={16} />{text}</button>)}</div></section>
            <section className="settings-card"><label className="preference-row"><span><strong>Code history</strong><small>Sync local references when switching</small></span><input type="checkbox" className="toggle" checked={data?.settings.syncOnSwitch ?? true} disabled={busy} onChange={event => { if (data) perform(async () => { unwrap(await window.claudeSwitcher.saveSettings({ ...data.settings, syncOnSwitch: event.target.checked })) }) }} /></label><div className="divider" /><label className="preference-row"><span><strong>Start with your computer</strong><small>Ready in the menu bar or system tray</small></span><input type="checkbox" className="toggle" checked={data?.settings.launchAtLogin ?? false} disabled={busy} onChange={event => { if (data) perform(async () => { unwrap(await window.claudeSwitcher.saveSettings({ ...data.settings, launchAtLogin: event.target.checked })) }) }} /></label></section>
            <section className="settings-card settings-links"><button onClick={openDiagnostics}><Terminal size={16} /><span>Diagnostics</span><ChevronRight size={15} /></button><button disabled={busy} onClick={() => perform(async () => { unwrap(await window.claudeSwitcher.revealBackups()) })}><FolderHeart size={16} /><span>Open session backups</span><ArrowUpRight size={15} /></button><button disabled={busy} onClick={() => perform(async () => { unwrap(await window.claudeSwitcher.chooseInstallation()) })}><Layers3 size={16} /><span>Locate Claude Desktop</span><ChevronRight size={15} /></button>{data?.recoveryPending && <button disabled={busy} onClick={() => perform(async () => { unwrap(await window.claudeSwitcher.recover()); setNotice('Original session references restored.') })}><RefreshCw size={16} /><span>Restore interrupted sync</span><ChevronRight size={15} /></button>}</section>
            <p className="settings-note"><ShieldCheck size={15} /> All account data stays on your computer. Authentication is handled by Claude.</p>
            {error && <div className="notice error" role="alert">{error}</div>}
            <button className="quit-button" disabled={busy} onClick={() => window.claudeSwitcher.quit()}>Quit Claude Switcher</button>
          </> : <>
            <button className="back-link" onClick={() => setPage('settings')}><ArrowLeft size={14} /> Preferences</button>
            <div className="subpage-heading compact"><p className="eyebrow">A LOOK UNDER THE SURFACE</p><h1>Everything local.</h1></div>
            {diagnostics ? <div className="settings-card diagnostics-card"><dl>{[
              ['System', diagnostics.os], ['Claude Desktop', diagnostics.installation.found ? `${diagnostics.installation.version} · ${diagnostics.installation.kind}` : 'Not found'], ['Open managed profile', diagnostics.activeProfile ?? 'None'], ['Code transcripts', diagnostics.transcriptDirectory ? 'Directory found' : 'Not found'], ['Session stores', String(diagnostics.sessionStores)], ['Compatibility', diagnostics.compatibility], ['Last synchronization', diagnostics.lastSync?.message ?? 'Not run yet'], ['Recovery', diagnostics.recoveryPending ? 'Restore needed' : 'No interrupted operations'], ['Last switch error', diagnostics.lastError ?? 'None'],
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div> : <div className="loading"><LoaderCircle className="spin" size={20} /></div>}
            <p className="settings-note"><CircleHelp size={16} /> Local history does not prove that another subscription can resume a session. Test a real request after switching.</p>
            <Button variant="secondary" disabled={busy} onClick={openDiagnostics}><RefreshCw size={15} /> Refresh diagnostics</Button>
            {error && <div className="notice error" role="alert">{error}</div>}
          </>}
        </motion.div>
      </AnimatePresence>
      <footer className="footer"><span><span className="privacy-dot" /> Local only. Always yours.</span><span>v0.1.0</span></footer>
    </main>
    <Dialog open={addOpen} onOpenChange={setAddOpen} title="Make room for an account." description="Give it a name. Claude will open a separate profile for you to sign in.">
      <form onSubmit={event => { event.preventDefault(); perform(async () => { const profile = unwrap(await window.claudeSwitcher.addProfile(name)); setSelectedId(profile.id); setAddOpen(false); unwrap(await window.claudeSwitcher.switchProfile(profile.id)) }) }}>
        <label className="field-label" htmlFor="account-name">Account name</label><input id="account-name" className="text-input" value={name} maxLength={40} placeholder="Personal, Work, a little of both…" onChange={event => setName(event.target.value)} required autoFocus />
        <div className="form-note"><LockKeyhole size={14} /><p>Your password and sign-in stay with Claude. Browser sign-in may return to your default Claude window. Check which account is open before proceeding.</p></div>
        <Button type="submit" className="full-width" disabled={!name.trim() || busy}><Plus size={16} /> Add & sign in</Button>
      </form>
    </Dialog>
    <Dialog open={!!manage} onOpenChange={open => { if (!open) setManage(null) }} title="A space of its own." description="Manage this local profile. Removing it from the list preserves its files and conversations.">
      <form onSubmit={event => { event.preventDefault(); if (manage) perform(async () => { unwrap(await window.claudeSwitcher.renameProfile(manage.id, name)); setManage(null) }) }}>
        <label className="field-label" htmlFor="rename-account">Account name</label><input id="rename-account" className="text-input" value={name} maxLength={40} onChange={event => setName(event.target.value)} required />
        <Button type="submit" className="full-width" variant="secondary" disabled={busy || !name.trim()}>Save name <Check size={15} /></Button>
      </form>
      <div className="manage-actions"><Button variant="ghost" disabled={busy} onClick={() => { if (manage) perform(async () => { const profile = unwrap(await window.claudeSwitcher.inspectProfile(manage.id)); setManage(null); setNotice(profile.connection === 'local-account-detected' ? 'Local account metadata found. Live authentication is still unverified.' : 'No unique Code account found. Sign in and create a Code conversation, then check again.') }) }}><RefreshCw size={15} /> Check local profile</Button><Button variant="ghost" disabled={busy} onClick={() => { if (manage) { const id = manage.id; setManage(null); perform(async () => { unwrap(await window.claudeSwitcher.openClaude(id)) }) } }}><Sparkles size={15} /> Open sign-in</Button><Button variant="danger" disabled={busy} onClick={() => { if (manage) perform(async () => { unwrap(await window.claudeSwitcher.removeProfile(manage.id)); setManage(null) }) }}><Trash2 size={15} /> Remove from list</Button></div>
    </Dialog>
  </MotionConfig>
}
