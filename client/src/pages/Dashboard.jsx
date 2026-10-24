import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import Stats from '@/components/dashboard/Stats'
import Activity from '@/components/dashboard/Activity'
import HourlyHeatmap from '@/components/dashboard/HourlyHeatmap'
const AutomationRules = lazy(() => import('@/components/dashboard/AutomationRules'))
const VoiceVault = lazy(() => import('@/components/dashboard/VoiceVault'))
const SecurityShield = lazy(() => import('@/components/dashboard/SecurityShield'))
const PersonaStudio = lazy(() => import('@/components/dashboard/PersonaStudio'))
const Broadcast = lazy(() => import('@/components/dashboard/Broadcast'))
const Settings = lazy(() => import('@/components/dashboard/Settings'))
const ProvidersPanel = lazy(() => import('@/components/dashboard/ProvidersPanel'))
const GroupAI = lazy(() => import('@/components/dashboard/GroupAI'))
const ContactList = lazy(() => import('@/components/contacts/ContactList'))
const ChatWindow = lazy(() => import('@/components/chat/ChatWindow'))
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Key, ArrowRight, X, Bot, MessageCircle, Settings as SettingsIcon, Zap, Mic, ShieldAlert, Loader2 } from 'lucide-react'

const pageTransition = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
}

// Prefetch every lazy tab chunk shortly after mount so tab switches are
// instant instead of showing the Suspense fallback on a slow host.
function prefetchTabChunks() {
  const load = (fn) => { try { fn().catch(() => {}) } catch {} }
  load(() => import('@/components/dashboard/AutomationRules'))
  load(() => import('@/components/dashboard/VoiceVault'))
  load(() => import('@/components/dashboard/SecurityShield'))
  load(() => import('@/components/dashboard/PersonaStudio'))
  load(() => import('@/components/dashboard/Broadcast'))
  load(() => import('@/components/dashboard/Settings'))
  load(() => import('@/components/dashboard/ProvidersPanel'))
  load(() => import('@/components/dashboard/GroupAI'))
  load(() => import('@/components/contacts/ContactList'))
  load(() => import('@/components/chat/ChatWindow'))
}

