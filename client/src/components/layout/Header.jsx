import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Search, Wifi, WifiOff, Loader2, LayoutDashboard,
  MessageCircle, Users, Megaphone, Bot, Settings, Clock, Sparkles,
  Zap, Mic, ShieldAlert
} from 'lucide-react'
import { cn } from '@/lib/utils'

const TAB_META = {
  dashboard: { label: 'Overview & Analytics', icon: LayoutDashboard },
  chats: { label: 'Live WhatsApp Chats', icon: MessageCircle },
  contacts: { label: 'CRM & Audience Tags', icon: Users },
  automation: { label: 'Keyword Triggers & Workflows', icon: Zap },
  vault: { label: 'Voice Vault & Audio Assets', icon: Mic },
  security: { label: 'Scam & Spam Shield Radar', icon: ShieldAlert },
  broadcast: { label: 'Broadcast Campaigns', icon: Megaphone },
  personas: { label: 'AI Persona Studio', icon: Bot },
  settings: { label: 'Settings & Lead Webhooks', icon: Settings },
}

export default function Header({
  currentUser = { username: 'admin', role: 'admin', isAdmin: true },
  contactSearch,
  setContactSearch,
  activeTab,
  ready,
  qrUrl,
}) {
  const meta = TAB_META[activeTab] || { label: activeTab, icon: LayoutDashboard }
  const Icon = meta.icon
  const [time, setTime] = useState('')

  useEffect(() => {
    const update = () => {
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between px-5 h-14 shrink-0 bg-[#050505]/85 backdrop-blur-xl border-b border-white/10 select-none shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
    >
      {/* Left: Breadcrumbs + Title */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10">
          <Icon size={14} className="text-purple-400 shrink-0" />
          <span className="text-xs font-bold text-white tracking-wide truncate">
            {meta.label}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] font-mono text-purple-300">
          <Sparkles size={10} />
          <span>v2.0 Hyper</span>
        </div>
      </div>

      {/* Center: Search when on contacts tab */}
      {activeTab === 'contacts' && (
        <div className="relative mx-4 flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search contacts or numbers..."
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
            className="w-full h-8 pl-8.5 pr-3 text-xs rounded-xl bg-black/60 border border-white/10 text-white placeholder-zinc-500 outline-none focus:border-purple-500/60 transition-colors"
          />
        </div>
      )}

      {/* Right: Live Clock & WhatsApp Gateway Status & User Role */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Role Badge */}
        {currentUser?.isAdmin ? (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-semibold">
            <span>👑 Master Admin</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-[11px] font-medium">
            <span>👤 {currentUser?.username || 'Member'}</span>
          </div>
        )}

        {/* Live Clock */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/5 text-[11px] font-mono text-zinc-400">
          <Clock size={12} className="text-zinc-500" />
          <span>{time}</span>
        </div>

        {/* Gateway Badge */}
        {ready ? (
          <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold shadow-[0_0_12px_rgba(16,185,129,0.15)]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span>Gateway Active</span>
          </div>
        ) : qrUrl ? (
          <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Scan QR Code</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Offline</span>
          </div>
        )}
      </div>
    </header>
  )
}
