import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { io } from 'socket.io-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Megaphone, Send, WifiOff, Users, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

export default function Broadcast({ contacts, ready, currentUser }) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [target, setTarget] = useState('all')
  const [delayMs, setDelayMs] = useState(3000)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    const socket = io()
    socket.on('broadcastProgress', (data) => {
      setProgress(data)
      if (data.status === 'completed' || data.status === 'failed') {
        setSending(false)
      }
    })
    return () => socket.disconnect()
  }, [])

  if (currentUser && !currentUser.isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-white/10 rounded-2xl bg-black/40">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
          <Megaphone className="w-6 h-6 text-amber-400" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Gateway Admin Access Required</h3>
        <p className="text-xs text-zinc-400 max-w-md mb-4">
          WhatsApp mass broadcasting is restricted to the Master Administrator account. This safeguards the connected phone number against bulk-spam flags, rate-limiting, and account restrictions.
        </p>
        <span className="text-[11px] font-mono text-zinc-400 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
          Logged in as: {currentUser.username} (Standard Tenant)
        </span>
      </div>
    )
  }

  const handleSend = async () => {
    if (!message.trim() || !ready) return
    setSending(true)
    setResult(null)
    setProgress(null)
    try {
      const res = await fetch('/api/broadcasts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || 'Campaign',
          message: message.trim(),
          target,
          delayMs,
        }),
        credentials: 'include',
      })
      const data = await res.json()
      setResult(data)
      if (!data.ok) setSending(false)
    } catch (err) {
      setResult({ ok: false, error: 'Network error' })
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
          Broadcast Campaign
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Send mass WhatsApp messages to your contacts with anti-ban delays
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Compose */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(251,113,133,0.1)' }}
              >
                <Megaphone className="w-3.5 h-3.5" style={{ color: '#fb7185' }} />
              </div>
              <CardTitle>Compose</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* WhatsApp not ready warning */}
            {!ready && (
              <div
                className="flex items-center gap-2 p-3 rounded-xl text-xs"
                style={{
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.2)',
                  color: '#f59e0b',
                }}
              >
                <WifiOff className="w-3.5 h-3.5 shrink-0" />
                WhatsApp must be connected before sending broadcasts.
              </div>
            )}

            {/* Campaign title */}
            <div>
              <label className="text-[11px] font-semibold mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                Campaign Name
              </label>
              <Input
                placeholder="e.g. Summer Promo"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Message */}
            <div>
              <label className="text-[11px] font-semibold mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                Message <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <textarea
                rows={5}
                placeholder="Write your broadcast message here…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-xs resize-none outline-none transition-all duration-150"
                style={{
                  background: 'var(--input-bg)',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--primary)' }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border-default)' }}
              />
              <p className="text-[10px] mt-1 text-right" style={{ color: 'var(--text-muted)' }}>
                {message.length} chars
              </p>
            </div>

            {/* Target */}
            <div>
              <label className="text-[11px] font-semibold mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                Recipients
              </label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Contacts ({contacts.length})</SelectItem>
                  <SelectItem value="auto">Auto Mode Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Delay */}
            <div>
              <label className="text-[11px] font-semibold mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                Anti-ban Delay
              </label>
              <Select value={String(delayMs)} onValueChange={(v) => setDelayMs(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2000">2 seconds (faster)</SelectItem>
                  <SelectItem value="3000">3 seconds (recommended)</SelectItem>
                  <SelectItem value="5000">5 seconds (safe)</SelectItem>
                  <SelectItem value="10000">10 seconds (very safe)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Result / Progress */}
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 p-3 rounded-xl text-xs"
                style={{
                  background: result.ok ? 'rgba(37,211,102,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${result.ok ? 'rgba(37,211,102,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  color: result.ok ? 'var(--accent-green)' : '#f87171',
                }}
              >
                {result.ok
                  ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  : <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                }
                {result.message || result.error}
              </motion.div>
            )}

            {/* Progress bar */}
            {progress && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  <span>Sending… {progress.sent}/{progress.total}</span>
                  <Badge variant={progress.status === 'completed' ? 'success' : 'default'}>
                    {progress.status}
                  </Badge>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'var(--bg-surface)' }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'var(--primary)' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round((progress.sent / progress.total) * 100)}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            {/* Send button */}
            <Button
              onClick={handleSend}
              disabled={!ready || !message.trim() || sending}
              className="w-full gap-2"
            >
              {sending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending…</>
              ) : (
                <><Send className="w-3.5 h-3.5" />Launch Campaign</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Info / Stats panel */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(37,211,102,0.1)' }}
                >
                  <Users className="w-3.5 h-3.5" style={{ color: 'var(--accent-green)' }} />
                </div>
                <CardTitle>Audience</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                <div
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: 'var(--bg-surface)' }}
                >
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Total contacts
                  </span>
                  <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    {contacts.length}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: 'var(--bg-surface)' }}
                >
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Auto-reply contacts
                  </span>
                  <span className="text-sm font-bold" style={{ color: 'var(--accent-green)' }}>
                    {contacts.filter((c) => c.mode === 'auto').length}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Anti-ban Tips
              </p>
              <ul className="flex flex-col gap-1.5">
                {[
                  'Use 3–5 second delays between messages',
                  'Avoid sending to 500+ contacts at once',
                  'Keep messages natural and varied',
                  'Only message opted-in contacts',
                ].map((tip) => (
                  <li key={tip} className="flex items-start gap-2">
                    <CheckCircle2
                      className="w-3 h-3 mt-0.5 shrink-0"
                      style={{ color: 'var(--accent-green)' }}
                    />
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {tip}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
