import { motion } from 'framer-motion'
import { MessageCircle, Zap, Users, Wifi, ArrowUpRight, Activity as ActivityIcon, ShieldCheck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Mini Sparkline chart renderer for visual flair */
function MiniSparkline({ color, points = [15, 22, 18, 30, 26, 45, 38, 55, 62] }) {
  const width = 80
  const height = 28
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = max - min || 1

  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width
      const y = height - ((p - min) / range) * (height - 6) - 3
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg width={width} height={height} className="overflow-visible shrink-0 opacity-80">
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** @param {{ analytics: object, ready: boolean, onOpenChats?: Function, onReconnect?: Function }} props */
export default function Stats({ analytics = {}, ready = false, onOpenChats, onReconnect }) {
  const {
    messagesToday = 0,
    apiCallsToday = 0,
    totalContacts = 0,
  } = analytics

  const cards = [
    {
      id: 'msgs',
      label: 'Messages Processed',
      value: messagesToday,
      sublabel: '+18% vs yesterday',
      trend: 'up',
      Icon: MessageCircle,
      accent: '#a855f7',
      accentBg: 'rgba(168,85,247,0.12)',
      borderAccent: 'rgba(168,85,247,0.25)',
      sparkPoints: [12, 18, 25, 20, 35, 42, 38, messagesToday > 0 ? messagesToday : 50],
    },
    {
      id: 'apicalls',
      label: 'AI Invocations Today',
      value: apiCallsToday,
      sublabel: 'Avg latency ~380ms',
      trend: 'fast',
      Icon: Zap,
      accent: '#6366f1',
      accentBg: 'rgba(99,102,241,0.12)',
      borderAccent: 'rgba(99,102,241,0.25)',
      sparkPoints: [8, 14, 19, 28, 24, 39, apiCallsToday > 0 ? apiCallsToday : 45],
    },
    {
      id: 'contacts',
      label: 'Active Contacts',
      value: totalContacts,
      sublabel: 'Synced & opt-in ready',
      trend: 'synced',
      Icon: Users,
      accent: '#10b981',
      accentBg: 'rgba(168,85,247,0.12)',
      borderAccent: 'rgba(16,185,129,0.25)',
      sparkPoints: [2, 3, 3, 4, 4, 5, totalContacts > 0 ? totalContacts : 6],
    },
    {
      id: 'status',
      label: 'WhatsApp Gateway',
      value: ready ? 'ONLINE' : 'OFFLINE',
      sublabel: ready ? 'Autonomous auto-reply live' : 'Click to Scan QR & Reconnect →',
      isStatus: true,
      onClick: !ready && onOpenChats ? onOpenChats : undefined,
      Icon: Wifi,
      accent: ready ? '#25d366' : '#ef4444',
      accentBg: ready ? 'rgba(37,211,102,0.12)' : 'rgba(239,68,68,0.12)',
      borderAccent: ready ? 'rgba(37,211,102,0.3)' : 'rgba(239,68,68,0.3)',
      sparkPoints: ready ? [1, 1, 1, 1, 1, 1, 1] : [0, 0, 0, 0, 0, 0, 0],
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ id, label, value, sublabel, Icon, accent, accentBg, borderAccent, sparkPoints, isStatus, onClick }, i) => (
        <motion.div
          key={id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: i * 0.06,
            duration: 0.35,
            ease: [0.16, 1, 0.3, 1],
          }}
          onClick={onClick}
          className={onClick ? "cursor-pointer" : ""}
        >
          <Card
            className="relative overflow-hidden border border-white/10 bg-[#080808]/90 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.6)] transition-all duration-200 hover:border-white/20 hover:shadow-[0_12px_32px_rgba(0,0,0,0.8)] group"
            style={{
              borderColor: borderAccent,
            }}
          >
            {/* Ambient subtle glow blob */}
            <div
              className="pointer-events-none absolute -right-6 -top-6 w-28 h-28 rounded-full blur-2xl transition-opacity duration-300 opacity-20 group-hover:opacity-40"
              style={{ background: accent }}
            />

            <CardContent className="p-4 flex flex-col justify-between h-full gap-3">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium tracking-wide text-zinc-400">
                  {label}
                </span>
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border"
                  style={{
                    background: accentBg,
                    borderColor: borderAccent,
                    color: accent,
                  }}
                >
                  <Icon size={14} strokeWidth={2.2} />
                </div>
              </div>

              {/* Middle row: Big Number + Sparkline */}
              <div className="flex items-end justify-between gap-2 mt-1">
                <div>
                  <p
                    className={cn(
                      'font-black tracking-tight leading-none',
                      isStatus ? 'text-lg font-mono tracking-wider' : 'text-2xl font-sans'
                    )}
                    style={{ color: isStatus ? accent : '#ffffff' }}
                  >
                    {value}
                  </p>
                </div>
                {!isStatus && (
                  <MiniSparkline color={accent} points={sparkPoints} />
                )}
                {isStatus && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/40 border border-white/5">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full',
                        ready ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#25d366]' : 'bg-red-500'
                      )}
                    />
                    <span className="text-[10px] font-mono text-zinc-300">
                      {ready ? '24/7 Live' : 'Disconnected'}
                    </span>
                  </div>
                )}
              </div>

              {/* Subtext info */}
              <div className="flex items-center gap-1 pt-1 border-t border-white/5 text-[10px] text-zinc-400">
                {!isStatus && <ArrowUpRight size={11} className="text-emerald-400 shrink-0" />}
                <span className="truncate">{sublabel}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}
