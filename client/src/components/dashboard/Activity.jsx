import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal, X, Search, AlertTriangle, Info, AlertOctagon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn, formatSafeTime } from '@/lib/utils'

/** Map log type → vibrant cyber badge styling */
const TYPE_STYLE = {
  info: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.15)]',
  error: 'bg-rose-500/15 text-rose-400 border-rose-500/30 shadow-[0_0_8px_rgba(244,63,94,0.15)]',
  warn: 'bg-amber-500/15 text-amber-400 border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.15)]',
}

const TYPE_ICONS = {
  info: Info,
  error: AlertOctagon,
  warn: AlertTriangle,
}

/**
 * Live system-log terminal card with isolated inner-scroll and rich color highlights.
 */
export default function Activity({ sysLogs = [], clearLogs }) {
  const scrollContainerRef = useRef(null)
  const [filterText, setFilterText] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [autoScroll, setAutoScroll] = useState(true)

  const filteredLogs = sysLogs.filter(log => {
    const rawMsg = String(log.text ?? log.message ?? log.msg ?? (typeof log === 'string' ? log : '')).toLowerCase()
    const matchesText = filterText ? rawMsg.includes(filterText.toLowerCase()) : true
    const matchesType = typeFilter === 'all' ? true : (log.type || 'info') === typeFilter
    return matchesText && matchesType
  })

  /* Safely scroll ONLY the inner container without scrolling the main page */
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [filteredLogs.length, autoScroll])

  return (
    <Card className="flex flex-col border border-white/10 bg-[#060a12]/95 shadow-[0_12px_36px_rgba(0,0,0,0.85)] relative overflow-hidden">
      {/* Top subtle ambient glow line */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />

      <CardHeader className="pb-3 border-b border-white/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shadow-[0_0_10px_rgba(168,85,247,0.2)]">
              <Terminal size={14} className="text-purple-400" />
            </div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-bold text-white tracking-wide">Live System Logs</CardTitle>
              {sysLogs.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[10px] font-mono font-bold text-purple-300">
                  {sysLogs.length} events
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter by Type */}
            <div className="flex items-center bg-black/70 border border-white/10 rounded-lg p-0.5 text-[10px]">
              {['all', 'info', 'warn', 'error'].map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    'px-2 py-0.5 rounded capitalize font-mono transition-all',
                    typeFilter === t
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {sysLogs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearLogs}
                className="h-7 px-2.5 text-[10px] text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 gap-1 border border-white/5"
              >
                <X size={11} />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Live Filter search input */}
        <div className="relative mt-2.5">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search logs in real-time..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="w-full h-7 pl-8 pr-3 text-[11px] rounded-lg bg-black/60 border border-white/10 text-zinc-100 placeholder-zinc-500 outline-none focus:border-purple-500/60 font-mono transition-colors"
          />
        </div>
      </CardHeader>

      <CardContent className="pb-3 pt-2">
        <div
          ref={scrollContainerRef}
          className="h-[360px] w-full overflow-y-auto pr-2 space-y-1 font-mono scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent"
          onScroll={(e) => {
            const el = e.currentTarget
            const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
            setAutoScroll(isNearBottom)
          }}
        >
          {filteredLogs.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-[320px] flex-col items-center justify-center gap-2.5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 border border-white/10">
                <Terminal size={18} className="text-zinc-500" />
              </div>
              <p className="text-xs text-zinc-400 font-mono">
                {sysLogs.length === 0 ? 'Waiting for system events & WhatsApp activity…' : 'No logs match your filter'}
              </p>
            </motion.div>
          ) : (
            <div className="space-y-1">
              <AnimatePresence initial={false}>
                {filteredLogs.map((log, i) => {
                  const type = log.type || 'info'
                  const badgeClass = TYPE_STYLE[type] ?? TYPE_STYLE.info
                  const Icon = TYPE_ICONS[type] ?? Info
                  const rawMsg = log.text ?? log.message ?? log.msg ?? (typeof log === 'string' ? log : '')
                  const timeFormatted = formatSafeTime(log.time || log.timestamp)

                  return (
                    <motion.div
                      key={log.id ?? `log-${log.timestamp || log.time || i}-${i}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.18 }}
                      className="flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors duration-100 hover:bg-white/[0.04] border border-transparent hover:border-white/5 group"
                    >
                      {/* timestamp */}
                      <span className="shrink-0 pt-0.5 text-[10px] tabular-nums text-cyan-400/80 font-mono font-medium">
                        {timeFormatted}
                      </span>

                      {/* type badge */}
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5',
                          'text-[9px] font-bold uppercase tracking-wider',
                          badgeClass
                        )}
                      >
                        <Icon size={9} />
                        {type}
                      </span>

                      {/* message */}
                      <span className="flex-1 break-all text-[11px] leading-relaxed text-zinc-200 group-hover:text-white">
                        {rawMsg}
                      </span>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
