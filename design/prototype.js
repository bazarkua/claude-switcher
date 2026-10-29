const $ = (id) => document.getElementById(id)
const icon = (name) => `<svg aria-hidden="true"><use href="#${name}"/></svg>`
const escapeHTML = (value) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
let accounts = [
  {
    id: 1,
    name: 'Personal',
    current: true,
    remaining: 24,
    weekly: 68,
    reset: '1h 42m',
    weeklyReset: 'Fri, 10:00 AM',
  },
  {
    id: 2,
    name: 'Work',
    current: false,
    remaining: 91,
    weekly: 56,
    reset: '4h 18m',
    weeklyReset: 'Mon, 9:00 AM',
  },
]
let selected = 2,
  example = true,
  busy = false,
  editing = null,
  menuId = null,
  toastTimer
function notify(text) {
  $('toast').textContent = text
  $('toast').classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200)
}
function usage(label, remaining, reset, weekly = false) {
  return `<div class="usage-row"><div class="usage-labels"><span>${label}</span><span class="usage-left ${remaining < 30 ? 'low' : ''}">${remaining}% left</span></div><div class="progress ${weekly ? '' : 'clay'}" role="progressbar" aria-label="${label} remaining, example data" aria-valuenow="${remaining}" aria-valuemin="0" aria-valuemax="100"><span style="--value:${remaining}%"></span></div><div class="usage-caption"><span>Resets ${weekly ? '' : 'in '}${reset}</span><span class="window-label">${weekly ? '7 days' : '5 hours'}</span></div></div>`
}
function render() {
  $('count').textContent = accounts.length
  $('accounts').innerHTML = accounts.length
    ? accounts
        .map(
          (a) =>
            `<article class="account ${a.id === selected ? 'selected' : ''} ${a.id === 2 ? 'work' : ''}" tabindex="0" role="button" aria-label="Select ${escapeHTML(a.name)}" aria-pressed="${a.id === selected}" data-account="${a.id}"><div class="account-heading"><span class="avatar"><img src="claude-favicon.ico" alt="Claude"></span><div class="account-identity"><div class="account-name-row"><span class="account-name">${escapeHTML(a.name)}</span>${a.current ? '<span class="current-badge">Current</span>' : ''}</div><p class="account-subtitle">${example ? 'Pro · example account' : 'Sign-in unverified'}</p></div><span class="account-select-indicator">${a.id === selected ? icon('check') : ''}</span><button class="more" aria-label="Manage ${escapeHTML(a.name)}" data-menu="${a.id}">${icon('dots')}</button></div>${example ? usage('5-hour window', a.remaining, a.reset) + usage('Weekly limit', a.weekly, a.weeklyReset, true) : `<div class="unavailable">${icon('history')}<div><strong>Usage unavailable</strong>5-hour and weekly limits will appear here when verified data is available.</div></div>`}</article>`,
        )
        .join('')
    : `<div class="empty-card"><span class="avatar"><img src="claude-favicon.ico" alt="Claude"></span><h2>Add your first account</h2><p>Create a separate profile, then<br>sign in through Claude.</p></div>`
  const account = accounts.find((a) => a.id === selected)
  $('switch-text').textContent = account
    ? (account.current ? 'Open ' : 'Switch to ') + account.name
    : 'Add an account'
  $('example').classList.toggle('selected', example)
  $('unavailable').classList.toggle('selected', !example)
}
function choose(id) {
  if (busy) return
  selected = id
  document.querySelectorAll('[data-account]').forEach((card) => {
    const active = Number(card.dataset.account) === id
    card.classList.toggle('selected', active)
    card.setAttribute('aria-pressed', String(active))
    card.querySelector('.account-select-indicator').innerHTML = active ? icon('check') : ''
  })
  const account = accounts.find((a) => a.id === id)
  $('switch-text').textContent = (account.current ? 'Open ' : 'Switch to ') + account.name
}
$('accounts').addEventListener('click', (event) => {
  const menu = event.target.closest('[data-menu]')
  if (menu) {
    event.stopPropagation()
    menuId = Number(menu.dataset.menu)
    const box = menu.getBoundingClientRect(),
      app = $('accounts').closest('.app').getBoundingClientRect()
    $('account-menu').style.top = `${box.bottom - app.top + 5}px`
    $('account-menu').hidden = false
    return
  }
  const card = event.target.closest('[data-account]')
  if (card) choose(Number(card.dataset.account))
})
$('accounts').addEventListener('keydown', (event) => {
  if (event.target.closest('button')) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const card = event.target.closest('[data-account]')
    if (card) {
      choose(Number(card.dataset.account))
      document.querySelector(`[data-account="${selected}"]`).focus({ preventScroll: true })
    }
  }
})
document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-menu]') && !event.target.closest('.account-menu'))
    $('account-menu').hidden = true
})
function openAccount(id = null) {
  editing = id
  const a = accounts.find((a) => a.id === id)
  $('dialog-title').textContent = a ? 'Rename account' : 'Add account'
  $('save-account').innerHTML = (a ? 'Save name' : 'Add account') + icon(a ? 'check' : 'plus')
  $('account-name').value = a ? a.name : ''
  $('account-menu').hidden = true
  $('account-dialog').showModal()
  $('account-name').focus()
}
$('add').onclick = () => openAccount()
$('close-dialog').onclick = $('cancel').onclick = () => $('account-dialog').close()
$('account-form').onsubmit = (event) => {
  event.preventDefault()
  const name = $('account-name').value.trim()
  if (!name) return
  if (editing) {
    accounts.find((a) => a.id === editing).name = name
  } else {
    const id = Date.now()
    accounts.push({
      id,
      name,
      current: false,
      remaining: 100,
      weekly: 100,
      reset: '5h',
      weeklyReset: 'in 7 days',
    })
    selected = id
  }
  render()
  $('account-dialog').close()
  notify(editing ? 'Profile renamed.' : 'Demo profile added. Real sign-in will happen in Claude.')
}
$('rename').onclick = () => openAccount(menuId)
$('sign-in').onclick = () => {
  $('account-menu').hidden = true
  notify('Prototype only. The app will check local profile metadata.')
}
$('remove').onclick = () => {
  accounts = accounts.filter((a) => a.id !== menuId)
  if (selected === menuId) selected = accounts[0]?.id
  render()
  $('account-menu').hidden = true
  notify('Removed from this prototype. No real files were changed.')
}
$('switch').onclick = async () => {
  if (!accounts.length) {
    openAccount()
    return
  }
  if (busy) return
  busy = true
  $('switch').disabled = true
  const target = accounts.find((a) => a.id === selected)
  for (const label of ['Checking local history', 'Opening ' + target.name]) {
    $('switch-text').textContent = label
    await new Promise((r) => setTimeout(r, 650))
  }
  accounts.forEach((a) => (a.current = a.id === selected))
  busy = false
  $('switch').disabled = false
  render()
  notify('Demo switch complete. No real account was opened.')
}
$('sync').onclick = () => {
  $('sync').setAttribute('aria-checked', $('sync').getAttribute('aria-checked') !== 'true')
  notify(
    $('sync').getAttribute('aria-checked') === 'true'
      ? 'Local history sync on.'
      : 'Local history sync off.',
  )
}
$('login').onclick = () =>
  $('login').setAttribute('aria-checked', $('login').getAttribute('aria-checked') !== 'true')
