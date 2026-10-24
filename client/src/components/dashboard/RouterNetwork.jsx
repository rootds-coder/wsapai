import { useEffect, useRef, useState } from 'react'
import { Cpu, Zap, Coins, ShieldCheck, TrendingUp, Copy, Check, Play, X, Terminal, Clock, Activity } from 'lucide-react'

// ── Network Overview, ported from the Gemini HTML Dhruv supplied ──
// (workspace/user/files/smart_ai_router_2_0.html) — its exact body
// layout: 6 KPI cards, the topology panel (9 provider cards →
// spinning router core → unified endpoint card) with the animated
// canvas fiber lines + particles, and the 4-column routing
// visualization. What is NOT ported: Gemini's own sidebar/header
// (our app already has its own navigation — a second sidebar would
// duplicate it), and every fake number in that file.
//
// Gemini's file was a static demo: hardcoded placeholder totals and
// uptime, per-provider fake quotas and request counts, a random
// req/s ticker, random modal
// latencies, a fake demo domain and a fake Bearer
// key. All of those are replaced here with real /api/ai-providers
// stats, and the "Test POST" / health-check buttons make REAL calls.
// A test guards that the demo numbers and the fake domain never
// reappear in this file.

const NETWORK_IDS = ['gemini', 'groq', 'cerebras', 'openrouter', 'mistral', 'sambanova', 'nvidia', 'github', 'together']
const CARD_STYLE = {
  gemini: { letter: 'G', cls: 'text-blue-400', bar: '#60a5fa' },
  groq: { letter: 'g', cls: 'text-amber-400', bar: '#fbbf24' },
  cerebras: { letter: 'C', cls: 'text-orange-400', bar: '#fb923c' },
  openrouter: { letter: 'O', cls: 'text-purple-400', bar: '#c084fc' },
  mistral: { letter: 'M', cls: 'text-amber-500', bar: '#f59e0b' },
  sambanova: { letter: 'S', cls: 'text-emerald-400', bar: '#34d399' },
  nvidia: { letter: 'N', cls: 'text-green-500', bar: '#22c55e' },
  github: { letter: 'GH', cls: 'text-zinc-200', bar: '#22d3ee' },
  together: { letter: 'T', cls: 'text-indigo-400', bar: '#818cf8' },
}

function fmtNum(n) {
  if (!n) return '0'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(n)
}
function fmtUptime(sec) {
  if (!sec) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
// Real sparkline from a series of numbers (no invented wave shape).
function sparkPath(values, w = 100, h = 28) {
  if (!values || values.length === 0) return ''
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => `${((i / Math.max(1, values.length - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`)
  return 'M' + pts.join(' L')
}
function wavePath(values, w = 200, h = 90) {
  if (!values || values.length === 0) return ''
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => `${((i / Math.max(1, values.length - 1)) * w).toFixed(1)},${(h - 5 - (v / max) * (h - 15)).toFixed(1)}`)
  return 'M' + pts.join(' L')
}

const MODE_NOTE = {
  manual: 'Active provider first, then the rest in saved order.',
  'free-first': 'Free models first, then the rest.',
  fastest: 'Fastest responding provider first, by recent measured latency.',
  quality: 'Strongest model first.',
  balanced: 'Quality, speed and health scored together — the order moves as health changes.',
}