export default function Dashboard({
  currentUser = { username: 'admin', role: 'admin', isAdmin: true },
  setAuthenticated, ready, qrUrl,
  contacts, contactSearch, setContactSearch,
  chats, loadChats, uploading, uploadStatus, handleUploadChat, deleteChat,
  messages, feed, sysLogs, setSysLogs,
  analytics, fetchAnalytics,
  donAwayMode, toggleDonAway,
  config, checkConfig,
  showApiKeyForm, setShowApiKeyForm,
  apiKeyInput, setApiKeyInput,
  saveApiKey, clearApiKey,
  deleteContact, deleteAllContacts, clearAllHistory,
  updateContactMode,
  selectedJid, setSelectedJid,
  onReconnect,
}) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const mainRef = useRef(null)

  useEffect(() => { const t = setTimeout(prefetchTabChunks, 800); return () => clearTimeout(t) }, [])

  useEffect(() => {
    if (activeTab === 'settings' && currentUser.isAdmin) fetchAnalytics()
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [activeTab])

  const filteredContacts = contacts.filter(
    (c) =>
      (c.name || '').toLowerCase().includes(contactSearch.toLowerCase()) ||
      (c.jid || '').toLowerCase().includes(contactSearch.toLowerCase())
  )

  return (
    <div className="flex min-h-screen dashboard-ambient-mesh" style={{ background: 'var(--bg)' }}>
      {/* ── Fixed Mini Sidebar ── */}
      <Sidebar
        currentUser={currentUser}
        setAuthenticated={setAuthenticated}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        donAwayMode={donAwayMode}
        toggleDonAway={toggleDonAway}
        config={config}
        showApiKeyForm={showApiKeyForm}
        setShowApiKeyForm={setShowApiKeyForm}
      />

      {/* ── Main content (offset by fixed 64px sidebar) ── */}
      <div
        className="flex flex-col flex-1 min-w-0 min-h-screen"
        style={{
          marginLeft: 64,
        }}
      >
        {/* Header */}
        <Header
          currentUser={currentUser}
          contactSearch={contactSearch}
          setContactSearch={setContactSearch}
          activeTab={activeTab}
          ready={ready}
          qrUrl={qrUrl}
        />

        {/* Page body */}
        <main ref={mainRef} className="flex-1 p-5 overflow-auto">
          <Suspense fallback={<div role="status" className="flex min-h-48 items-center justify-center p-5"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              {...pageTransition}
              className="flex flex-col gap-5 h-full"
            >

              {/* Overview */}
              {activeTab === 'dashboard' && (
                <>
                  <Stats
                    analytics={analytics}
                    ready={ready}
                    onOpenChats={() => setActiveTab('chats')}
                    onReconnect={onReconnect}
                  />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Activity sysLogs={sysLogs} clearLogs={() => setSysLogs([])} />

                    {/* AI Autopilot Command Hub */}
                    <div
                      className="rounded-2xl p-5 flex flex-col justify-between gap-4 border border-white/10 bg-[#080808]/95 shadow-[0_10px_30px_rgba(0,0,0,0.8)]"
                    >
                      <div>
                        <div className="flex items-center justify-between pb-3 border-b border-white/5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                              <Bot size={14} className="text-purple-400" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-white">AI Autopilot Command Hub</h3>
                              <p className="text-[11px] text-zinc-400">Autonomous WhatsApp dispatch & intelligence engine</p>
                            </div>
                          </div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">
                            ● 24/7 Autopilot
                          </span>
                        </div>

                        {/* Quick Metrics Grid */}
                        <div className="grid grid-cols-2 gap-3 mt-4">
                          <div className="p-3.5 rounded-xl bg-black/60 border border-white/5 flex flex-col gap-1">
                            <span className="text-[11px] text-zinc-400">Total System Users</span>
                            <span className="text-xl font-bold font-mono text-white">{analytics.totalUsers ?? 1}</span>
                            <span className="text-[10px] text-emerald-400 font-mono">Role: Multi-tenant ready</span>
                          </div>

                          <div className="p-3.5 rounded-xl bg-black/60 border border-white/5 flex flex-col gap-1">
                            <span className="text-[11px] text-zinc-400">Knowledge Base Docs</span>
                            <span className="text-xl font-bold font-mono text-white">{chats.length}</span>
                            <span className="text-[10px] text-purple-400 font-mono">RAG Vector Context</span>
                          </div>

                          <div className="p-3.5 rounded-xl bg-black/60 border border-white/5 flex flex-col gap-1">
                            <span className="text-[11px] text-zinc-400">Away Mode Response</span>
                            <span className="text-sm font-bold text-white mt-1">{donAwayMode ? 'Active (Auto-Notice)' : 'Standard Auto'}</span>
                            <span className="text-[10px] text-amber-400 font-mono">TTS + Custom Audio</span>
                          </div>

                          <div className="p-3.5 rounded-xl bg-black/60 border border-white/5 flex flex-col gap-1">
                            <span className="text-[11px] text-zinc-400">OpenRouter AI Gateway</span>
                            <span className="text-sm font-bold text-white mt-1">{config.hasApiKey ? 'Configured ✓' : 'Key Missing ✗'}</span>
                            <span className="text-[10px] text-emerald-400 font-mono">GPT-4o Mini + Vision</span>
                          </div>
                        </div>
                      </div>

                      {/* Quick Action Navigation Buttons */}
                      <div className="pt-3 border-t border-white/5 flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveTab('chats')}
                          className="text-xs gap-1.5 bg-black/40 border-white/10 hover:bg-purple-600/20 hover:border-purple-500/40 text-zinc-200"
                        >
                          <MessageCircle size={13} className="text-purple-400" />
                          Open Live Chats
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveTab('automation')}
                          className="text-xs gap-1.5 bg-black/40 border-white/10 hover:bg-amber-600/20 hover:border-amber-500/40 text-zinc-200"
                        >
                          <Zap size={13} className="text-amber-400" />
                          Auto-Rules
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveTab('vault')}
                          className="text-xs gap-1.5 bg-black/40 border-white/10 hover:bg-emerald-600/20 hover:border-emerald-500/40 text-zinc-200"
                        >
                          <Mic size={13} className="text-emerald-400" />
                          Voice Vault
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveTab('security')}
                          className="text-xs gap-1.5 bg-black/40 border-white/10 hover:bg-rose-600/20 hover:border-rose-500/40 text-zinc-200"
                        >
                          <ShieldAlert size={13} className="text-rose-400" />
                          Scam Radar
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* 24-Hour Peak Activity & Persona Distribution */}
                  <HourlyHeatmap />
                </>
              )}

              {/* Live Chats */}
              {activeTab === 'chats' && (
                <div style={{ height: 'calc(100vh - 140px)' }}>
                  <ChatWindow
                    messages={messages}
                    feed={feed}
                    selectedJid={selectedJid}
                    setSelectedJid={setSelectedJid}
                    ready={ready}
                    qrUrl={qrUrl}
                    config={config}
                    onReconnect={onReconnect}
                  />
                </div>
              )}

              {/* Contacts & Tags */}
              {activeTab === 'contacts' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" style={{ height: 'calc(100vh - 140px)' }}>
                  <ContactList
                    contacts={filteredContacts}
                    selectedJid={selectedJid}
                    setSelectedJid={setSelectedJid}
                    updateContactMode={updateContactMode}
                    deleteContact={deleteContact}
                    deleteAllContacts={deleteAllContacts}
                  />
                  <ChatWindow
                    messages={messages}
                    feed={feed}
                    selectedJid={selectedJid}
                    setSelectedJid={setSelectedJid}
                    ready={ready}
                    qrUrl={qrUrl}
                    config={config}
                    onReconnect={onReconnect}
                  />
                </div>
              )}

              {/* WhatsApp Group AI Companion */}
              {activeTab === 'groups' && (
                <GroupAI currentUser={currentUser} />
              )}

              {/* Automation Rules & Keyword Triggers */}
              {activeTab === 'automation' && (
                <AutomationRules />
              )}

              {/* Voice Vault & Media Library */}
              {activeTab === 'vault' && (
                <VoiceVault />
              )}

              {/* Scam Shield Radar */}
              {activeTab === 'security' && (
                <SecurityShield />
              )}

              {/* Broadcast */}
              {activeTab === 'broadcast' && (
                <Broadcast contacts={contacts} ready={ready} currentUser={currentUser} />
              )}

              {/* AI Studio */}
              {activeTab === 'personas' && (
                <PersonaStudio
                  chats={chats}
                  loadChats={loadChats}
                  uploading={uploading}
                  uploadStatus={uploadStatus}
                  handleUploadChat={handleUploadChat}
                  deleteChat={deleteChat}
                />
              )}

              {/* Settings */}
              {activeTab === 'providers' && (
                <ProvidersPanel />
              )}

              {activeTab === 'settings' && (
                <Settings
                  setActiveTab={setActiveTab}
                  currentUser={currentUser}
                  analytics={analytics}
                  fetchAnalytics={fetchAnalytics}
                  deleteAllContacts={deleteAllContacts}
                  clearAllHistory={clearAllHistory}
                  config={config}
                  showApiKeyForm={showApiKeyForm}
                  setShowApiKeyForm={setShowApiKeyForm}
                  apiKeyInput={apiKeyInput}
                  setApiKeyInput={setApiKeyInput}
                  saveApiKey={saveApiKey}
                  clearApiKey={clearApiKey}
                  ready={ready}
                  qrUrl={qrUrl}
                  onReconnect={onReconnect}
                />
              )}

            </motion.div>
          </AnimatePresence>
          </Suspense>
        </main>
      </div>

      {/* ── API Key Dialog ── */}
      <Dialog open={showApiKeyForm} onOpenChange={setShowApiKeyForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-4 h-4" style={{ color: 'var(--primary)' }} />
              Configure API Key
            </DialogTitle>
            <DialogDescription>
              Add your OpenRouter API key to enable AI auto-replies.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-2">
            <Input
              type="password"
              placeholder="sk-or-v1-…"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && saveApiKey()}
            />
            <div className="flex gap-2">
              <Button onClick={saveApiKey} disabled={!apiKeyInput.trim()} className="flex-1">
                Save Key <ArrowRight className="w-3.5 h-3.5" />
              </Button>
              {config.hasApiKey && (
                <Button variant="destructive" onClick={clearApiKey}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