function theme(value) {
  document.documentElement.dataset.theme = value
  for (const name of ['light', 'dark']) $(name).classList.toggle('selected', value === name)
  document
    .querySelectorAll('#appearance button')
    .forEach((b) => b.classList.toggle('selected', b.dataset.theme === value))
}
$('light').onclick = () => theme('light')
$('dark').onclick = () => theme('dark')
$('appearance').onclick = (e) => {
  const button = e.target.closest('[data-theme]')
  if (button) theme(button.dataset.theme)
}
$('example').onclick = () => {
  example = true
  render()
}
$('unavailable').onclick = () => {
  example = false
  render()
}
function preferences(on) {
  $('accounts-view').hidden = on
  $('preferences-view').hidden = !on
}
$('preferences').onclick = () => preferences($('preferences-view').hidden)
$('back').onclick = () => preferences(false)
document.querySelector('.brand').onclick = (e) => {
  e.preventDefault()
  preferences(false)
}
$('desktop').onclick = () => notify('Prototype only. The app will open Claude Desktop.')
$('diagnostics').onclick = () =>
  notify('Prototype: installation, profile, sync, and recovery status.')
$('backups').onclick = () => notify('Prototype only. The app will open your local backups.')
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('account-menu').hidden = true
    preferences(false)
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault()
    openAccount()
  }
})
render()
// A soft moving neutral field; motion stays outside the text surfaces.
const canvas = $('backdrop'),
  ctx = canvas.getContext('2d'),
  reduced = matchMedia('(prefers-reduced-motion: reduce)')
let w,
  h,
  last = 0,
  px = 0.5,
  py = 0.5
function resize() {
  w = innerWidth
  h = innerHeight
  const dpr = Math.min(devicePixelRatio, 2)
  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
addEventListener('resize', resize)
addEventListener(
  'pointermove',
  (e) => {
    px = e.clientX / innerWidth
    py = e.clientY / innerHeight
  },
  { passive: true },
)
function paint(time) {
  if (time - last < 50) {
    requestAnimationFrame(paint)
    return
  }
  last = time
  const dark = document.documentElement.dataset.theme === 'dark',
    t = reduced.matches ? 0 : time * 0.00009
  ctx.fillStyle = dark ? '#181818' : '#efefed'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 4; i++) {
    const x = w * (0.1 + i * 0.28) + Math.sin(t + i * 1.8) * w * 0.1 + (px - 0.5) * 15,
      y = h * (0.45 + Math.cos(t * 0.7 + i * 2) * 0.26) + (py - 0.5) * 15,
      r = w * 0.45
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(
      0,
      dark ? (i % 2 ? '#c4a78d0c' : '#bcbcbc0a') : i % 2 ? '#dac7b233' : '#ffffff99',
    )
    g.addColorStop(1, '#ffffff00')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  requestAnimationFrame(paint)
}
resize()
requestAnimationFrame(paint)
