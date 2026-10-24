import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { MessageCircle, QrCode, Wifi, WifiOff, Bot, User, RefreshCw, Loader2 } from 'lucide-react'
import { formatSafeTime } from '@/lib/utils'
import { pairFeedEvents } from '@/lib/feedPairs'

function getInitials(jid = '') {
  return jid.replace(/@.*/, '').slice(0, 2).toUpperCase()
}

export default function ChatWindow({ messages, feed, selectedJid, setSelectedJid, ready, qrUrl, config, onReconnect }) {
  const scrollContainerRef = useRef(null)
  const [isResetting, setIsResetting] = useState(false)

  const handleReconnect = async () => {
    if (isResetting) return
    setIsResetting(true)
    try {
      if (onReconnect) await onReconnect()
    } finally {
      setTimeout(() => setIsResetting(false), 2500)
    }
  }

  const filtered = selectedJid
    ? messages.filter((m) => m.jid === selectedJid || m.from === selectedJid)
    : messages

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [filtered.length])

  // QR code linking state
  if (!ready && qrUrl) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-5 p-8"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center border border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.25)]"
            style={{ background: 'rgba(168,85,247,0.12)' }}
          >
            <QrCode className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <p className="text-base font-bold text-white tracking-tight">
              Link WhatsApp Device
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Open WhatsApp on your phone → <span className="text-purple-300 font-medium">Linked Devices</span> → <span className="text-emerald-300 font-medium">Link a Device</span>
            </p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-3.5 rounded-2xl bg-white shadow-[0_10px_35px_rgba(0,0,0,0.8)] border border-white/20"
        >
          <img src={qrUrl} alt="WhatsApp QR Code" className="w-56 h-56 block rounded-lg" />
        </motion.div>

        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>Awaiting device scan…</span>
          </div>

          <button
            onClick={handleReconnect}
            disabled={isResetting}
            className="text-xs text-zinc-400 hover:text-purple-400 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 mt-1"
          >
            <RefreshCw size={12} className={isResetting ? "animate-spin" : ""} />
            <span>{isResetting ? "Generating new code…" : "Refresh QR Code / Reset Session"}</span>
          </button>
        </div>
      </div>
    )
  }

  // Not connected, no QR
  if (!ready && !qrUrl) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-5 p-8 text-center"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
        </div>
        <div>
          <p className="text-base font-bold text-white tracking-tight">
            WhatsApp Gateway Initializing
          </p>
          <p className="text-xs text-zinc-400 mt-1 max-w-sm">
            Setting up secure WebSocket gateway and generating a fresh QR code for authentication.
          </p>
        </div>

        <button
          onClick={handleReconnect}
          disabled={isResetting}
          className="mt-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs flex items-center gap-2 transition-all shadow-[0_4px_15px_rgba(168,85,247,0.3)] cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={13} className={isResetting ? "animate-spin" : ""} />
          <span>{isResetting ? "Starting Gateway…" : "Initialize & Get QR Code"}</span>
        </button>
      </div>
    )
  }

  // Live Feed pairs view: when no contact is selected and feed events
  // exist, show each user question with the reply it got and the
  // persona that replied — so verification needs no screenshots.
  if (!selectedJid && feed && feed.length > 0) {
    const pairs = pairFeedEvents(feed)
    return (
      <div
        className="flex flex-col h-full"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border-default)' }}
        >
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4" style={{ color: 'var(--accent-green)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Live Feed
            </span>
            <Badge variant="success">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
              Live
            </Badge>
          </div>
          <Badge variant="secondary">{pairs.length} Q&amp;A</Badge>
        </div>
        <div className="flex-1 px-3 py-2 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          <div className="flex flex-col gap-3 py-1">
            {pairs.map((pair, i) => (
              <div
                key={pair.question?._id || pair.reply?._id || i}
                className="rounded-2xl px-3 py-2.5"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {pair.contactName || (pair.jid || '').replace(/@.*/, '')}
                  </span>
                  <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    {formatSafeTime(pair.question?.ts || pair.reply?.ts, false)}
                  </span>
                </div>
                {pair.question && (
                  <div className="flex gap-2 mb-1.5">
                    <User className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {pair.question.text || '[media]'}
                    </p>
                  </div>
                )}
                {pair.reply ? (
                  <div className="flex gap-2">
                    <Bot className="w-3.5 h-3.5 shrink-0 mt-0.5 text-purple-400" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: 'rgba(168,85,247,0.15)', color: '#d8b4fe' }}
                        >
                          🤖 {pair.reply.persona || (pair.reply.kind === 'rule' ? 'Auto-Rule' : pair.reply.kind === 'donAway' ? 'Don Away' : 'System')}
                        </span>
                        {pair.reply.voice && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                            🎙️ voice
                          </span>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {pair.reply.text || '[media]'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] ml-5" style={{ color: 'var(--text-muted)' }}>
                    ⏳ No reply recorded yet
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border-default)' }}
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4" style={{ color: 'var(--accent-green)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {selectedJid ? getInitials(selectedJid) + ' chat' : 'Live Feed'}
          </span>
          <Badge variant="success">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
            Live
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{filtered.length} msgs</Badge>
          {selectedJid && (
            <button
              onClick={() => setSelectedJid(null)}
              className="text-[10px] px-2 py-1 rounded-lg transition-colors"
              style={{
                color: 'var(--text-muted)',
                background: 'var(--bg-surface)',
              }}
            >
              Clear filter
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 px-3 py-2 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent"
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bg-surface)' }}
            >
              <MessageCircle className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              No messages yet. Waiting for WhatsApp activity…
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 py-1">
            <AnimatePresence initial={false}>
              {[...filtered].reverse().map((msg, i) => {
                const isAI = msg.role === 'assistant' || msg.from === 'ai'
                return (
                  <motion.div
                    key={msg._id || i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className={`flex gap-2 ${isAI ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {/* Avatar */}
                    <Avatar className="w-7 h-7 shrink-0 mt-0.5">
                      <AvatarFallback className="text-[9px]">
                        {isAI ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                      </AvatarFallback>
                    </Avatar>

                    {/* Bubble */}
                    <div
                      className="max-w-[75%] rounded-2xl px-3 py-2"
                      style={{
                        background: isAI ? 'var(--primary-dim)' : 'var(--bg-surface)',
                        border: `1px solid ${isAI ? 'var(--primary-border)' : 'var(--border-default)'}`,
                      }}
                    >
                      <p
                        className="text-xs leading-relaxed"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {msg.content || msg.text || msg.body || '[media]'}
                      </p>
                      <div className="flex items-center justify-between gap-3 mt-1">
                        <span
                          className="text-[9px] font-mono"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {isAI ? 'AI' : (msg.jid || '').replace(/@.*/, '').slice(0, 12)}
                        </span>
                        <span
                          className="text-[9px] font-mono"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {formatSafeTime(msg.timestamp || msg.ts || msg.time, false)}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
