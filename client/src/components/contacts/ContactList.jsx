import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Users, Tag, Filter, ShieldCheck, Flame, Star, ShoppingBag, PauseCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const MODES = [
  { value: 'auto', label: 'Auto' },
  { value: 'devil', label: 'Devil' },
  { value: 'boy', label: 'Dhruv' },
  { value: 'girl', label: 'Annu' },
  { value: 'manual', label: 'Manual' },
  { value: 'off', label: 'Off' },
]

const TAG_OPTIONS = [
  { id: 'hot-lead', label: '🔥 Lead', color: '#f43f5e', bg: 'rgba(244,63,94,0.15)', border: 'rgba(244,63,94,0.3)' },
  { id: 'vip', label: '⭐ VIP', color: '#eab308', bg: 'rgba(234,179,8,0.15)', border: 'rgba(234,179,8,0.3)' },
  { id: 'customer', label: '📦 Client', color: '#10b981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)' },
  { id: 'inactive', label: '⏸️ Inactive', color: '#64748b', bg: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.3)' },
]

function getInitials(name, jid) {
  const n = name || jid || '?'
  return n.replace(/@.*/, '').slice(0, 2).toUpperCase()
}

function formatPhone(jid = '') {
  return jid.replace('@s.whatsapp.net', '').replace('@g.us', ' (Group)')
}

export default function ContactList({
  contacts = [],
  selectedJid,
  setSelectedJid,
  updateContactMode,
  deleteContact,
  deleteAllContacts,
}) {
  const [selectedTagFilter, setSelectedTagFilter] = useState('all')
  // Custom personas created in AI Studio are valid contact modes too —
  // previously they existed in the backend but no UI could assign them.
  const [customModes, setCustomModes] = useState([])
  useEffect(() => {
    fetch('/api/personas', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.personas)) {
          setCustomModes(d.personas.map((p) => ({ value: p.key, label: `${p.emoji || '🎭'} ${p.name}` })))
        }
      })
      .catch(() => {})
  }, [])
  const allModes = [...MODES, ...customModes]

  const handleToggleTag = async (jid, tagId, currentTags = [], e) => {
    e?.stopPropagation()
    const tags = Array.isArray(currentTags) ? currentTags : []
    const nextTags = tags.includes(tagId) ? tags.filter((t) => t !== tagId) : [...tags, tagId]

    try {
      await fetch(`/api/features/contacts/${encodeURIComponent(jid)}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: nextTags }),
      })
      // Update locally
      const c = contacts.find((item) => item.jid === jid)
      if (c) c.tags = nextTags
    } catch {}
  }

  const filteredContacts = contacts.filter((c) => {
    if (selectedTagFilter === 'all') return true
    return Array.isArray(c.tags) && c.tags.includes(selectedTagFilter)
  })

  return (
    <div
      className="flex flex-col h-full rounded-2xl border border-white/10 bg-[#060a12]/95 shadow-[0_10px_30px_rgba(0,0,0,0.8)] overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex flex-col gap-2 px-4 py-3 border-b border-white/5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold text-white tracking-wide">
              Audience & CRM Directory
            </span>
            <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-xs font-mono">
              {contacts.length}
            </Badge>
          </div>
          {contacts.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={deleteAllContacts}
              className="gap-1 text-[10px] h-7 px-2.5 bg-rose-600 hover:bg-rose-500"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </Button>
          )}
        </div>

        {/* Tag Filters Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 scrollbar-none">
          <button
            onClick={() => setSelectedTagFilter('all')}
            className={cn(
              'px-2 py-0.5 rounded-lg text-[10px] font-mono transition-colors whitespace-nowrap',
              selectedTagFilter === 'all'
                ? 'bg-cyan-600 text-white font-bold'
                : 'bg-black/40 text-zinc-400 hover:text-white border border-white/5'
            )}
          >
            All Contacts ({contacts.length})
          </button>
          {TAG_OPTIONS.map((tag) => {
            const count = contacts.filter((c) => Array.isArray(c.tags) && c.tags.includes(tag.id)).length
            return (
              <button
                key={tag.id}
                onClick={() => setSelectedTagFilter(tag.id)}
                className={cn(
                  'px-2 py-0.5 rounded-lg text-[10px] font-mono transition-colors whitespace-nowrap',
                  selectedTagFilter === tag.id
                    ? 'text-white font-bold'
                    : 'bg-black/40 text-zinc-400 hover:text-white border border-white/5'
                )}
                style={{
                  backgroundColor: selectedTagFilter === tag.id ? tag.color : undefined,
                }}
              >
                {tag.label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10"
            >
              <Users className="w-5 h-5 text-zinc-500" />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-zinc-300">
                {contacts.length === 0 ? 'No contacts yet' : 'No contacts with this tag'}
              </p>
              <p className="text-[11px] mt-1 text-zinc-500">
                Contacts and leads appear automatically upon incoming messages
              </p>
            </div>
          </div>
        ) : (
          <div className="py-1">
            <AnimatePresence initial={false}>
              {filteredContacts.map((contact, i) => (
                <motion.div
                  key={contact.jid}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ delay: i * 0.02, duration: 0.15 }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedJid(contact.jid)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedJid(contact.jid)}
                    className={cn(
                      'flex flex-col gap-2 px-3 py-2.5 cursor-pointer transition-all duration-150 border-b border-white/5 group hover:bg-white/[0.03]',
                      selectedJid === contact.jid && 'bg-purple-600/10 border-l-2 border-l-purple-500'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <Avatar className="w-8 h-8 shrink-0 border border-white/10">
                        <AvatarFallback className="text-[10px] bg-zinc-800 text-white font-bold">
                          {getInitials(contact.name, contact.jid)}
                        </AvatarFallback>
                      </Avatar>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-xs font-bold truncate text-white group-hover:text-cyan-300 transition-colors"
                          >
                            {contact.name || formatPhone(contact.jid)}
                          </span>
                        </div>
                        <span
                          className="text-[10px] font-mono truncate block text-zinc-500"
                        >
                          {formatPhone(contact.jid)}
                        </span>
                      </div>

                      {/* Mode selector */}
                      <div
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Select
                          value={contact.mode || 'devil'}
                          onValueChange={(val) => updateContactMode(contact.jid, val)}
                        >
                          <SelectTrigger className="h-7 w-22 text-[10px] bg-black/60 border-white/10 text-zinc-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#090d14] border-white/10 text-white text-xs">
                            {allModes.map((m) => (
                              <SelectItem key={m.value} value={m.value} className="text-xs">
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Delete */}
                      <button
                        onClick={(e) => deleteContact(contact.jid, e)}
                        className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500/15 text-zinc-500 hover:text-rose-400"
                        title="Delete contact"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Tags Row */}
                    <div className="flex items-center gap-1 pl-11 flex-wrap" onClick={(e) => e.stopPropagation()}>
                      {TAG_OPTIONS.map((t) => {
                        const isAttached = Array.isArray(contact.tags) && contact.tags.includes(t.id)
                        return (
                          <button
                            key={t.id}
                            onClick={(e) => handleToggleTag(contact.jid, t.id, contact.tags, e)}
                            className={cn(
                              'text-[9px] font-mono px-1.5 py-0.2 rounded border transition-all cursor-pointer',
                              isAttached
                                ? 'font-bold shadow-sm'
                                : 'opacity-30 hover:opacity-100 bg-transparent border-white/10 text-zinc-400'
                            )}
                            style={{
                              color: isAttached ? t.color : undefined,
                              backgroundColor: isAttached ? t.bg : undefined,
                              borderColor: isAttached ? t.border : undefined,
                            }}
                          >
                            {t.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
