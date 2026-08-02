import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Home, ListChecks, SlidersHorizontal, Users, LogOut, AlertTriangle, Printer,
  Mail, Share2, X, Trophy, Wallet, Trash2, Pencil, RefreshCw, ChevronRight, ChevronDown, FileText, User
} from 'lucide-react'
import logo from './assets/logo.png'

/* ------------------------------ helpers ------------------------------ */
const DEFAULT_SERVER = 'https://script.google.com/macros/s/AKfycbysEbLQPeC4JQPJV00QJfftF88hlooBay0VaHrU-bPYMzutHyIwxjRTb4n0K26MwquB/exec'
const LS_SERVER = 'ip_server'
const LS_PIN = 'ip_pin'
const LS_USER = 'ip_user'
const qsServer = new URLSearchParams(window.location.search).get('server')
if (qsServer) localStorage.setItem(LS_SERVER, qsServer)
const $ = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fdate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const first = (name) => String(name || '').split(' ')[0]
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const clientSum = (data, name) => {
  const earned = data.items.filter((i) => i.person === name).reduce((s, i) => s + i.amount, 0)
  const paid = (data.payments || []).filter((p) => p.employee === name).reduce((s, p) => s + p.amount, 0)
  return { earned: r2(earned), paid: r2(paid), owed: r2(earned - paid) }
}

async function fileToDataUrl(file, size = 256) {
  const bmp = await createImageBitmap(file)
  const sq = Math.min(bmp.width, bmp.height)
  const c = document.createElement('canvas')
  c.width = c.height = size
  c.getContext('2d').drawImage(bmp, (bmp.width - sq) / 2, (bmp.height - sq) / 2, sq, sq, 0, 0, size, size)
  return c.toDataURL('image/jpeg', 0.82)
}

function Avatar({ name, photo, size = 34 }) {
  const initials = String(name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return photo
    ? <img className="avatar" src={photo} alt={name} style={{ width: size, height: size }} />
    : <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials}</div>
}

async function apiGet(server, user, pin) {
  const res = await fetch(`${server}?user=${encodeURIComponent(user)}&pin=${encodeURIComponent(pin)}`, { redirect: 'follow' })
  const j = await res.json()
  if (!j.ok) throw new Error(j.error || 'Request failed')
  return j.data
}
async function apiPost(server, body) {
  const res = await fetch(server, {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  })
  const j = await res.json()
  if (!j.ok) throw new Error(j.error || 'Request failed')
  return j.data
}

