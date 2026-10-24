import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { io } from 'socket.io-client'
const Landing = lazy(() => import('./pages/Landing'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
import { Skeleton } from './components/ui/skeleton'
import './index.css'


function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [currentUser, setCurrentUser] = useState({ username: 'admin', role: 'admin', isAdmin: true })
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [config, setConfig] = useState({ hasApiKey: false, hasChats: false, hasClosestPerson: false })

  const [showApiKeyForm, setShowApiKeyForm] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [contactSearch, setContactSearch] = useState('')
  const [uploadStatus, setUploadStatus] = useState({ text: '', type: '' })
  const [uploading, setUploading] = useState(false)

  const [qrUrl, setQrUrl] = useState(null)
  const [ready, setReady] = useState(false)
  const [messages, setMessages] = useState([])
  const [feed, setFeed] = useState([])
  const [contacts, setContacts] = useState([])
  const [chats, setChats] = useState([])
  const [sysLogs, setSysLogs] = useState([])
  const [donAwayMode, setDonAwayMode] = useState(false)
  const [selectedJid, setSelectedJid] = useState(null)
  const [analytics, setAnalytics] = useState({
    messagesToday: 0,
    apiCallsToday: 0,
    totalContacts: 0,
    totalUsers: 0,
    users: []
  })

  const socketRef = useRef(null)

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status', { credentials: 'include' })
      const data = await res.json()
      if (data.authenticated) {
        setAuthenticated(true)
        if (data.user) {
          setCurrentUser(data.user)
        }
      } else {
        setAuthenticated(false)
      }
    } catch {
      setAuthenticated(false)
    } finally {
      setCheckingAuth(false)
    }
  }, [])

  const checkConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config', { credentials: 'include' })
      if (res.status === 401) { setAuthenticated(false); return }
      const data = await res.json()
      setConfig({ hasApiKey: !!data.hasApiKey, hasChats: !!data.hasChats, hasClosestPerson: !!data.hasClosestPerson })
      setShowApiKeyForm(!data.hasApiKey)
      fetch('/api/don-away', { credentials: 'include' })
        .then(r => r.json()).then(d => setDonAwayMode(!!d.enabled)).catch(() => {})
    } catch {}
  }, [])

  const loadChats = useCallback(async () => {
    try {
      const res = await fetch('/api/chats', { credentials: 'include' })
      if (res.status === 401) { setAuthenticated(false); return }
      const data = await res.json()
      if (data.files) setChats(data.files)
    } catch {}
  }, [])

  const loadContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts', { credentials: 'include' })
      if (res.status === 401) { setAuthenticated(false); return }
      const data = await res.json()
      if (Array.isArray(data)) setContacts(data)
    } catch {}
  }, [])

  const fetchAnalytics = useCallback(async () => {
    try {
      // /api/analytics is per-user: admin gets the global overview,
      // tenants get only their own numbers. The old call went to
      // /api/admin/analytics (403 for tenants) and was only made for
      // admins, so tenant dashboards showed 0/0/0 forever.
      const res = await fetch('/api/analytics', { credentials: 'include' })
      const data = await res.json()
      if (res.ok && data.ok) setAnalytics(data)
    } catch {}
  }, [])

  const fetchWhatsAppStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        if (data.ok) {
          setReady(!!data.ready)
          if (data.ready) {
            setQrUrl(null)
          } else if (data.qrUrl) {
            setQrUrl(data.qrUrl)
          } else if (data.status === 'not_started') {
            // This account has never started its WhatsApp connection:
            // start it now so a QR code is generated for the user.
            fetch('/api/whatsapp/connect', { method: 'POST', credentials: 'include' })
              .then(() => setTimeout(fetchWhatsAppStatus, 2500))
              .catch(() => {})
          }
        }
      }
    } catch {}
  }, [])

  const reconnectWhatsApp = async () => {
    try {
      setReady(false)
      setQrUrl(null)
      const res = await fetch('/api/whatsapp/reconnect', { method: 'POST', credentials: 'include' })
      const data = await res.json()
      if (data.ok) {
        setTimeout(fetchWhatsAppStatus, 1500)
      }
    } catch {}
  }

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (authenticated) {
      loadChats()
      loadContacts()
      checkConfig()
      fetchAnalytics()
      fetchWhatsAppStatus()
      fetch('/api/live-feed', { credentials: 'include' })
        .then(r => r.json())
        .then(d => { if (d.ok) setFeed(d.events || []) })
        .catch(() => {})
    }
  }, [authenticated, currentUser.isAdmin, checkConfig, loadChats, loadContacts, fetchAnalytics, fetchWhatsAppStatus])

  useEffect(() => {
    if (!authenticated || ready) return
    const timer = setInterval(fetchWhatsAppStatus, 4000)
    return () => clearInterval(timer)
  }, [authenticated, ready, fetchWhatsAppStatus])

  useEffect(() => {
    if (!authenticated) return
    const socket = io()
    socketRef.current = socket
    socket.on('qr', (data) => { setReady(false); setQrUrl(data?.dataUrl || null) })
    socket.on('ready', () => { setQrUrl(null); setReady(true) })
    socket.on('disconnected', () => { setReady(false); fetchWhatsAppStatus() })
    socket.on('message', (msg) => { setMessages(prev => [msg, ...prev].slice(0, 100)); loadContacts() })
    socket.on('feed', (e) => { setFeed(prev => [e, ...prev].slice(0, 100)) })
    socket.on('donAwayStatus', ({ enabled }) => setDonAwayMode(!!enabled))
    socket.on('syslog', (item) => setSysLogs(prev => [item, ...prev].slice(0, 150)))
    return () => socket.disconnect()
  }, [authenticated, loadContacts, fetchWhatsAppStatus])

  const toggleDonAway = async () => {
    const next = !donAwayMode
    setDonAwayMode(next)
    try {
      const res = await fetch('/api/don-away', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: next }), credentials: 'include' })
      // Previously a failed toggle (e.g. a tenant hitting the old
      // requireAdmin endpoint) left the UI flipped with no revert.
      if (!res.ok) setDonAwayMode(!next)
    } catch { setDonAwayMode(!next) }
  }

  const saveApiKey = async () => {
    const key = apiKeyInput.trim()
    if (!key) return
    try {
      const res = await fetch('/api/set-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key }), credentials: 'include' })
      if (res.status === 401) { setAuthenticated(false); return }
      const data = await res.json()
      if (data.ok) { setApiKeyInput(''); setShowApiKeyForm(false); checkConfig() }
    } catch {}
  }

  const clearApiKey = async () => {
    try {
      const res = await fetch('/api/clear-key', { method: 'POST', credentials: 'include' })
      if (res.status === 401) { setAuthenticated(false); return }
      setShowApiKeyForm(true); checkConfig()
    } catch {}
  }

  const updateContactMode = async (jid, mode) => {
    try {
      const res = await fetch('/api/contacts/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jid, mode }), credentials: 'include' })
      if (res.status === 401) { setAuthenticated(false); return }
      const data = await res.json()
      if (data.ok) loadContacts()
    } catch {}
  }

  const deleteContact = async (jid, e) => {
    e.stopPropagation()
    if (!confirm('Delete this contact and their history from MongoDB?')) return
    try {
      const res = await fetch(`/api/contacts/${encodeURIComponent(jid)}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) setContacts(prev => prev.filter(c => c.jid !== jid))
    } catch {}
  }

  const deleteAllContacts = async () => {
    if (!confirm('Are you sure? This will delete ALL contacts and message history from MongoDB.')) return
    try {
      const res = await fetch('/api/contacts', { method: 'DELETE', credentials: 'include' })
      if (res.ok) { setContacts([]); setMessages([]) }
    } catch {}
  }

  const clearAllHistory = async () => {
    if (!confirm('Clear all chat message history from MongoDB? (Contacts will be kept)')) return
    try {
      const res = await fetch('/api/history', { method: 'DELETE', credentials: 'include' })
      if (res.ok) setMessages([])
    } catch {}
  }

  const handleUploadChat = async (file, asClosest = false) => {
    if (!file) return
    setUploading(true)
    setUploadStatus({ text: 'Uploading…', type: 'info' })
    const fd = new FormData()
    fd.append('chat', file)
    if (asClosest) fd.append('asClosest', 'true')
    try {
      const res = await fetch('/api/upload-chat', { method: 'POST', body: fd, credentials: 'include' })
      if (res.status === 401) { setAuthenticated(false); return }
      const data = await res.json()
      if (data.ok) {
        setUploadStatus({ text: `Saved "${data.filename}"`, type: 'success' })
        loadChats()
        checkConfig()
      } else {
        setUploadStatus({ text: data.error || 'Upload failed', type: 'error' })
      }
    } catch {
      setUploadStatus({ text: 'Network error', type: 'error' })
    } finally {
      setUploading(false)
      setTimeout(() => setUploadStatus({ text: '', type: '' }), 4000)
    }
  }

  const deleteChat = async (filename, e) => {
    e?.stopPropagation()
    if (!confirm(`Delete "${filename}" from knowledge base?`)) return
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(filename)}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) { loadChats(); checkConfig() }
    } catch {}
  }

  if (checkingAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg)]">
        <Skeleton className="h-10 w-48 rounded-xl" />
      </div>
    )
  }

  if (!authenticated) {
    return (
      <Suspense fallback={<div role="status" className="p-8">Loading sign in…</div>}><Landing
        authenticated={authenticated}
        setAuthenticated={setAuthenticated}
        onLoginSuccess={(user) => {
          if (user) setCurrentUser(user)
          setAuthenticated(true)
          checkConfig()
        }}
      /></Suspense>
    )
  }

  return (
    <Suspense fallback={<div role="status" className="p-8">Loading dashboard…</div>}><Dashboard
      currentUser={currentUser}
      setAuthenticated={setAuthenticated}
      ready={ready}
      qrUrl={qrUrl}
      contacts={contacts}
      contactSearch={contactSearch}
      setContactSearch={setContactSearch}
      chats={chats}
      loadChats={loadChats}
      uploading={uploading}
      uploadStatus={uploadStatus}
      handleUploadChat={handleUploadChat}
      deleteChat={deleteChat}
      messages={messages}
      feed={feed}
      sysLogs={sysLogs}
      setSysLogs={setSysLogs}
      analytics={analytics}
      fetchAnalytics={fetchAnalytics}
      donAwayMode={donAwayMode}
      toggleDonAway={toggleDonAway}
      config={config}
      checkConfig={checkConfig}
      showApiKeyForm={showApiKeyForm}
      setShowApiKeyForm={setShowApiKeyForm}
      apiKeyInput={apiKeyInput}
      setApiKeyInput={setApiKeyInput}
      saveApiKey={saveApiKey}
      clearApiKey={clearApiKey}
      deleteContact={deleteContact}
      deleteAllContacts={deleteAllContacts}
      clearAllHistory={clearAllHistory}
      updateContactMode={updateContactMode}
      selectedJid={selectedJid}
      setSelectedJid={setSelectedJid}
      onReconnect={reconnectWhatsApp}
    /></Suspense>
  )
}

export default App
