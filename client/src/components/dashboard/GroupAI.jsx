import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Flame,
  UsersRound,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Shield,
  Sliders,
  Sparkles,
  AlertCircle,
  Clock,
  Volume2,
  MessageSquare,
  Power,
  Users
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

export default function GroupAI({ currentUser }) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [alertMsg, setAlertMsg] = useState('')

  // State from backend
  const [groups, setGroups] = useState([])
  const [globalEnabled, setGlobalEnabled] = useState(false)
  const [cooldown, setCooldown] = useState(20)
  const [chance, setChance] = useState(0)
  const [profanity, setProfanity] = useState(true)
  const [persona, setPersona] = useState('bc')
  const [ready, setReady] = useState(true)

  // Fetch groups and active config
  const fetchGroupData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const res = await fetch('/api/groups', { credentials: 'include' })
      const data = await res.json()
      if (data.ok) {
        setGroups(data.groups || [])
        setGlobalEnabled(!!data.enabled)
        setCooldown(data.cooldown || 20)
        setChance(typeof data.chance === 'number' ? data.chance : 0)
        setProfanity(data.profanity !== false)
        setPersona(data.persona || 'bc')
        setReady(data.ready !== false)
      } else {
        setAlertMsg(data.error || 'Failed to load WhatsApp groups')
      }
    } catch (err) {
      setAlertMsg('Network error: Could not reach group API')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchGroupData()
  }, [])

  // 1-Click Toggle a single group ON or OFF
  const handleToggleGroup = async (groupId, currentStatus) => {
    const newStatus = !currentStatus
    setTogglingId(groupId)

    // Optimistic UI update
    setGroups(prev =>
      prev.map(g => (g.id === groupId ? { ...g, enabled: newStatus } : g))
    )

    try {
      const res = await fetch('/api/groups/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ groupId, enabled: newStatus }),
      })
      const data = await res.json()

      if (data.ok) {
        setAlertMsg(newStatus ? 'Group activated! Bot will now respond here.' : 'Group deactivated. Bot silenced in this group.')
        setTimeout(() => setAlertMsg(''), 3500)
      } else {
        // Rollback on error
        setGroups(prev =>
          prev.map(g => (g.id === groupId ? { ...g, enabled: currentStatus } : g))
        )
        setAlertMsg(data.error || 'Failed to update group')
      }
    } catch (err) {
      setGroups(prev =>
        prev.map(g => (g.id === groupId ? { ...g, enabled: currentStatus } : g))
      )
      setAlertMsg('Network error while toggling group')
    } finally {
      setTogglingId(null)
    }
  }

  // Update master settings (Global ON/OFF, cooldown, chance, profanity, persona)
  const handleSaveConfig = async (patch) => {
    setSavingConfig(true)
    try {
      const nextSettings = {
        enabled: patch.enabled !== undefined ? patch.enabled : globalEnabled,
        cooldown: patch.cooldown !== undefined ? patch.cooldown : cooldown,
        chance: patch.chance !== undefined ? patch.chance : chance,
        profanity: patch.profanity !== undefined ? patch.profanity : profanity,
        persona: patch.persona !== undefined ? patch.persona : persona,
      }

      if (patch.enabled !== undefined) setGlobalEnabled(patch.enabled)
      if (patch.cooldown !== undefined) setCooldown(patch.cooldown)
      if (patch.chance !== undefined) setChance(patch.chance)
      if (patch.profanity !== undefined) setProfanity(patch.profanity)
      if (patch.persona !== undefined) setPersona(patch.persona)

      const res = await fetch('/api/groups/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(nextSettings),
      })
      const data = await res.json()

      if (data.ok) {
        setAlertMsg('Settings updated successfully in real time!')
        setTimeout(() => setAlertMsg(''), 3000)
      } else {
        setAlertMsg(data.error || 'Failed to save settings')
      }
    } catch (err) {
      setAlertMsg('Network error while saving settings')
    } finally {
      setSavingConfig(false)
    }
  }

  const handleCopyId = (id) => {
    navigator.clipboard?.writeText(id)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const filteredGroups = groups.filter(g =>
    (g.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (g.id || '').includes(search)
  )

  const activeCount = groups.filter(g => g.enabled).length

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.25)]">
              <Flame size={18} className="text-orange-400" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Group AI Companion 😈
            </h2>
            <Badge
              variant={globalEnabled ? 'success' : 'secondary'}
              className="text-[11px] font-mono"
            >
              {globalEnabled ? '● Master Active' : '○ Master Paused'}
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Autonomous roast, witty banter & smart AI companion inside selected WhatsApp groups.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchGroupData(true)}
            disabled={refreshing}
            className="text-xs gap-1.5 bg-black/40 border-white/10 hover:bg-orange-600/20 hover:border-orange-500/40 text-zinc-200"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin text-orange-400' : 'text-orange-400'} />
            {refreshing ? 'Syncing...' : 'Sync WhatsApp Groups'}
          </Button>
        </div>
      </div>

      {/* ── Status Notification Alert ── */}
      <AnimatePresence>
        {alertMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-300 text-xs flex items-center justify-between shadow-lg"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="shrink-0 text-orange-400" />
              <span>{alertMsg}</span>
            </div>
            <button onClick={() => setAlertMsg('')} className="text-orange-400/60 hover:text-orange-300">
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hero Master Switch Card ── */}
      <Card className={`border transition-all duration-300 ${globalEnabled ? 'border-orange-500/30 bg-gradient-to-r from-[#0d0703]/95 via-[#080808]/95 to-[#080808]/95 shadow-[0_10px_35px_rgba(249,115,22,0.15)]' : 'border-white/10 bg-[#080808]/95'}`}>
        <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${globalEnabled ? 'bg-orange-500/15 border-orange-500/40 text-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.3)]' : 'bg-zinc-800/40 border-white/10 text-zinc-500'}`}>
              <Power size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  {globalEnabled ? 'Group AI Engine is LIVE' : 'Group AI Engine is DISABLED'}
                </h3>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono ${globalEnabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-400 border border-white/5'}`}>
                  {globalEnabled ? `${activeCount} Groups Active` : 'All Groups Muted'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 max-w-xl">
                {globalEnabled
                  ? 'The bot is listening in your activated groups below. It replies when mentioned, replied to, or with !devil.'
                  : 'Master switch is off. The bot will not reply to any group messages regardless of individual group toggles.'}
              </p>
            </div>
          </div>

          <Button
            onClick={() => handleSaveConfig({ enabled: !globalEnabled })}
            disabled={savingConfig}
            className={`shrink-0 font-semibold text-xs px-5 py-2.5 rounded-xl transition-all shadow-lg ${
              globalEnabled
                ? 'bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300'
                : 'bg-orange-600 hover:bg-orange-500 text-white shadow-[0_4px_20px_rgba(249,115,22,0.35)]'
            }`}
          >
            <Power size={14} className="mr-1.5" />
            {globalEnabled ? 'Turn OFF Master Switch' : 'Activate Group AI Globally'}
          </Button>
        </CardContent>
      </Card>

      {/* ── Advanced Control Bar ── */}
      <Card className="border border-white/10 bg-[#080808]/95 shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Sliders size={15} className="text-orange-400" />
            <CardTitle className="text-xs font-bold text-white">Group AI Personality & Anti-Spam Rules</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Cooldown Settings */}
          <div className="p-3.5 rounded-xl bg-black/50 border border-white/5 flex flex-col justify-between gap-2.5">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Clock size={13} className="text-amber-400" /> Cooldown Timer
                </span>
                <span className="text-xs font-mono font-bold text-amber-400">{cooldown}s</span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Minimum wait between bot replies in a group</p>
            </div>
            <div className="flex items-center gap-1.5">
              {[10, 20, 30, 60].map(sec => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => handleSaveConfig({ cooldown: sec })}
                  className={`flex-1 py-1 text-xs rounded-lg font-mono transition-all border ${
                    cooldown === sec
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold'
                      : 'bg-black/40 border-white/5 text-zinc-400 hover:bg-white/5'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          {/* Spontaneous Chatter Chance */}
          <div className="p-3.5 rounded-xl bg-black/50 border border-white/5 flex flex-col justify-between gap-2.5">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <MessageSquare size={13} className="text-purple-400" /> Unsolicited Chatter
                </span>
                <span className="text-xs font-mono font-bold text-purple-400">
                  {chance === 0 ? '0% (Mentions Only)' : `${Math.round(chance * 100)}%`}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Random witty interjections without being tagged</p>
            </div>
            <div className="flex items-center gap-1.5">
              {[
                { label: '0%', val: 0 },
                { label: '5%', val: 0.05 },
                { label: '10%', val: 0.1 },
                { label: '20%', val: 0.2 }
              ].map(opt => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => handleSaveConfig({ chance: opt.val })}
                  className={`flex-1 py-1 text-xs rounded-lg font-mono transition-all border ${
                    chance === opt.val
                      ? 'bg-purple-500/20 border-purple-500/40 text-purple-300 font-bold'
                      : 'bg-black/40 border-white/5 text-zinc-400 hover:bg-white/5'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tone / Profanity Policy */}
          <div className="p-3.5 rounded-xl bg-black/50 border border-white/5 flex flex-col justify-between gap-2.5">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Shield size={13} className="text-emerald-400" /> Roast Tone
                </span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {profanity ? '🌶️ Spicy & Unfiltered' : '🛡️ Family Friendly'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Allow casual non-hateful banter in friend groups</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleSaveConfig({ profanity: true })}
                className={`flex-1 py-1 text-xs rounded-lg font-medium transition-all border ${
                  profanity
                    ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 font-bold'
                    : 'bg-black/40 border-white/5 text-zinc-400 hover:bg-white/5'
                }`}
              >
                🌶️ Spicy Roast
              </button>
              <button
                type="button"
                onClick={() => handleSaveConfig({ profanity: false })}
                className={`flex-1 py-1 text-xs rounded-lg font-medium transition-all border ${
                  !profanity
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold'
                    : 'bg-black/40 border-white/5 text-zinc-400 hover:bg-white/5'
                }`}
              >
                🛡️ Clean / PG
              </button>
            </div>
          </div>

          {/* Group Persona */}
          <div className="p-3.5 rounded-xl bg-black/50 border border-white/5 flex flex-col justify-between gap-2.5">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Flame size={13} className="text-red-400" /> Group Persona
                </span>
                <span className="text-xs font-mono font-bold text-red-400">
                  {persona === 'devil' ? '😈 Devil' : '🔥 Paaji'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Roast personality in WhatsApp groups</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleSaveConfig({ persona: 'paaji' })}
                className={`flex-1 py-1 text-xs rounded-lg font-medium transition-all border ${
                  persona !== 'devil'
                    ? 'bg-red-500/20 border-red-500/40 text-red-300 font-bold'
                    : 'bg-black/40 border-white/5 text-zinc-400 hover:bg-white/5'
                }`}
              >
                🔥 Paaji
              </button>
              <button
                type="button"
                onClick={() => handleSaveConfig({ persona: 'devil' })}
                className={`flex-1 py-1 text-xs rounded-lg font-medium transition-all border ${
                  persona === 'devil'
                    ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 font-bold'
                    : 'bg-black/40 border-white/5 text-zinc-400 hover:bg-white/5'
                }`}
              >
                😈 Devil
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── WhatsApp Groups Direct Toggle Switcher ── */}
      <Card className="border border-white/10 bg-[#080808]/95 shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                <UsersRound size={16} className="text-orange-400" />
                Joined WhatsApp Groups ({groups.length})
              </CardTitle>
              <CardDescription className="text-xs text-zinc-400 mt-0.5">
                Click any switch to instantly activate or silence Devil AI in that specific group. No server restart needed!
              </CardDescription>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <Input
                placeholder="Search groups by name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 text-xs bg-black/40 border-white/10 focus:border-orange-500/50 h-8 text-zinc-200"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <RefreshCw size={24} className="animate-spin text-orange-400" />
              <p className="text-xs text-zinc-400">Loading your WhatsApp groups from gateway...</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <Users size={20} className="text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">No WhatsApp Groups Found</p>
                <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                  Make sure your WhatsApp phone device is linked and that your WhatsApp account is added to at least one group.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fetchGroupData(true)}
                className="mt-2 text-xs border-white/10 bg-black/40 text-zinc-200 hover:bg-orange-600/20"
              >
                Refresh Group List
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredGroups.map(group => {
                const isToggling = togglingId === group.id
                return (
                  <div
                    key={group.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                      group.enabled
                        ? 'bg-gradient-to-r from-orange-950/20 via-black/40 to-black/40 border-orange-500/30 shadow-[0_4px_20px_rgba(249,115,22,0.1)]'
                        : 'bg-black/30 border-white/5 hover:border-white/10'
                    }`}
                  >
                    {/* Left: Group Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs border ${
                        group.enabled
                          ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 shadow-[0_0_12px_rgba(249,115,22,0.3)]'
                          : 'bg-zinc-800/40 border-white/5 text-zinc-400'
                      }`}>
                        {(group.name || 'G').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-white truncate max-w-xs sm:max-w-md">
                            {group.name}
                          </h4>
                          {group.enabled && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] font-mono text-zinc-500 truncate max-w-[200px] sm:max-w-sm">
                            {group.id}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyId(group.id)}
                            className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5"
                            title="Copy Group JID"
                          >
                            {copiedId === group.id ? (
                              <Check size={11} className="text-emerald-400" />
                            ) : (
                              <Copy size={11} />
                            )}
                          </button>
                          {group.participantsCount > 0 && (
                            <span className="text-[10px] text-zinc-500 bg-white/5 px-1.5 py-0.5 rounded">
                              {group.participantsCount} members
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Direct 1-Click Toggle Button */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <Button
                        size="sm"
                        disabled={isToggling}
                        onClick={() => handleToggleGroup(group.id, group.enabled)}
                        className={`text-xs px-4 py-1.5 rounded-xl font-semibold transition-all border ${
                          group.enabled
                            ? 'bg-emerald-500/15 hover:bg-red-500/20 border-emerald-500/40 hover:border-red-500/40 text-emerald-300 hover:text-red-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                            : 'bg-zinc-900 hover:bg-orange-600/20 border-white/10 hover:border-orange-500/40 text-zinc-400 hover:text-orange-300'
                        }`}
                      >
                        {isToggling ? (
                          <RefreshCw size={12} className="animate-spin mr-1.5 text-orange-400" />
                        ) : group.enabled ? (
                          <CheckCircle2 size={13} className="mr-1.5 text-emerald-400" />
                        ) : (
                          <XCircle size={13} className="mr-1.5 text-zinc-500" />
                        )}
                        {group.enabled ? 'Active (Click to Mute)' : 'Click to Enable'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Interactive Command Cheatsheet ── */}
      <Card className="border border-white/10 bg-[#080808]/95">
        <CardHeader className="pb-3 border-b border-white/5">
          <CardTitle className="text-xs font-bold text-white flex items-center gap-2">
            <Sparkles size={14} className="text-orange-400" />
            Group Commands & Controls Reference
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-black/40 border border-white/5">
            <span className="text-[11px] font-mono font-bold text-orange-400">paaji / devil &lt;prompt&gt;</span>
            <p className="text-[11px] text-zinc-400 mt-1">Example: "paaji rahul ko roast karo pehle" or "paaji sun"</p>
          </div>
          <div className="p-3 rounded-xl bg-black/40 border border-white/5">
            <span className="text-[11px] font-mono font-bold text-orange-400">@mention or Quote Reply</span>
            <p className="text-[11px] text-zinc-400 mt-1">Tagging the bot or replying to its messages initiates banter.</p>
          </div>
          <div className="p-3 rounded-xl bg-black/40 border border-white/5">
            <span className="text-[11px] font-mono font-bold text-amber-400">paaji stop / devil stop / bas kar</span>
            <p className="text-[11px] text-zinc-400 mt-1">Any member can opt out individually. Bot will never target them.</p>
          </div>
          <div className="p-3 rounded-xl bg-black/40 border border-white/5">
            <span className="text-[11px] font-mono font-bold text-emerald-400">paaji pause / devil on</span>
            <p className="text-[11px] text-zinc-400 mt-1">Group Admins only: temporarily silence or resume the bot.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