/* ------------------------------ root app ------------------------------ */
export default function App() {
  const [server, setServer] = useState(() => localStorage.getItem(LS_SERVER) || DEFAULT_SERVER)
  const [user, setUser] = useState(() => localStorage.getItem(LS_USER) || '')
  const [pin, setPin] = useState(() => localStorage.getItem(LS_PIN) || '')
  const [data, setData] = useState(null)
  const [booting, setBooting] = useState(() => !!(localStorage.getItem(LS_PIN) && localStorage.getItem(LS_USER)))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [stub, setStub] = useState(null) // {employee, periodStart, periodEnd, paymentId?}

  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 2400) }

  const load = async (p = pin, u = user, s = server) => {
    if (!s || !p || !u) return
    setLoading(true); setError('')
    try {
      const d = await apiGet(s, u, p)
      setData(d)
      localStorage.setItem(LS_PIN, p)
      localStorage.setItem(LS_USER, u)
    } catch (e) {
      if (/No match|Email\/phone/i.test(e.message)) { localStorage.removeItem(LS_PIN); setPin(''); setData(null) }
      setError(e.message)
    } finally { setLoading(false); setBooting(false) }
  }
  useEffect(() => {
    history.replaceState({ base: true, tab: 'home' }, '')
    if (server && pin && user && !data) load()
    else setBooting(false)
  }, []) // eslint-disable-line

  const lastActionRef = useRef(0)
  const mutate = async (body) => {
    lastActionRef.current = Date.now()
    const d = await apiPost(server, { user, pin, ...body })
    setData(d)
    lastActionRef.current = Date.now()
    return d
  }

  const silentLoad = async () => {
    if (!server || !pin || !user || document.hidden) return
    const t0 = Date.now()
    try {
      const d = await apiGet(server, user, pin)
      if (lastActionRef.current < t0) setData(d)
    } catch { /* quiet — next tick will retry */ }
  }
  useEffect(() => {
    if (!data) return
    const iv = setInterval(silentLoad, 30000)
    const onWake = () => { if (!document.hidden) silentLoad() }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onWake); window.removeEventListener('focus', onWake) }
  }, [data ? 1 : 0, user, pin, server]) // eslint-disable-line

  const saveSelf = async (profile) => {
    const d = await mutate({ action: 'saveSelf', profile })
    if (profile.pin && profile.pin !== pin) { setPin(profile.pin); localStorage.setItem(LS_PIN, profile.pin) }
    if (user.includes('@') && profile.email) { const u = profile.email.trim().toLowerCase(); setUser(u); localStorage.setItem(LS_USER, u) }
    else if (!user.includes('@') && profile.phone) { const u = profile.phone.replace(/\D/g, ''); if (u) { setUser(u); localStorage.setItem(LS_USER, u) } }
    return d
  }

  const logout = () => { localStorage.removeItem(LS_PIN); setPin(''); setData(null) }
  const switchUser = () => { localStorage.removeItem(LS_PIN); localStorage.removeItem(LS_USER); setPin(''); setUser(''); setData(null) }

  let body
  if (!server) body = <Connect onSave={(u) => { localStorage.setItem(LS_SERVER, u); setServer(u) }} />
  else if (!data && booting) body = <Splash />
  else if (!data) body = <Login loading={loading} error={error} savedUser={user} onSwitchUser={switchUser}
    onSubmit={(u, p) => { setUser(u); setPin(p); load(p, u) }} />
  else if (data.role === 'owner') body = <OwnerApp data={data} mutate={mutate} reload={() => load()} say={say} openStub={setStub} />
  else body = <EmployeeApp data={data} say={say} openStub={setStub} reload={() => load()} saveSelf={saveSelf} />

  return (
    <div className="app">
      <div className="topbar no-print">
        <div className="brand"><span className="logo">InflataPay</span><span className="sub">by INFLATAPALOOZA</span></div>
        {data && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => load()} aria-label="Refresh"><RefreshCw size={16} /></button>
            <button className="btn btn-ghost btn-sm" onClick={logout} aria-label="Log out"><LogOut size={16} /></button>
          </div>
        )}

      </div>
      <div className="main">{body}</div>
      {stub && data && (
        <StubView data={data} stub={stub} onClose={() => setStub(null)} say={say}
          canEmail={data.role === 'owner'}
          onEmail={async () => {
            await apiPost(server, { user, pin, action: 'emailPaystub', employee: stub.employee, periodStart: stub.periodStart, periodEnd: stub.periodEnd, paymentId: stub.paymentId })
            say('Emailed to ' + first(stub.employee))
          }} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function Splash() {
  return (
    <div className="center" style={{ paddingTop: '18dvh' }}>
      <img src={logo} alt="InflataPalooza" style={{ width: 220, maxWidth: '72%' }} />
      <div className="spin" />
    </div>
  )
}

/* ------------------------------ connect & login ------------------------------ */
function Connect({ onSave }) {
  const [u, setU] = useState('')
  const ok = /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(u.trim())
  return (
    <div className="mt20">
      <div className="hero">
        <div className="hi">Welcome to</div>
        <div className="big" style={{ fontSize: 28 }}>InflataPay</div>
        <div className="small">One-time setup: paste your Google Apps Script Web App URL to connect this device to your sheet.</div>
      </div>
      <div className="card">
        <div className="field">
          <label>Web App URL (ends in /exec)</label>
          <input placeholder="https://script.google.com/macros/s/…/exec" value={u} onChange={(e) => setU(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-block" disabled={!ok} onClick={() => onSave(u.trim())}>Connect</button>
        {!ok && u && <div className="muted mt8">That doesn't look like an Apps Script /exec URL yet.</div>}
      </div>
    </div>
  )
}

function Login({ onSubmit, loading, error, savedUser, onSwitchUser }) {
  const [who, setWho] = useState(savedUser || '')
  const [stage, setStage] = useState(savedUser ? 'pin' : 'who')
  const [p, setP] = useState('')
  const [shake, setShake] = useState(false)
  useEffect(() => { if (error) { setShake(true); setP(''); setTimeout(() => setShake(false), 450) } }, [error])
  useEffect(() => { if (p.length === 4) onSubmit(who.trim(), p) }, [p]) // eslint-disable-line
  const press = (d) => { if (p.length < 4 && !loading) setP(p + d) }
  const whoOk = who.includes('@') ? /.+@.+\..+/.test(who) : who.replace(/\D/g, '').length >= 10

  if (stage === 'who') return (
    <div className="mt20">
      <div className="center"><img src={logo} alt="InflataPalooza" style={{ width: 230, maxWidth: '78%' }} />
        <h2 style={{ fontWeight: 800, marginTop: 10 }}>Welcome to InflataPay</h2>
        <div className="muted mt8">Sign in with the email or cell number on file</div>
      </div>
      <div className="card mt14">
        <div className="field"><label>Email or phone</label>
          <input autoFocus autoCapitalize="none" autoCorrect="off" inputMode="email" placeholder="you@email.com or 801-555-1234"
            value={who} onChange={(e) => setWho(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && whoOk) setStage('pin') }} />
        </div>
        <button className="btn btn-primary btn-block" disabled={!whoOk} onClick={() => setStage('pin')}>Continue</button>
      </div>
    </div>
  )

  return (
    <div className="center mt20">
      <img src={logo} alt="InflataPalooza" style={{ width: 200, maxWidth: '72%' }} />
      <h2 style={{ fontWeight: 800, marginTop: 10 }}>Enter your PIN</h2>
      <div className="muted mt8">
        {loading ? 'Checking…' : error ? <span className="err">{error}</span> : <>as <b>{who}</b> · <button style={{ color: 'var(--blue)', fontWeight: 700 }} onClick={() => { setStage('who'); setP(''); onSwitchUser && onSwitchUser() }}>switch</button></>}
      </div>
      <div className={'pindots' + (shake ? ' shake' : '')}>
        {[0, 1, 2, 3].map((i) => <div key={i} className={'pindot' + (p.length > i ? ' on' : '')} />)}
      </div>
      <div className="pinpad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => <button key={d} onClick={() => press(String(d))}>{d}</button>)}
        <button style={{ visibility: 'hidden' }} />
        <button onClick={() => press('0')}>0</button>
        <button onClick={() => setP(p.slice(0, -1))} style={{ fontSize: 18 }}>⌫</button>
      </div>
    </div>
  )
}

/* ------------------------------ work summary ------------------------------ */
function summaryGroups(items, labels) {
  const P = {
    clean: { label: 'Units Cleaned', order: 1, qty: 0, amt: 0, kids: {} },
    roll: { label: 'Units Rolled', order: 2, qty: 0, amt: 0, kids: {} },
    delivery: { label: 'Delivery Setups/Takedowns', order: 3, qty: 0, amt: 0 },
    pickup: { label: 'Customer Pickup/Returns', order: 4, qty: 0, amt: 0 },
    misc: { label: 'Misc. Hours', order: 5, qty: 0, amt: 0 },
  }
  items.forEach((i) => {
    if (i.kind === 'clean') {
      P.clean.qty += 1; P.clean.amt += i.amount
      const k = i.cat || '?'
      const c = P.clean.kids[k] = P.clean.kids[k] || { label: (labels || {})[k] || k, qty: 0, amt: 0 }
      c.qty += 1; c.amt += i.amount
    } else if (i.kind === 'roll') {
      P.roll.qty += 1; P.roll.amt += i.amount
      const k = i.cat || '?'
      const c = P.roll.kids[k] = P.roll.kids[k] || { label: (labels || {})[k] || k, qty: 0, amt: 0 }
      c.qty += 1; c.amt += i.amount
    }
    else if (i.kind === 'delivery') { P.delivery.qty += i.qty; P.delivery.amt += i.amount }
    else if (i.kind === 'pickup') { P.pickup.qty += i.qty; P.pickup.amt += i.amount }
    else { P.misc.qty += i.qty; P.misc.amt += i.amount }
  })
  return Object.values(P).filter((g) => g.qty > 0 || g.amt !== 0).sort((a, b) => a.order - b.order)
    .map((g) => ({
      label: g.label, qty: g.qty, amt: r2(g.amt),
      children: g.kids ? Object.values(g.kids).sort((a, b) => (a.label < b.label ? -1 : 1)).map((c) => ({ ...c, amt: r2(c.amt) })) : [],
    }))
}

function WorkSummary({ items, labels, title }) {
  const groups = summaryGroups(items, labels)
  const total = r2(items.reduce((s, i) => s + i.amount, 0))
  const [open, setOpen] = useState({})
  if (!groups.length) return null
  return (
    <div className="card">
      {title && <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>{title}</div>}
      {groups.map((gr) => {
        const expandable = (gr.children || []).length > 0
        const isOpen = !!open[gr.label]
        return (
          <React.Fragment key={gr.label}>
            <button className="list-item btn-block" style={{ padding: '8px 2px', textAlign: 'left', cursor: expandable ? 'pointer' : 'default' }}
              onClick={() => expandable && setOpen({ ...open, [gr.label]: !isOpen })}>
              <div className="li-main" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {expandable ? (isOpen ? <ChevronDown size={15} color="var(--faint)" /> : <ChevronRight size={15} color="var(--faint)" />) : <span style={{ width: 15 }} />}
                <div className="li-title" style={{ fontSize: 14.5 }}>{gr.label}</div>
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                <span className="li-sub" style={{ minWidth: 28, textAlign: 'right', fontWeight: 700 }}>×{gr.qty}</span>
                <span className="li-amt" style={{ minWidth: 70, textAlign: 'right' }}>{$(gr.amt)}</span>
              </div>
            </button>
            {isOpen && (gr.children || []).map((c) => (
              <div className="list-item" key={c.label} style={{ padding: '3px 2px 3px 36px', borderBottom: 'none' }}>
                <div className="li-sub">· {c.label}</div>
                <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                  <span className="li-sub" style={{ minWidth: 28, textAlign: 'right' }}>×{c.qty}</span>
                  <span className="li-sub" style={{ minWidth: 70, textAlign: 'right' }}>{$(c.amt)}</span>
                </div>
              </div>
            ))}
          </React.Fragment>
        )
      })}
      <div className="list-item" style={{ padding: '9px 2px', borderTop: '1.5px solid var(--hairline)' }}>
        <div className="li-title">Total</div>
        <div className="li-amt" style={{ color: 'var(--blue)', fontSize: 16 }}>{$(total)}</div>
      </div>
    </div>
  )
}

/* ------------------------------ owner ------------------------------ */
function OwnerApp({ data, mutate, say, openStub }) {
  const [tab, setTab] = useState('home')
  const nav = (t) => { if (t !== tab) { history.pushState({ tab: t }, ''); setTab(t) } }
  useEffect(() => {
    const h = (e) => { const st = e.state || {}; if (st.tab) setTab(st.tab); else if (st.base) setTab('home') }
    window.addEventListener('popstate', h)
    return () => window.removeEventListener('popstate', h)
  }, [])
  const [payFor, setPayFor] = useState(null)
  const [fixKey, setFixKey] = useState(null)
  const [editEmp, setEditEmp] = useState(null)
  const payroll = data.employees.filter((e) => e.inPayroll && e.active)
  const issues = data.issues || []

  const lastPaidEnd = (name) => {
    const ps = data.payments.filter((p) => p.employee === name).map((p) => p.periodEnd).sort()
    return ps.length ? ps[ps.length - 1] : null
  }
  const seasonStart = useMemo(() => {
    const ds = data.items.map((i) => i.date).sort()
    return ds[0] || todayISO()
  }, [data.items])

  const suggestPeriod = (name) => {
    const le = lastPaidEnd(name)
    return { start: le ? addDays(le, 1) : seasonStart, end: todayISO() }
  }

  return (
    <>
      {tab === 'home' && (
        <OwnerHome data={data} payroll={payroll} onPay={setPayFor} suggestPeriod={suggestPeriod} openStub={openStub}
          issuesCount={issues.length} goIssues={() => nav('entries')} />
      )}
      {tab === 'entries' && (
        <Entries data={data} issues={issues} onFix={setFixKey} />
      )}
      {tab === 'rates' && <Rates data={data} mutate={mutate} say={say} />}
      {tab === 'team' && <Team data={data} onEdit={setEditEmp} />}

      <div className="tabbar no-print">
        <TabBtn icon={<Home size={20} />} label="Home" on={tab === 'home'} onClick={() => nav('home')} />
        <TabBtn icon={<ListChecks size={20} />} label="Entries" on={tab === 'entries'} onClick={() => nav('entries')} badge={issues.length} />
        <TabBtn icon={<SlidersHorizontal size={20} />} label="Rates" on={tab === 'rates'} onClick={() => nav('rates')} />
        <TabBtn icon={<Users size={20} />} label="Team" on={tab === 'team'} onClick={() => nav('team')} />
      </div>

      {payFor && (
        <PayModal name={payFor} data={data} suggest={suggestPeriod(payFor)}
          onClose={() => setPayFor(null)}
          onSaved={(stubReq) => { say('Payment recorded'); if (stubReq) openStub(stubReq) }}
          mutate={mutate} />
      )}
      {fixKey && (
        <FixupModal rowKey={fixKey} data={data} mutate={mutate} say={say} onClose={() => setFixKey(null)} />
      )}
      {editEmp && (
        <EmployeeModal emp={editEmp} mutate={mutate} say={say} onClose={() => setEditEmp(null)} />
      )}
    </>
  )
}

function TabBtn({ icon, label, on, onClick, badge }) {
  return (
    <button className={on ? 'on' : ''} onClick={onClick} style={{ position: 'relative' }}>
      {icon}<span>{label}</span>
      {badge > 0 && <span style={{ position: 'absolute', top: 0, right: 2, background: 'var(--gold)', color: '#3a2900', borderRadius: 999, fontSize: 10, fontWeight: 800, padding: '1px 6px' }}>{badge}</span>}
    </button>
  )
}

function OwnerHome({ data, payroll, onPay, suggestPeriod, openStub, issuesCount, goIssues }) {
  const totalOwed = payroll.reduce((s, e) => s + ((data.summaries[e.name] || {}).owed || 0), 0)
  return (
    <>
      <div className="hero">
        <div className="hi">Total owed to your team</div>
        <div className="big">{$(totalOwed)}</div>
        <div className="small">Pull up your bank, send the ACH, then record it here — the paystub is one tap away.</div>
      </div>

      {issuesCount > 0 && (
        <button className="card tap btn-block" style={{ textAlign: 'left' }} onClick={goIssues}>
          <div className="row">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <AlertTriangle size={20} color="var(--gold-ink)" />
              <div>
                <div className="li-title">{issuesCount} {issuesCount === 1 ? 'entry needs' : 'entries need'} your review</div>
                <div className="li-sub">Missing units, unknown names, or unrated work</div>
              </div>
            </div>
            <ChevronRight size={18} color="var(--faint)" />
          </div>
        </button>
      )}

      <div className="section-title">Payroll</div>
      {payroll.map((e) => {
        const s = data.summaries[e.name] || { earned: 0, paid: 0, owed: 0 }
        const sp = suggestPeriod(e.name)
        return (
          <div className="card" key={e.name}>
            <div className="row">
              <div>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{e.name}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>Earned {$(s.earned)} · Paid {$(s.paid)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="stat-row" style={{ gap: 0 }}>
                  <div>
                    <div className="stat" style={{ boxShadow: 'none', padding: 0 }}>
                      <div className="k">Owed</div>
                      <div className={'v ' + (s.owed > 0 ? 'gold' : 'green')}>{$(s.owed)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-gold btn-sm" style={{ flex: 1 }} onClick={() => onPay(e.name)}><Wallet size={15} /> Pay & record</button>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => openStub({ employee: e.name, periodStart: sp.start, periodEnd: sp.end })}><FileText size={15} /> Statement</button>
            </div>
          </div>
        )
      })}

      {data.employees.filter((e) => e.active && !e.inPayroll).length > 0 && (
        <>
          <div className="section-title">Tracked · not in payroll</div>
          {data.employees.filter((e) => e.active && !e.inPayroll).map((e) => {
            const mine = data.items.filter((i) => i.person === e.name)
            const earned = mine.reduce((s, i) => s + i.amount, 0)
            const cleans = mine.filter((i) => i.kind === 'clean' && !i.flags.includes('nopay')).length
            const rolls = mine.filter((i) => i.kind === 'roll' && !i.flags.includes('nopay')).length
            const dels = mine.filter((i) => i.kind === 'delivery').reduce((s, i) => s + i.qty, 0)
            const sp = suggestPeriod(e.name)
            return (
              <div className="card" key={e.name}>
                <div className="row">
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{e.name} <span className="tag tag-teal">tracked</span></div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{cleans} cleans · {rolls} rolls{dels ? ` · ${dels} deliveries` : ''} · season value {$(earned)}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => openStub({ employee: e.name, periodStart: sp.start, periodEnd: sp.end })}><FileText size={15} /> Statement</button>
                </div>
              </div>
            )
          })}
        </>
      )}

      <div className="section-title">Leaderboard · season</div>
      <div className="card"><Leaderboard rows={(data.leaderboard || {}).season || []} photos={data.photos} /></div>
    </>
  )
}

/* ------------------------------ entries + fixups ------------------------------ */
function Entries({ data, issues, onFix }) {
  const [person, setPerson] = useState('All')
  const [win, setWin] = useState('season')
  const [custom, setCustom] = useState({ start: '', end: '' })
  const people = ['All', ...data.employees.filter((e) => e.active).map((e) => e.name)]
  const t = todayISO()
  const from = win === '7d' ? addDays(t, -7) : win === '30d' ? addDays(t, -30) : win === 'custom' ? (custom.start || '0000') : '0000'
  const to = win === 'custom' ? (custom.end || t) : t
  const issueKeys = new Set(issues.map((i) => i.key))

  const rows = data.items
    .filter((i) => (person === 'All' || i.person === person) && i.date >= from && i.date <= to)
    .sort((a, b) => b.tsMs - a.tsMs)
  const total = rows.reduce((s, i) => s + i.amount, 0)

  return (
    <>
      {issues.length > 0 && (
        <div className="card" style={{ background: '#fffbef', border: '1px solid #f5e3ad' }}>
          <div style={{ fontWeight: 800, marginBottom: 6, display: 'flex', gap: 8, alignItems: 'center' }}><AlertTriangle size={17} color="var(--gold-ink)" /> Fix-It queue</div>
          {issues.map((iss, n) => (
            <button key={n} className="list-item btn-block" style={{ textAlign: 'left' }} onClick={() => onFix(iss.key)}>
              <div className="li-main">
                <div className="li-title">{iss.detail}</div>
                <div className="li-sub">{fdate(iss.date)} · tap to fix</div>
              </div>
              <ChevronRight size={17} color="var(--faint)" />
            </button>
          ))}
        </div>
      )}

      <div className="chiprow">
        {people.map((p) => <button key={p} className={'chip' + (person === p ? ' on' : '')} onClick={() => setPerson(p)}>{p === 'All' ? 'All' : first(p)}</button>)}
      </div>
      <div className="chiprow">
        {[['season', 'Season'], ['30d', '30 days'], ['7d', '7 days'], ['custom', 'Custom']].map(([k, l]) =>
          <button key={k} className={'chip' + (win === k ? ' on' : '')} onClick={() => setWin(k)}>{l}</button>)}
      </div>
      {win === 'custom' && (
        <div className="grid2" style={{ marginBottom: 10 }}>
          <div className="field"><label>From</label><input type="date" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} /></div>
          <div className="field"><label>To</label><input type="date" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} /></div>
        </div>
      )}

      <WorkSummary items={rows} labels={data.labels} title={(person === 'All' ? 'Everyone' : first(person)) + ' — work summary'} />

      <div className="card">
        <div className="row" style={{ marginBottom: 6 }}>
          <div className="muted">{rows.length} entries</div>
          <div style={{ fontWeight: 800 }}>{$(total)}</div>
        </div>
        {rows.map((i, n) => (
          <button key={n} className={'list-item btn-block' + (issueKeys.has(i.key) ? ' flagged' : '')} style={{ textAlign: 'left' }} onClick={() => onFix(i.key)}>
            <div className="li-main">
              <div className="li-title">{i.label}</div>
              <div className="li-sub">
                {fdate(i.date)} · {first(i.person)}
                {i.flags.includes('double') && <> · <span className="tag tag-teal">2× pay</span></>}
                {i.flags.includes('nopay') && <> · <span className="tag tag-blue">personal use</span></>}
                {i.flags.includes('override') && <> · <span className="tag tag-gold">adjusted</span></>}
                {i.flags.includes('unrated') && <> · <span className="tag tag-red">no rate</span></>}
                {i.notes && <> · {i.notes.slice(0, 48)}</>}
              </div>
            </div>
            <div className={'li-amt' + (i.amount === 0 ? ' zero' : '')}>{$(i.amount)}</div>
          </button>
        ))}
        {rows.length === 0 && <div className="muted center" style={{ padding: 20 }}>Nothing in this window.</div>}
      </div>
    </>
  )
}

function FixupModal({ rowKey, data, mutate, say, onClose }) {
  const existing = (data.fixups || {})[rowKey] || {}
  const o = existing.override || {}
  const sample = data.items.find((i) => i.key === rowKey)
  const unitNames = Object.keys(data.units || {}).sort()
  const people = data.employees.map((e) => e.name)
  const [unit, setUnit] = useState(o.unit || '')
  const [exclude, setExclude] = useState(!!o.exclude)
  const [flatOn, setFlatOn] = useState(!!o.flat)
  const [flat, setFlat] = useState(o.flat || { person: people[1] || '', amount: '', label: '' })
  const [puOn, setPuOn] = useState(!!o.pickupCredit)
  const [pu, setPu] = useState(o.pickupCredit || { person: people[1] || '', count: 1 })
  const [note, setNote] = useState(existing.note || '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    const override = {}
    if (unit) override.unit = unit
    if (exclude) override.exclude = true
    if (flatOn && flat.person && flat.amount !== '') override.flat = { person: flat.person, amount: Number(flat.amount), label: flat.label || 'Adjustment' }
    if (puOn && pu.person) override.pickupCredit = { person: pu.person, count: Number(pu.count) || 1 }
    try { await mutate({ action: 'saveFixup', rowKey, override, note }); say('Saved'); history.back() }
    catch (e) { say(e.message) } finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    try { await mutate({ action: 'deleteFixup', rowKey }); say('Overrides removed'); history.back() }
    catch (e) { say(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal onClose={onClose} title="Fix this entry">
      {sample && <div className="muted" style={{ marginBottom: 12 }}>{fdate(sample.date)} · {sample.label} {sample.notes ? `· "${sample.notes}"` : ''}</div>}
      <div className="field">
        <label>Unit (blank = leave as logged)</label>
        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="">— no change —</option>
          {unitNames.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <ToggleRow label="Exclude this entry from pay & leaderboard" on={exclude} set={setExclude} />
      <ToggleRow label="Replace with a flat amount (one-off deals)" on={flatOn} set={setFlatOn} />
      {flatOn && (
        <div className="grid2">
          <div className="field"><label>Person</label>
            <select value={flat.person} onChange={(e) => setFlat({ ...flat, person: e.target.value })}>{people.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div className="field"><label>Amount</label><input type="number" inputMode="decimal" value={flat.amount} onChange={(e) => setFlat({ ...flat, amount: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>Label</label><input value={flat.label} onChange={(e) => setFlat({ ...flat, label: e.target.value })} placeholder="e.g. Filming day — 5.5 hr @ $20/hr" /></div>
        </div>
      )}
      <ToggleRow label="Add customer pickup/return credit" on={puOn} set={setPuOn} />
      {puOn && (
        <div className="grid2">
          <div className="field"><label>Person</label>
            <select value={pu.person} onChange={(e) => setPu({ ...pu, person: e.target.value })}>{people.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div className="field"><label>How many</label><input type="number" inputMode="numeric" value={pu.count} onChange={(e) => setPu({ ...pu, count: e.target.value })} /></div>
        </div>
      )}
      <div className="field"><label>Note (for your records)</label><input value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={save}>Save fix</button>
        {(existing.override) && <button className="btn btn-danger btn-sm" disabled={busy} onClick={remove}><Trash2 size={15} /></button>}
      </div>
    </Modal>
  )
}

function ToggleRow({ label, on, set }) {
  return (
    <button className="row btn-block" style={{ padding: '10px 0', textAlign: 'left' }} onClick={() => set(!on)}>
      <span style={{ fontWeight: 600, fontSize: 14.5 }}>{label}</span>
      <span style={{ width: 44, height: 26, borderRadius: 999, background: on ? 'var(--blue)' : '#dde4ee', position: 'relative', transition: '.15s', flex: '0 0 auto' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: 'var(--shadow-sm)', transition: '.15s' }} />
      </span>
    </button>
  )
}

/* ------------------------------ pay & paystub ------------------------------ */
function PayModal({ name, data, suggest, onClose, onSaved, mutate }) {
  const s = data.summaries[name] || { owed: 0 }
  const [start, setStart] = useState(suggest.start)
  const [end, setEnd] = useState(suggest.end)
  const [amount, setAmount] = useState(String(s.owed.toFixed(2)))
  const [method, setMethod] = useState('ACH')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const periodEarned = useMemo(() =>
    data.items.filter((i) => i.person === name && i.date >= start && i.date <= end).reduce((t, i) => t + i.amount, 0),
    [data.items, name, start, end])

  const save = async (thenStub) => {
    setBusy(true)
    try {
      const fresh = await mutate({ action: 'addPayment', payment: { employee: name, amount: Number(amount), periodStart: start, periodEnd: end, method, note } })
      const mine = fresh.payments.filter((p) => p.employee === name)
      const newest = mine[mine.length - 1]
      history.back()
      setTimeout(() => onSaved(thenStub ? { employee: name, periodStart: start, periodEnd: end, paymentId: newest && newest.id } : null), 80)
    } catch (e) { alert(e.message); setBusy(false) }
  }

  return (
    <Modal onClose={onClose} title={`Pay ${first(name)}`}>
      <div className="stat-row" style={{ marginBottom: 14 }}>
        <div className="stat"><div className="k">Balance owed</div><div className="v gold">{$(s.owed)}</div></div>
        <div className="stat"><div className="k">Earned this period</div><div className="v blue">{$(periodEarned)}</div></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Period start</label><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="field"><label>Period end</label><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Amount you're paying</label><input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="field"><label>Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {['ACH', 'Venmo', 'Cash', 'Check', 'Other'].map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label>Note (optional)</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Bank ACH conf #…" /></div>
      <div className="muted" style={{ marginBottom: 12 }}>Send the money from your bank first, then record it here. InflataPay never moves money.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" style={{ flex: 1.4 }} disabled={busy || !(Number(amount) > 0)} onClick={() => save(true)}>Record & open paystub</button>
        <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy || !(Number(amount) > 0)} onClick={() => save(false)}>Just record</button>
      </div>
    </Modal>
  )
}

function StubView({ data, stub, onClose, canEmail, onEmail, say }) {
  const pushed = useRef(false)
  useEffect(() => {
    history.pushState({ layer: 'stub' }, '')
    pushed.current = true
    const h = () => { pushed.current = false; onClose() }
    window.addEventListener('popstate', h)
    return () => { window.removeEventListener('popstate', h); if (pushed.current) { pushed.current = false; history.back() } }
  }, []) // eslint-disable-line
  const close = () => history.back()
  const { employee, periodStart, periodEnd, paymentId } = stub
  const items = data.items
    .filter((i) => i.person === employee && i.date >= periodStart && i.date <= periodEnd)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const total = items.reduce((s, i) => s + i.amount, 0)
  const payment = paymentId ? data.payments.find((p) => p.id === paymentId) : null
  const sum = data.role === 'owner' ? (data.summaries[employee] || clientSum(data, employee)) : data.summary
  const [busy, setBusy] = useState(false)

  const shareText = () => {
    const t = `InflataPalooza Earnings Statement\n${employee} · ${fdate(periodStart)} – ${fdate(periodEnd)}\nPeriod total: ${$(total)}${payment ? `\nPaid: ${$(payment.amount)} (${payment.method})` : ''}\nSeason: earned ${$(sum.earned)} · paid ${$(sum.paid)} · balance ${$(sum.owed)}`
    if (navigator.share) navigator.share({ text: t }).catch(() => {})
    else { navigator.clipboard.writeText(t); say('Copied — paste into a text') }
  }

  return (
    <div className="modal-back" style={{ alignItems: 'stretch' }}>
      <div className="modal" style={{ borderRadius: 0, maxHeight: '100dvh', paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}>
        <div className="row no-print" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Earnings Statement</h3>
          <button className="btn btn-ghost btn-sm" onClick={close}><X size={17} /></button>
        </div>
        <div className="stub">
          <div className="stub-head">
            <div style={{ fontWeight: 800, fontSize: 20 }}>InflataPalooza</div>
            <div style={{ opacity: .92, fontSize: 12.5 }}>Earnings Statement · Independent contractor</div>
          </div>
          <div className="stub-body">
            <div className="row" style={{ marginBottom: 12 }}>
              <div><div className="li-sub">PAID TO</div><div style={{ fontWeight: 800 }}>{employee}</div></div>
              <div style={{ textAlign: 'right' }}><div className="li-sub">PERIOD</div><div style={{ fontWeight: 800 }}>{fdate(periodStart)} – {fdate(periodEnd)}</div></div>
            </div>
            <div className="stub-sec">WORK SUMMARY</div>
            <table style={{ marginBottom: 4 }}>
              <thead><tr><th>TYPE</th><th className="tr">QTY</th><th className="tr">AMOUNT</th></tr></thead>
              <tbody>
                {summaryGroups(items, data.labels).map((gr) => (
                  <React.Fragment key={gr.label}>
                    <tr><td style={{ fontWeight: 700 }}>{gr.label}</td><td className="tr" style={{ fontWeight: 700 }}>{gr.qty}</td><td className="tr" style={{ fontWeight: 700 }}>{$(gr.amt)}</td></tr>
                    {(gr.children || []).map((c) => (
                      <tr key={c.label} className="subrow"><td style={{ paddingLeft: 20 }}>· {c.label}</td><td className="tr">{c.qty}</td><td className="tr">{$(c.amt)}</td></tr>
                    ))}
                  </React.Fragment>
                ))}
                <tr><td style={{ fontWeight: 800, borderBottom: 'none', paddingTop: 10 }}>Total</td><td style={{ borderBottom: 'none' }} /><td className="tr" style={{ fontWeight: 800, color: 'var(--blue)', borderBottom: 'none', paddingTop: 10 }}>{$(total)}</td></tr>
              </tbody>
            </table>
            <div className="stub-sec">ENTRIES</div>
            {items.map((i, n) => (
              <div key={n} className="list-item">
                <div className="li-main">
                  <div className="li-title" style={{ fontSize: 14 }}>{i.label}</div>
                  <div className="li-sub">
                    {fdate(i.date)}
                    {i.flags.includes('double') && <> · <span className="tag tag-teal">2× pay</span></>}
                    {i.flags.includes('nopay') && <> · <span className="tag tag-blue">personal use</span></>}
                    {i.flags.includes('override') && <> · <span className="tag tag-gold">adjusted</span></>}
                    {i.notes && <> · {i.notes.slice(0, 60)}</>}
                  </div>
                </div>
                <div className={'li-amt' + (i.amount === 0 ? ' zero' : '')}>{$(i.amount)}</div>
              </div>
            ))}
            <div className="row" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 800 }}>Period total</div>
              <div style={{ fontWeight: 800, color: 'var(--blue)' }}>{$(total)}</div>
            </div>
            {payment && (
              <div className="row" style={{ marginTop: 4 }}>
                <div className="li-sub">Payment · {payment.method} · {fdate(payment.recorded)}</div>
                <div style={{ fontWeight: 700, color: 'var(--green)' }}>−{$(payment.amount)}</div>
              </div>
            )}
            <div className="mt14" style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
              Season to date — Earned <b>{$(sum.earned)}</b> · Paid <b>{$(sum.paid)}</b> · Balance <b style={{ color: 'var(--blue)' }}>{$(sum.owed)}</b>
            </div>
          </div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => window.print()}><Printer size={16} /> PDF</button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={shareText}><Share2 size={16} /> Text</button>
          {canEmail && <button className="btn btn-primary" style={{ flex: 1.2 }} disabled={busy} onClick={async () => { setBusy(true); try { await onEmail() } catch (e) { say(e.message) } finally { setBusy(false) } }}><Mail size={16} /> Email</button>}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ rates ------------------------------ */
function Rates({ data, mutate, say }) {
  const r = data.rates
  const [cats, setCats] = useState(() => JSON.parse(JSON.stringify(r.cats)))
  const [special, setSpecial] = useState({ ...r.special })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try { await mutate({ action: 'saveRates', rates: cats, special }); say('Rates saved') }
    catch (e) { say(e.message) } finally { setBusy(false) }
  }
  return (
    <>
      <div className="section-title">Clean & roll rates</div>
      <div className="card">
        {Object.keys(cats).map((k) => (
          <div key={k} style={{ padding: '10px 0', borderBottom: '1px solid var(--hairline)' }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 8 }}>{r.labels[k] || k}</div>
            <div className="grid2">
              <div className="field" style={{ marginBottom: 0 }}><label>Clean $</label>
                <input type="number" inputMode="decimal" value={cats[k].clean} onChange={(e) => setCats({ ...cats, [k]: { ...cats[k], clean: e.target.value } })} /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Roll $</label>
                <input type="number" inputMode="decimal" value={cats[k].roll} onChange={(e) => setCats({ ...cats, [k]: { ...cats[k], roll: e.target.value } })} /></div>
            </div>
          </div>
        ))}
      </div>
      <div className="section-title">Other work</div>
      <div className="card">
        <div className="grid2">
          <div className="field"><label>Per delivery $</label><input type="number" inputMode="decimal" value={special.delivery} onChange={(e) => setSpecial({ ...special, delivery: e.target.value })} /></div>
          <div className="field"><label>Per customer PU $</label><input type="number" inputMode="decimal" value={special.pickup} onChange={(e) => setSpecial({ ...special, pickup: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>Hourly (one-offs) $</label><input type="number" inputMode="decimal" value={special.hourly} onChange={(e) => setSpecial({ ...special, hourly: e.target.value })} /></div>
        </div>
        <div className="muted">Rate changes apply to the whole season's math — past paystubs already sent won't change, but balances will recalculate.</div>
      </div>
      <button className="btn btn-primary btn-block mt8" disabled={busy} onClick={save}>Save rates</button>
    </>
  )
}

/* ------------------------------ team ------------------------------ */
function Team({ data, onEdit }) {
  return (
    <>
      <div className="section-title">Your team</div>
      {data.employees.map((e) => (
        <button key={e.name} className="card tap btn-block" style={{ textAlign: 'left' }} onClick={() => onEdit(e)}>
          <div className="row">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Avatar name={e.name} photo={e.photo} size={40} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{e.name} {e.role === 'owner' && <span className="tag tag-blue">owner</span>} {!e.inPayroll && e.role !== 'owner' && <span className="tag tag-gold">no payroll</span>} {!e.active && <span className="tag tag-red">inactive</span>}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{e.email || 'no email'} · {e.phone || 'no phone'}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="li-sub">PIN</div>
              <div style={{ fontWeight: 800, letterSpacing: 2 }}>{e.pin}</div>
            </div>
          </div>
        </button>
      ))}
      <div className="muted" style={{ padding: '4px 6px' }}>Names must match exactly what shows in the Google Form. To add someone new, add their name as a Form option first, then create them here with the same spelling.</div>
      <button className="btn btn-ghost btn-block mt8" onClick={() => onEdit({ name: '', role: 'employee', pin: '', email: '', phone: '', active: true, inPayroll: true })}><Pencil size={15} /> Add team member</button>
    </>
  )
}

function EmployeeModal({ emp, mutate, say, onClose }) {
  const [f, setF] = useState({ ...emp })
  const [busy, setBusy] = useState(false)
  const isNew = !emp.name
  const save = async () => {
    if (!f.name.trim() || !/^\d{4}$/.test(String(f.pin))) { say('Need a name and a 4-digit PIN'); return }
    setBusy(true)
    try { await mutate({ action: 'saveEmployee', employee: f }); say('Saved'); history.back() }
    catch (e) { say(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal onClose={onClose} title={isNew ? 'Add team member' : 'Edit ' + first(emp.name)}>
      <div className="center" style={{ marginBottom: 10 }}>
        <Avatar name={f.name || '?'} photo={f.photo} size={72} />
        <div>
          <label className="btn btn-ghost btn-sm" style={{ marginTop: 8, display: 'inline-flex' }}>
            Change photo
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={async (e) => { const file = e.target.files[0]; if (file) setF({ ...f, photo: await fileToDataUrl(file) }) }} />
          </label>
        </div>
      </div>
      <div className="field"><label>Full name (exactly as in the Form)</label><input value={f.name} disabled={!isNew} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="grid2">
        <div className="field"><label>PIN (4 digits)</label><input inputMode="numeric" maxLength={4} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} /></div>
        <div className="field"><label>Role</label>
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="employee">employee</option><option value="owner">owner</option></select></div>
      </div>
      <div className="field"><label>Email (for paystubs)</label><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <div className="field"><label>Phone</label><input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      <ToggleRow label="Active (can log in)" on={f.active !== false} set={(v) => setF({ ...f, active: v })} />
      <ToggleRow label="Include in payroll totals" on={f.inPayroll !== false} set={(v) => setF({ ...f, inPayroll: v })} />
      <button className="btn btn-primary btn-block mt8" disabled={busy} onClick={save}>Save</button>
    </Modal>
  )
}

/* ------------------------------ employee portal ------------------------------ */
function EmployeeApp({ data, say, openStub, saveSelf }) {
  const [tab, setTab] = useState('home')
  const nav = (t) => { if (t !== tab) { history.pushState({ tab: t }, ''); setTab(t) } }
  useEffect(() => {
    const h = (e) => { const st = e.state || {}; if (st.tab) setTab(st.tab); else if (st.base) setTab('home') }
    window.addEventListener('popstate', h)
    return () => window.removeEventListener('popstate', h)
  }, [])
  const s = data.summary
  const t = todayISO()
  const [win, setWin] = useState('season')
  const paidEnds = data.payments.map((p) => p.periodEnd).sort()
  const owedFrom = paidEnds.length ? addDays(paidEnds[paidEnds.length - 1], 1) : '0000'
  const from = win === '7d' ? addDays(t, -7) : win === '30d' ? addDays(t, -30) : win === 'owed' ? owedFrom : '0000'
  const items = data.items.filter((i) => i.date >= from).sort((a, b) => b.tsMs - a.tsMs)

  return (
    <>
      {tab === 'home' && (
        <>
          <div className="hero">
            <div className="hi">Hey {first(data.me.name)} — you're owed</div>
            <div className="big">{$(s.owed)}</div>
            <div className="small">Season so far: earned {$(s.earned)} · paid {$(s.paid)}</div>
          </div>
          <div className="section-title">Leaderboard</div>
          <BoardTab data={data} />
        </>
      )}
      {tab === 'work' && (
        <>
          <div className="chiprow">
            {[['owed', 'Owed'], ['season', 'Season'], ['30d', '30 days'], ['7d', '7 days']].map(([k, l]) =>
              <button key={k} className={'chip' + (win === k ? ' on' : '')} onClick={() => setWin(k)}>{l}</button>)}
          </div>
          <WorkSummary items={items} labels={data.labels} title={win === 'owed' ? 'Owed — work summary' : 'Work summary'} />
          <div className="card">
            <div className="row" style={{ marginBottom: 6 }}>
              <div className="muted">{items.length} entries</div>
              <div style={{ fontWeight: 800 }}>{$(items.reduce((x, i) => x + i.amount, 0))}</div>
            </div>
            {items.map((i, n) => (
              <div key={n} className="list-item">
                <div className="li-main">
                  <div className="li-title">{i.label}</div>
                  <div className="li-sub">{fdate(i.date)}{i.flags.includes('double') ? ' · 2× pay' : ''}{i.flags.includes('nopay') ? ' · personal use' : ''}</div>
                </div>
                <div className={'li-amt' + (i.amount === 0 ? ' zero' : '')}>{$(i.amount)}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === 'paystubs' && (
        <>
          <div className="section-title">Paystubs</div>
          <div className="card">
            {data.payments.length === 0 && <div className="muted center" style={{ padding: 14 }}>No payments recorded yet.</div>}
            {data.payments.map((p) => (
              <button key={p.id} className="list-item btn-block" style={{ textAlign: 'left' }}
                onClick={() => openStub({ employee: data.me.name, periodStart: p.periodStart, periodEnd: p.periodEnd, paymentId: p.id })}>
                <div className="li-main">
                  <div className="li-title">{$(p.amount)} · {p.method}</div>
                  <div className="li-sub">{fdate(p.periodStart)} – {fdate(p.periodEnd)} · tap for statement</div>
                </div>
                <ChevronRight size={17} color="var(--faint)" />
              </button>
            ))}
          </div>
        </>
      )}
      {tab === 'profile' && <ProfileTab data={data} saveSelf={saveSelf} say={say} />}
      <div className="tabbar no-print">
        <TabBtn icon={<Home size={20} />} label="Home" on={tab === 'home'} onClick={() => nav('home')} />
        <TabBtn icon={<ListChecks size={20} />} label="My work" on={tab === 'work'} onClick={() => nav('work')} />
        <TabBtn icon={<FileText size={20} />} label="Paystubs" on={tab === 'paystubs'} onClick={() => nav('paystubs')} />
        <TabBtn icon={<User size={20} />} label="Profile" on={tab === 'profile'} onClick={() => nav('profile')} />
      </div>
    </>
  )
}

function ProfileTab({ data, saveSelf, say }) {
  const [f, setF] = useState({ email: data.me.email || '', phone: data.me.phone || '', pin: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (f.pin && !/^\d{4}$/.test(f.pin)) { say('PIN must be 4 digits'); return }
    setBusy(true)
    try {
      await saveSelf({ email: f.email, phone: f.phone, ...(f.pin ? { pin: f.pin } : {}), ...(f.photo != null ? { photo: f.photo } : {}) })
      say('Profile saved'); setF({ ...f, pin: '' })
    } catch (e) { say(e.message) } finally { setBusy(false) }
  }
  return (
    <>
      <div className="section-title">Your profile</div>
      <div className="card">
        <div className="center" style={{ marginBottom: 14 }}>
          <Avatar name={data.me.name} photo={f.photo != null ? f.photo : data.me.photo} size={84} />
          <div>
            <label className="btn btn-ghost btn-sm" style={{ marginTop: 10, display: 'inline-flex' }}>
              Change photo
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={async (e) => { const file = e.target.files[0]; if (file) setF({ ...f, photo: await fileToDataUrl(file) }) }} />
            </label>
          </div>
        </div>
        <div className="field"><label>Name</label><input value={data.me.name} disabled /></div>
        <div className="field"><label>Email (paystubs go here)</label>
          <input type="email" autoCapitalize="none" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label>Phone</label>
          <input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div className="field"><label>New PIN (leave blank to keep current)</label>
          <input inputMode="numeric" maxLength={4} placeholder="••••" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} /></div>
        <button className="btn btn-primary btn-block" disabled={busy} onClick={save}>Save changes</button>
        <div className="muted mt8">Your email and phone are what you log in with — this device updates itself automatically after you save.</div>
      </div>
    </>
  )
}

function BoardTab({ data }) {
  const [w, setW] = useState('7d')
  return (
    <>
      <div className="chiprow">
        {[['7d', 'This week'], ['30d', 'This month'], ['season', 'Season']].map(([k, l]) =>
          <button key={k} className={'chip' + (w === k ? ' on' : '')} onClick={() => setW(k)}>{l}</button>)}
      </div>
      <div className="card"><Leaderboard rows={(data.leaderboard || {})[w] || []} photos={data.photos} /></div>
    </>
  )
}

function Leaderboard({ rows, photos }) {
  const medals = ['🥇', '🥈', '🥉']
  if (!rows.length) return <div className="muted center" style={{ padding: 14 }}>No work logged in this window yet.</div>
  return rows.map((r, i) => (
    <div className="lb-row" key={r.name}>
      <div className="medal">{medals[i] || '·'}</div>
      <Avatar name={r.name} photo={(photos || {})[r.name]} size={36} />
      <div>
        <div className="lb-name">{first(r.name)}</div>
        <div className="lb-sub">{r.rolls} rolls · {r.deliveries} deliveries · {r.pickups} pickups</div>
      </div>
      <div className="lb-count">{r.cleans} <span>CLEANED</span></div>
    </div>
  ))
}

/* ------------------------------ modal shell ------------------------------ */
function Modal({ title, children, onClose }) {
  const pushed = useRef(false)
  useEffect(() => {
    history.pushState({ layer: 'modal' }, '')
    pushed.current = true
    const h = () => { pushed.current = false; onClose() }
    window.addEventListener('popstate', h)
    return () => { window.removeEventListener('popstate', h); if (pushed.current) { pushed.current = false; history.back() } }
  }, []) // eslint-disable-line
  const close = () => history.back()
  return (
    <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className="modal">
        <div className="row" style={{ marginBottom: 4 }}>
          <h3 style={{ marginBottom: 0 }}>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={close}><X size={17} /></button>
        </div>
        <div className="mt8">{children}</div>
      </div>
    </div>
  )
}