export default function RouterNetwork({ providerReg = [], providerConfigs = [], stats, routingMode, onModeChange, selectedProviderId, onSelectProvider, provKey, onProvKeyChange, provBusy, provAlert, onSaveProvider, onTestProvider, onSetActiveProvider, onDeleteProvider, onRefresh }) {
  const perProvider = {}
  for (const p of stats?.perProvider || []) perProvider[p.providerId] = p
  const totals = stats?.totals || { requests: 0, tokens: 0, failures: 0 }
  const configuredMap = {}
  for (const c of providerConfigs || []) if (c.hasKey) configuredMap[c.providerId] = c
  const network = NETWORK_IDS.map((id) => {
    const reg = providerReg.find((x) => x.id === id)
    return { id, name: reg?.name || id, config: configuredMap[id] || null, stat: perProvider[id] || null, style: CARD_STYLE[id] }
  })
  const configuredCount = network.filter((p) => p.config).length
  const latencies = network.map((p) => p.stat?.health?.avgLatencyMs).filter((v) => typeof v === 'number' && v > 0)
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null
  const successTotal = (totals.requests || 0) + (totals.failures || 0)
  const successRate = successTotal ? Math.round((totals.requests / successTotal) * 100) : null
  const dailyTokens = (stats?.dailySeries || []).map((d) => d.tokens)
  const dailyReqs = (stats?.dailySeries || []).map((d) => d.requests)
  const startedAt = stats?.serverUptimeSec ? new Date(Date.now() - stats.serverUptimeSec * 1000) : null

  const [showCurl, setShowCurl] = useState(false)
  const [toast, setToast] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }
  const endpointUrl = (typeof window !== 'undefined' ? window.location.origin : '') + '/v1/chat/completions'
  const scrollToManager = () => { document.getElementById('sr-provider-manager')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const selectedReg = providerReg.find((x) => x.id === selectedProviderId) || providerReg[0]
  const selectedConfig = (providerConfigs || []).find((c) => c.providerId === selectedProviderId)
  // Routing Role, live: the server's routingOrder for the current
  // mode (configured providers, in engine order), then the rest.
  const roleOrder = []
  for (const id of stats?.routingOrder || []) {
    const p = network.find((x) => x.id === id)
    if (p && !roleOrder.includes(p)) roleOrder.push(p)
  }
  for (const p of network) if (p.config && !roleOrder.includes(p)) roleOrder.push(p)
  for (const p of network) if (!p.config && !roleOrder.includes(p)) roleOrder.push(p)
  const dailyTotalTokens = dailyTokens.reduce((a, b) => a + b, 0)
  const dailyTotalReqs = dailyReqs.reduce((a, b) => a + b, 0)
  // "Active" = a saved key live in the one endpoint (the whole pool).
  // "Primary" = only the first try in the current routing order.
  // The old UI used "Active" for the single preferred provider, which
  // read as if the other saved providers were switched off. They are
  // not: the engine tries them in order and falls back automatically.
  const primaryId = stats?.routingOrder?.[0] || null

  const copyEndpoint = async () => {
    try { await navigator.clipboard.writeText(endpointUrl); setCopied(true); showToast('Endpoint URL copied!'); setTimeout(() => setCopied(false), 2000) }
    catch { showToast('Copy failed — select the URL manually') }
  }

  // REAL Test POST: routes one tiny request through the user's own engine.
  const testEndpoint = async () => {
    setTestBusy(true)
    try {
      const t0 = performance.now()
      const res = await fetch('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ messages: [{ role: 'user', content: 'Reply with one short word.' }], max_tokens: 16 }) })
      const data = await res.json()
      const ms = Math.round(performance.now() - t0)
      if (res.ok) showToast(`OK via ${data.provider || '?'} / ${data.model || '?'} in ${ms}ms: "${String(data.choices?.[0]?.message?.content || '').slice(0, 40)}"`)
      else showToast(`Endpoint error: ${data.error?.message || res.status}`)
    } catch { showToast('Network error calling the endpoint') }
    setTestBusy(false)
  }

  // ── Animated canvas: fiber lines from provider cards to the core,
  //    a master beam core → endpoint, particles travelling the curves.
  //    Ported from Gemini's canvas script, adapted to React refs.
  const topoRef = useRef(null)
  const canvasRef = useRef(null)
  const coreRef = useRef(null)
  const endpointRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const container = topoRef.current
    if (!canvas || !container) return undefined
    const ctx = canvas.getContext('2d')
    let lines = []
    let particles = []
    let raf = 0
    let dead = false
    const computeLines = () => {
      lines = []
      const core = coreRef.current
      const endpoint = endpointRef.current
      if (!core || !endpoint) return
      const rect = container.getBoundingClientRect()
      const coreRect = core.getBoundingClientRect()
      const endRect = endpoint.getBoundingClientRect()
      const coreX = coreRect.left - rect.left + coreRect.width / 2
      const coreY = coreRect.top - rect.top + coreRect.height / 2
      container.querySelectorAll('.sr-provider-card').forEach((card, i) => {
        const r = card.getBoundingClientRect()
        lines.push({ startX: r.right - rect.left, startY: r.top - rect.top + r.height / 2, endX: coreX, endY: coreY, color: i % 2 === 0 ? '#22d3ee' : '#8b5cf6', isMasterBeam: false })
      })
      lines.push({ startX: coreX, startY: coreY, endX: endRect.left - rect.left, endY: endRect.top - rect.top + endRect.height / 2, color: '#22d3ee', isMasterBeam: true })
      if (!particles.length) {
        for (let i = 0; i < 45; i++) particles.push(spawnParticle())
      }
    }
    function spawnParticle() {
      if (!lines.length) return { lineIndex: 0, progress: 0, speed: 0.005, size: 2, color: '#22d3ee' }
      const lineIndex = Math.floor(Math.random() * lines.length)
      const line = lines[lineIndex]
      return { lineIndex, progress: Math.random(), speed: line.isMasterBeam ? 0.008 + Math.random() * 0.012 : 0.004 + Math.random() * 0.007, size: line.isMasterBeam ? 2.5 + Math.random() * 2 : 1.5 + Math.random() * 1.5, color: line.color }
    }
    const draw = () => {
      if (dead) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      lines.forEach((line) => {
        ctx.beginPath()
        ctx.moveTo(line.startX, line.startY)
        const cpX = (line.startX + line.endX) / 2
        ctx.bezierCurveTo(cpX, line.startY, cpX, line.endY, line.endX, line.endY)
        if (line.isMasterBeam) {
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)'; ctx.lineWidth = 3; ctx.stroke()
          ctx.strokeStyle = 'rgba(139, 92, 246, 0.2)'; ctx.lineWidth = 8; ctx.stroke()
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'; ctx.lineWidth = 1.2; ctx.stroke()
        }
      })
      particles.forEach((p) => {
        p.progress += p.speed
        if (p.progress >= 1) p.progress = 0
        const line = lines[p.lineIndex]
        if (!line) return
        const t = p.progress
        const cpX = (line.startX + line.endX) / 2
        const cpY1 = line.startY
        const cpY2 = line.endY
        const cx = 3 * (cpX - line.startX)
        const bx = 3 * (cpX - cpX) - cx
        const ax = line.endX - line.startX - cx - bx
        const cy = 3 * (cpY1 - line.startY)
        const by = 3 * (cpY2 - cpY1) - cy
        const ay = line.endY - line.startY - cy - by
        const x = ax * t ** 3 + bx * t ** 2 + cx * t + line.startX
        const y = ay * t ** 3 + by * t ** 2 + cy * t + line.startY
        ctx.beginPath()
        ctx.arc(x, y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = p.color; ctx.shadowBlur = 10; ctx.shadowColor = p.color; ctx.fill(); ctx.shadowBlur = 0
      })
      raf = requestAnimationFrame(draw)
    }
    const resize = () => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
      computeLines()
    }
    const t = setTimeout(() => { resize(); draw() }, 120)
    window.addEventListener('resize', resize)
    return () => { dead = true; clearTimeout(t); cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [providerConfigs, stats])

  const kpi = (label, value, sub, spark, stroke, icon) => (
    <div className="sr-glass rounded-xl p-3.5 relative overflow-hidden">
      <div className="flex items-center justify-between text-zinc-400 mb-1">
        <span className="text-xs font-medium">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold font-mono tracking-tight text-white">{value}</div>
      <div className="h-7 w-full mt-1.5 flex items-center">
        {spark ? (
          <svg className="w-full h-full" style={{ stroke }} viewBox="0 0 100 28" preserveAspectRatio="none" fill="none">
            <path d={spark} strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <span className="text-[10px] font-mono text-zinc-500">{sub}</span>
        )}
      </div>
    </div>
  )

  return (
    <div className="sr-scope text-zinc-100 font-sans antialiased">
      <style>{`
        .sr-scope { font-family: Inter, system-ui, -apple-system, sans-serif; }
        .sr-glass { background: rgba(20,20,25,0.75); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.08); }
        .sr-glass-hover { transition: all 0.25s cubic-bezier(0.16,1,0.3,1); }
        .sr-glass-hover:hover { background: rgba(26,26,33,0.85); border-color: rgba(34,211,238,0.3); transform: translateY(-2px); }
        .sr-grid { background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px); background-size: 28px 28px; }
        .sr-glow-cyan { box-shadow: 0 0 25px -4px rgba(34,211,238,0.35); }
        .sr-glow-endpoint { box-shadow: 0 0 35px -5px rgba(34,211,238,0.25), inset 0 0 25px -5px rgba(139,92,246,0.15); }
        @keyframes sr-spin { to { transform: rotate(360deg); } }
        @keyframes sr-spin-rev { to { transform: rotate(-360deg); } }
        @keyframes sr-pulse-glow { 0%,100% { opacity: 0.9; transform: scale(1); } 50% { opacity: 0.45; transform: scale(1.05); } }
        .sr-spin-slow { animation: sr-spin 24s linear infinite; }
        .sr-spin-rev { animation: sr-spin-rev 18s linear infinite; }
        .sr-pulse-glow { animation: sr-pulse-glow 3s cubic-bezier(0.4,0,0.6,1) infinite; }
      `}</style>

      <div className="sr-grid bg-[#09090b] rounded-2xl p-4 lg:p-6 space-y-6">
        {/* ── 1. KPI strip (Gemini layout, real values) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {kpi('Active Providers', `${configuredCount} / ${network.length}`, 'With a key saved', sparkPath(dailyReqs), '#34d399', <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />)}
          {kpi('Total Tokens Used', fmtNum(totals.tokens), 'All time · provider-reported', sparkPath(dailyTokens), '#a78bfa', <Coins className="w-3.5 h-3.5 text-violet-400" />)}
          {kpi('Free Pool Value (est.)', `$${stats?.estimated?.paidEquivalentUsdLast30 ?? 0}`, 'Last 30 days · estimate only', sparkPath(dailyTokens), '#22d3ee', <span className="text-[10px] text-cyan-400 font-mono">estimate</span>)}
          {kpi('Total API Requests', fmtNum(totals.requests), `${fmtNum(totals.failures)} failed`, sparkPath(dailyReqs), '#818cf8', <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />)}
          {kpi('Avg Latency', avgLatency ? <span>{avgLatency}<span className="text-sm font-normal text-zinc-400">ms</span></span> : '—', 'Mean of providers with data', null, '#22d3ee', <span className="text-[10px] text-emerald-400 font-mono">live</span>)}
          {kpi('Router Uptime', fmtUptime(stats?.serverUptimeSec), startedAt ? `Running since ${startedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · resets on restart` : 'Server process uptime', null, '#34d399', <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />)}
        </div>

        {configuredCount === 0 && (
          <div className="sr-glass rounded-xl p-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-zinc-300">No provider connected yet — tap a provider below, paste its key, and this network lights up with real numbers.</span>
            <button onClick={scrollToManager} className="ml-auto px-3 py-1.5 rounded-lg bg-cyan-500 text-white text-xs font-medium">Add a provider ↓</button>
          </div>
        )}

        {/* ── 2. Topology: providers → core → endpoint ── */}
        <div ref={topoRef} className="relative sr-glass rounded-2xl p-6 lg:p-8 overflow-hidden min-h-[580px] flex flex-col justify-between">
          <canvas id="network-canvas" ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {network.map((p, i) => {
                const share = totals.tokens ? Math.round(((p.stat?.totals?.tokens || 0) / totals.tokens) * 100) : 0
                const cooling = p.stat?.health?.coolingDown
                const failing = (p.stat?.health?.consecutiveFailures || 0) > 0
                return (
                  <div key={p.id} onClick={() => { onSelectProvider?.(p.id); scrollToManager() }} className={`sr-provider-card sr-glass sr-glass-hover p-2.5 rounded-xl cursor-pointer ${i === network.length - 1 ? 'sm:col-span-2' : ''} ${selectedProviderId === p.id ? 'ring-1 ring-cyan-400/60' : ''}`} title="Tap to select this provider, then paste its key below">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-md bg-zinc-800 flex items-center justify-center font-bold text-[11px] border border-zinc-700 ${p.style.cls}`}>{p.style.letter}</div>
                        <span className="font-semibold text-xs text-white">{p.name}</span>
                        {primaryId === p.id && <span className="text-[10px] font-mono text-cyan-300">★ Primary</span>}
                      </div>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-1 ${!p.config ? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' : cooling || failing ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${!p.config ? 'bg-zinc-500' : cooling || failing ? 'bg-rose-400' : 'bg-emerald-400 animate-pulse'}`} />
                        {!p.config ? 'NOT CONNECTED' : cooling ? 'COOLING' : failing ? 'FAILING' : 'ACTIVE'}
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] font-mono text-zinc-400 flex justify-between">
                      <span>Tokens: {fmtNum(p.stat?.totals?.tokens)}</span>
                      <span className="text-zinc-300">{share}% of total</span>
                    </div>
                    <div className="w-full bg-zinc-800/80 rounded-full h-1 mt-1 overflow-hidden">
                      <div className="h-1 rounded-full" style={{ width: `${share}%`, background: p.style.bar }} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[10px] font-mono text-zinc-500">
                      <span>{p.stat?.health?.avgLatencyMs ? `${p.stat.health.avgLatencyMs}ms` : '—'}</span>
                      <span>{fmtNum(p.stat?.totals?.requests)} reqs{primaryId === p.id ? ' · primary' : ''}</span>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500 mt-1 truncate">{p.config ? (p.config.model ? `Engine using: ${p.config.model}` : 'Engine picks a working model') : 'Tap to add a key ↓'}</div>
                  </div>
                )
              })}
            </div>

            {/* Centre core */}
            <div className="lg:col-span-3 flex flex-col items-center justify-center py-6" ref={coreRef}>
              <div className="text-center mb-3">
                <h2 className="text-sm font-bold tracking-wider text-white">SMART AI ROUTER 2.1</h2>
                <p className="text-[11px] text-zinc-400">Intelligent Multi-Provider Orchestration</p>
              </div>
              <div className="relative w-48 h-48 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-cyan-500/20 via-violet-500/20 to-indigo-500/20 blur-xl sr-pulse-glow" />
                <svg className="absolute inset-0 w-full h-full sr-spin-slow" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="46" fill="none" stroke="#22d3ee" strokeWidth="1.2" strokeDasharray="6 4" opacity="0.6" />
                  <circle cx="50" cy="50" r="43" fill="none" stroke="#8b5cf6" strokeWidth="0.75" strokeDasharray="14 8" opacity="0.5" />
                </svg>
                <svg className="absolute inset-2 w-[calc(100%-16px)] h-[calc(100%-16px)] sr-spin-rev" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="#10b981" strokeWidth="1.2" strokeDasharray="8 6" opacity="0.4" />
                  <circle cx="50" cy="50" r="38" fill="none" stroke="#6366f1" strokeWidth="1" strokeDasharray="2 4" opacity="0.7" />
                </svg>
                <div className="relative w-28 h-28 rounded-full bg-[#060608] border-2 border-cyan-400/50 flex flex-col items-center justify-center p-2 shadow-2xl sr-glow-cyan text-center z-10">
                  <Cpu className="w-7 h-7 text-cyan-300 animate-pulse" />
                  <div className="text-[10px] font-mono text-cyan-400 font-semibold tracking-wide mt-1">CORE ROUTE</div>
                  <div className="text-[9px] font-mono text-zinc-400">{configuredCount} providers connected</div>
                </div>
                <div className="absolute w-full h-full sr-spin-slow">
                  <span className="absolute top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_8px_#8b5cf6]" />
                </div>
              </div>
              <div className="mt-4 px-3 py-1 rounded-full bg-zinc-900/90 border border-zinc-700/70 text-[11px] font-mono text-zinc-300 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>Routing mode: {routingMode}</span>
              </div>
              <select value={routingMode} onChange={(e) => onModeChange?.(e.target.value)} className="mt-2 rounded-md bg-black/40 border border-white/10 px-2 py-1 text-xs text-white">
                <option value="manual">manual</option>
                <option value="free-first">free-first</option>
                <option value="fastest">fastest</option>
                <option value="quality">quality</option>
                <option value="balanced">balanced</option>
              </select>
            </div>

            {/* Endpoint card */}
            <div className="lg:col-span-4" ref={endpointRef}>
              <div className="sr-glass sr-glow-endpoint rounded-2xl p-5 border border-cyan-500/40 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-indigo-500 to-violet-500" />
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400"><Zap className="w-4 h-4" /></div>
                    <div>
                      <h3 className="font-bold text-sm text-white">UNIFIED AI ENDPOINT</h3>
                      <p className="text-[10px] text-zinc-400">One Master API Gateway</p>
                    </div>
                  </div>
                  <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${configuredCount ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30'}`}>
                    <span className={`w-2 h-2 rounded-full ${configuredCount ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} /> {configuredCount ? 'ONLINE' : 'NO PROVIDERS'}
                  </span>
                </div>
                <div className="bg-[#060608] rounded-lg p-2.5 border border-zinc-800 flex items-center justify-between font-mono text-xs">
                  <div className="truncate text-zinc-300"><span className="text-cyan-400 font-semibold">POST</span> /v1/chat/completions</div>
                  <button onClick={copyEndpoint} className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition" title="Copy endpoint">
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <div className="space-y-2 mt-4 text-xs">
                  <div className="flex items-center gap-2.5 text-zinc-300"><Check className="w-4 h-4 text-emerald-400 shrink-0" /><span><strong>{configuredCount} Providers Connected</strong> (your own keys only)</span></div>
                  <div className="flex items-center gap-2.5 text-zinc-300"><Activity className="w-4 h-4 text-cyan-400 shrink-0" /><span>Intelligent Load Balancing &amp; Routing ({routingMode})</span></div>
                  <div className="flex items-center gap-2.5 text-zinc-300"><TrendingUp className="w-4 h-4 text-indigo-400 shrink-0" /><span>Automatic Failover Enabled</span></div>
                  <div className="flex items-center gap-2.5 text-zinc-300"><Zap className="w-4 h-4 text-violet-400 shrink-0" /><span>Smart Free-Tier Token Optimization</span></div>
                </div>
                <p className="text-[11px] text-zinc-400 mt-3">Dashboard-session authenticated — not a public API key. Every saved key is active in this endpoint — none sits idle, they are tried in order and the next one answers if the first fails.</p>
                <div className="mt-5 pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400 font-mono">Status: {configuredCount ? 'ready' : 'add a provider first'}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setShowCurl(true)} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono border border-zinc-700 flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5" /> Snippet</button>
                    <button onClick={testEndpoint} disabled={testBusy || !configuredCount} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-cyan-300 text-xs font-mono font-medium border border-zinc-700 flex items-center gap-1.5 disabled:opacity-50"><Play className="w-3.5 h-3.5" /> {testBusy ? 'Testing…' : 'Test POST'}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="relative z-10 text-center mt-6 pt-3 border-t border-zinc-800/50">
            <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">
              {configuredCount} AI Providers Connected &bull; One Intelligent Router &bull; One Unified Endpoint &bull; Maximum Free AI Capacity
            </p>
          </div>
        </div>

        {/* ── Provider manager, merged into the Overview: tap, paste, done.
             No model picker: saving always uses Auto, the engine
             resolves a working model for the key. ── */}
        <div id="sr-provider-manager" className="sr-glass rounded-2xl p-5 space-y-3 scroll-mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-sm text-white uppercase tracking-wider">Add a Provider</h3>
            <span className="text-[11px] text-zinc-400">Tap a provider, paste its key, Save — that's it. No model to pick; the engine finds a working model for your key automatically. All saved keys are active in the one endpoint — Primary only means first try.</span>
            <button onClick={onRefresh} className="ml-auto px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono border border-zinc-700">Refresh</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {providerReg.map((pr) => {
              const cfg = (providerConfigs || []).find((c) => c.providerId === pr.id)
              const sel = selectedProviderId === pr.id
              return (
                <button key={pr.id} onClick={() => onSelectProvider?.(pr.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${sel ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50' : 'bg-zinc-800/80 text-zinc-300 border-zinc-700 hover:border-zinc-500'}`}>
                  {pr.name}{cfg?.hasKey ? ` ✓ Active${primaryId === pr.id ? ' ★ Primary' : ''}` : ''}
                </button>
              )
            })}
          </div>
          {selectedReg && (
            <div className="space-y-2">
              <div className="text-xs text-zinc-400">
                <span className="font-semibold text-white">{selectedReg.name}</span>
                {selectedReg.freeNote ? <span> · {selectedReg.freeNote}</span> : null}
                {selectedReg.getKeyUrl ? <span> · <a className="underline text-cyan-400" href={selectedReg.getKeyUrl} target="_blank" rel="noreferrer">Get a free key ↗</a></span> : null}
                {selectedConfig?.hasKey ? <span className="font-mono"> · saved key {selectedConfig.maskedKey}{selectedConfig.model ? ` · engine last used ${selectedConfig.model}` : ''}</span> : null}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  value={provKey || ''}
                  onChange={(e) => onProvKeyChange?.(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onSaveProvider?.() }}
                  placeholder={selectedConfig?.hasKey ? 'API key saved — type a new one only to replace it' : 'Paste your API key here'}
                  className="flex-1 rounded-lg bg-black/40 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
                />
                <button onClick={onSaveProvider} disabled={provBusy} className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 text-white text-xs font-semibold disabled:opacity-50">{provBusy ? 'Saving…' : 'Save Provider'}</button>
                <button onClick={onTestProvider} disabled={provBusy} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-cyan-300 text-xs font-mono border border-zinc-700 disabled:opacity-50">Test Key</button>
                {selectedConfig?.hasKey && routingMode === 'manual' && !selectedConfig.isActive && <button onClick={() => onSetActiveProvider?.(selectedProviderId)} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700">Set as primary</button>}
                {selectedConfig?.hasKey && routingMode !== 'manual' && <span className="text-[11px] text-zinc-400 self-center">Primary is chosen by {routingMode} mode — switch routing mode to manual to fix a first provider.</span>}
                {selectedConfig?.hasKey && <button onClick={() => onDeleteProvider?.(selectedProviderId)} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-rose-400 text-xs border border-zinc-700">Remove</button>}
              </div>
              {provAlert && <p className="text-[11px] text-cyan-300 font-mono">{provAlert}</p>}
            </div>
          )}
        </div>

        {/* ── 3. Routing visualization (all live, see notes below) ── */}
        <div className="sr-glass rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800/70 pb-3">
            <h3 className="font-bold text-sm text-white uppercase tracking-wider">Intelligent Routing Visualization</h3>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Live Telemetry</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#060608]/60 rounded-xl p-3.5 border border-zinc-800/60 space-y-2.5">
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Routing Role <span className="normal-case text-zinc-500">· live engine order</span></div>
              {network.filter((p) => p.config).length === 0 && <div className="text-xs text-zinc-400">No providers yet.</div>}
              {roleOrder.map((p, i) => (
                <div key={p.id} className="flex justify-between items-center py-0.5 border-b border-zinc-900 text-xs font-mono">
                  <span style={{ color: p.style.bar }}>{p.name}</span>
                  <span className="text-zinc-400 text-[11px]">→ {!p.config ? 'Not connected — add a key to join the pool' : i === 0 ? 'Primary — first try' : 'In pool — fallback ready'}</span>
                </div>
              ))}
              <div className="text-[11px] text-zinc-500">Mode: {routingMode} · {MODE_NOTE[routingMode] || ''} All saved providers are live in the one endpoint — Primary is only the first try; if it fails, the next in-pool provider answers. Order is returned by the server for this mode, not a fixed list.</div>
            </div>
            <div className="bg-[#060608]/60 rounded-xl p-3.5 border border-zinc-800/60 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                <span>Routing Distribution</span>
                <span className="text-[10px] font-mono text-cyan-400">tokens / day</span>
              </div>
              <div className="h-28 w-full relative">
                <svg className="w-full h-full" viewBox="0 0 200 90" preserveAspectRatio="none">
                  <line x1="0" y1="20" x2="200" y2="20" stroke="#272730" strokeWidth="0.5" strokeDasharray="2 2" />
                  <line x1="0" y1="50" x2="200" y2="50" stroke="#272730" strokeWidth="0.5" strokeDasharray="2 2" />
                  <line x1="0" y1="80" x2="200" y2="80" stroke="#272730" strokeWidth="0.5" strokeDasharray="2 2" />
                  {dailyTokens.some((v) => v > 0) && (
                    <>
                      <path d={`${wavePath(dailyTokens)} L200,90 L0,90 Z`} fill="rgba(34, 211, 238, 0.2)" />
                      <path d={wavePath(dailyTokens)} fill="none" stroke="#22d3ee" strokeWidth="2" />
                    </>
                  )}
                </svg>
                {!dailyTokens.some((v) => v > 0) && <div className="absolute inset-0 flex items-center justify-center text-[11px] font-mono text-zinc-500">No usage in the last 7 days yet</div>}
              </div>
              <div className="flex justify-between text-[10px] font-mono text-zinc-500 mt-1">
                {(stats?.dailySeries || []).map((d) => <span key={d.day} title={`${d.day}: ${d.tokens} tokens, ${d.requests} requests`}>{d.day.slice(5)}</span>)}
              </div>
              <div className="flex justify-between text-[10px] font-mono text-cyan-300/80 mt-0.5">
                {(stats?.dailySeries || []).map((d) => <span key={d.day}>{fmtNum(d.tokens)}</span>)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">Last 7 days: {fmtNum(dailyTotalTokens)} tokens · {fmtNum(dailyTotalReqs)} requests — one point per day, straight from the stats endpoint.</div>
            </div>
            <div className="bg-[#060608]/60 rounded-xl p-3.5 border border-zinc-800/60 space-y-2">
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Provider Health Status</div>
              {network.filter((p) => p.config).length === 0 && <div className="text-xs text-zinc-400">No providers yet.</div>}
              <div>
                <div className="flex justify-between text-[11px] mb-1 font-mono"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Overall success rate</span><span className="text-emerald-400 font-semibold">{successRate === null ? '—' : `${successRate}%`}</span></div>
                <div className="w-full bg-zinc-800 rounded-full h-1.5"><div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${successRate ?? 0}%` }} /></div>
                <div className="text-[10px] font-mono text-zinc-500 mt-1">{fmtNum(totals.requests)} requests · {fmtNum(totals.failures)} failures (all time, provider-reported)</div>
              </div>
              {network.filter((p) => p.config).map((p) => {
                const t = (p.stat?.totals?.requests || 0) + (p.stat?.totals?.failures || 0)
                const ok = t ? Math.round(((p.stat?.totals?.requests || 0) / t) * 100) : null
                return (
                  <div key={p.id}>
                    <div className="flex justify-between text-[11px] mb-1 font-mono"><span className="text-zinc-400">{p.name}</span><span style={{ color: p.style.bar }}>{ok === null ? 'no data' : `${ok}% ok · ${fmtNum(p.stat?.totals?.requests)} reqs`}</span></div>
                    <div className="w-full bg-zinc-800 rounded-full h-1.5"><div className="h-1.5 rounded-full" style={{ width: `${ok ?? 0}%`, background: p.style.bar }} /></div>
                  </div>
                )
              })}
              <div className="text-[10px] text-zinc-500">Latency is measured live per request and resets on server restart (in-memory health) — so it can show — until the next successful request.</div>
            </div>
            <div className="bg-[#060608]/60 rounded-xl p-3.5 border border-zinc-800/60 flex flex-col justify-between">
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Routing Timeline <span className="normal-case text-zinc-500">· {(stats?.routeLog || []).length} fallback events</span></div>
              <div className="space-y-2.5 text-[11px] font-mono overflow-y-auto max-h-36 pr-1">
                {(stats?.routeLog || []).length === 0 && <div className="text-zinc-400">No fallbacks recorded yet — that is good news, it means the primary provider has not failed.</div>}
                {[...(stats?.routeLog || [])].reverse().slice(0, 8).map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1 shrink-0" />
                    <div>
                      <div className="text-zinc-200">{r.from || '?'} → <span className="text-cyan-300">{r.to}</span></div>
                      <div className="text-[10px] text-zinc-500">{new Date(r.at).toLocaleString()} · {r.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={scrollToManager} className="mt-2 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 text-left">• Add / change a key ↓</button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Every number above is your own provider-reported usage. The Gemini demo file showed placeholder totals — this view shows your real counts instead, even when they are small. Tap any provider card to select it and add its key below.</span>
        </div>
      </div>

      {/* ── Snippet modal (honest: session auth, same-origin) ── */}
      {showCurl && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={() => setShowCurl(false)}>
          <div className="sr-glass max-w-xl w-full rounded-2xl p-6 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center gap-2"><Terminal className="w-5 h-5 text-cyan-400" /><h3 className="font-bold text-white text-base">API Integration Snippet</h3></div>
              <button onClick={() => setShowCurl(false)} className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-zinc-400 mb-3">Send requests to one endpoint. The router handles provider load balancing, fallbacks and token routing. This endpoint is dashboard-session authenticated — call it from your own logged-in session (same origin), not with a public API key.</p>
            <div className="relative bg-[#060608] p-4 rounded-xl border border-zinc-800 text-xs font-mono text-zinc-300 overflow-x-auto">
              <pre>{`fetch('${endpointUrl}', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Hello Smart Router!' }]
  })
}).then(r => r.json()).then(console.log)`}</pre>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={copyEndpoint} className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition">Copy endpoint URL</button>
              <button onClick={() => setShowCurl(false)} className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition">Done</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 sr-glass border border-cyan-500/40 px-4 py-3 rounded-xl text-xs font-mono text-cyan-200 shadow-2xl flex items-center gap-2 max-w-md">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  )
}
