import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import './App.css'

function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [passwordInput, setPasswordInput] = useState('')
  const [authError, setAuthError] = useState('')
  const [config, setConfig] = useState({ hasApiKey: false, hasChats: false, hasClosestPerson: false })
  const [showApiKeyForm, setShowApiKeyForm] = useState(true)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [chats, setChats] = useState([])
  const [uploadStatus, setUploadStatus] = useState({ text: '', type: '' })
  const [uploading, setUploading] = useState(false)
  const [qrUrl, setQrUrl] = useState(null)
  const [ready, setReady] = useState(false)
  const [messages, setMessages] = useState([])
  const messagesContentRef = useRef(null)
  const socketRef = useRef(null)

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status')
      const data = await res.json()
      setAuthenticated(data.authenticated || false)
      setCheckingAuth(false)
      if (data.authenticated) {
        checkConfig()
      }
    } catch {
      setAuthenticated(false)
      setCheckingAuth(false)
    }
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    const password = passwordInput.trim()
    if (!password) {
      setAuthError('Password is required')
      return
    }
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include',
      })
      
      const data = await res.json()
      
      if (res.ok && data.ok) {
        setAuthenticated(true)
        setPasswordInput('')
        setAuthError('')
        checkConfig()
      } else {
        setAuthError(data.error || 'Invalid password')
      }
    } catch (error) {
      console.error('Login error:', error)
      setAuthError('Login failed. Please try again.')
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      setAuthenticated(false)
      setConfig({ hasApiKey: false, hasChats: false, hasClosestPerson: false })
    } catch {
      setAuthenticated(false)
    }
  }

  const checkConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config', { credentials: 'include' })
      if (res.status === 401) {
        setAuthenticated(false)
        return
      }
      const data = await res.json()
      setConfig({
        hasApiKey: !!data.hasApiKey,
        hasChats: !!data.hasChats,
        hasClosestPerson: !!data.hasClosestPerson,
      })
      setShowApiKeyForm(!data.hasApiKey)
    } catch {
      setShowApiKeyForm(true)
      setConfig({ hasApiKey: false, hasChats: false, hasClosestPerson: false })
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const loadChats = useCallback(async () => {
    try {
      const res = await fetch('/api/chats', { credentials: 'include' })
      if (res.status === 401) {
        setAuthenticated(false)
        return
      }
      const data = await res.json()
      setChats(data.files || [])
    } catch {
      setChats([])
    }
  }, [])

  useEffect(() => {
    loadChats()
  }, [loadChats])

  useEffect(() => {
    const socket = io()
    socketRef.current = socket
    socket.on('qr', (data) => {
      setReady(false)
      setQrUrl(data?.dataUrl || null)
    })
    socket.on('ready', () => {
      setQrUrl(null)
      setReady(true)
    })
    socket.on('message', (msg) => {
      setMessages((prev) => [...prev, msg])
    })
    return () => socket.disconnect()
  }, [])

  useEffect(() => {
    if (!messages.length) return
    const el = messagesContentRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const saveApiKey = async () => {
    const key = apiKeyInput.trim()
    if (!key) return
    try {
      const res = await fetch('/api/set-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
        credentials: 'include',
      })
      if (res.status === 401) {
        setAuthenticated(false)
        return
      }
      const data = await res.json()
      if (data.ok) {
        setApiKeyInput('')
        setShowApiKeyForm(false)
        checkConfig()
      } else {
        alert(data.error || 'Failed to save key')
      }
    } catch {
      alert('Failed to save key')
    }
  }

  const clearApiKey = async () => {
    try {
      const res = await fetch('/api/clear-key', { method: 'POST', credentials: 'include' })
      if (res.status === 401) {
        setAuthenticated(false)
        return
      }
      setShowApiKeyForm(true)
      checkConfig()
    } catch {
      alert('Failed to clear key')
    }
  }

  const handleUploadChat = async (e) => {
    e.preventDefault()
    const form = e.target
    const fileInput = form.querySelector('input[type="file"]')
    const asClosest = form.querySelector('input[name="asClosest"]')?.checked ?? false
    if (!fileInput?.files?.[0]) {
      setUploadStatus({ text: 'Choose a .txt file first.', type: 'error' })
      return
    }
    const formData = new FormData()
    formData.append('chat', fileInput.files[0])
    formData.append('asClosest', asClosest ? 'true' : 'false')
    setUploading(true)
    setUploadStatus({ text: 'Uploading…', type: '' })
    try {
      const res = await fetch('/api/upload-chat', { method: 'POST', body: formData, credentials: 'include' })
      if (res.status === 401) {
        setAuthenticated(false)
        return
      }
      const data = await res.json()
      if (data.ok) {
        setUploadStatus({ text: data.message || 'Uploaded.', type: 'success' })
        form.reset()
        loadChats()
        checkConfig()
      } else {
        setUploadStatus({ text: data.error || 'Upload failed.', type: 'error' })
      }
    } catch {
      setUploadStatus({ text: 'Upload failed. Try again.', type: 'error' })
    }
    setUploading(false)
  }

  const configError = !config.hasApiKey || !config.hasChats

  if (checkingAuth) {
    return (
      <div className="app-layout" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Checking authentication...</div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="app-layout" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
        <div style={{ maxWidth: '400px', width: '100%', padding: '20px' }}>
          <h2 style={{ marginBottom: '20px' }}>Authentication Required</h2>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="password" style={{ display: 'block', marginBottom: '5px' }}>Password:</label>
              <input
                type="password"
                id="password"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value)
                  setAuthError('')
                }}
                style={{ width: '100%', padding: '8px', fontSize: '16px' }}
                autoFocus
              />
              {authError && <div style={{ color: 'red', marginTop: '5px', fontSize: '14px' }}>{authError}</div>}
            </div>
            <button type="submit" style={{ width: '100%', padding: '10px', fontSize: '16px', cursor: 'pointer' }}>
              Login
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="app-layout">
      <aside className="settings-panel">
        <h2>Settings</h2>

        <div className="api-key-wrap">
          <div className="api-key-panel">
            <label htmlFor="apiKeyInput">OpenAI API Key</label>
            <p>Not found in environment. Enter your key below (stored in your browser cookie).</p>
            <div className={`api-key-form ${showApiKeyForm ? '' : 'hidden'}`}>
              <div className="api-key-row">
                <input
                  type="password"
                  id="apiKeyInput"
                  placeholder="sk-..."
                  autoComplete="off"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
                <button type="button" className="btn btn-primary" onClick={saveApiKey}>
                  Save
                </button>
              </div>
            </div>
            <div className={`api-key-success ${showApiKeyForm ? 'hidden' : ''}`}>
              ✓ Key saved. Bot can reply now.
              <button type="button" className="btn-link" onClick={() => setShowApiKeyForm(true)}>
                Change key
              </button>
              <button type="button" className="btn-link" onClick={clearApiKey}>
                Clear key
              </button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className={`qr-section ${qrUrl ? '' : 'hidden'}`}>
            {qrUrl && <img src={qrUrl} alt="QR Code" />}
            <p>Scan with WhatsApp on your phone</p>
          </div>
          <div className={`ready-section ${ready ? '' : 'hidden'}`}>
            <span className="badge">WhatsApp logged in</span>
          </div>
        </div>

        <div className="upload-chat-wrap">
          <div className="upload-chat-panel">
            {chats.length > 0 && (
              <div className="chat-already-uploaded">
                <span className="chat-uploaded-badge">✓ Chat already uploaded</span>
                <p className="chat-uploaded-hint">Reference chats are stored locally. You can add more below.</p>
              </div>
            )}
            <label>Upload a chat to improve replies</label>
            <p>Export a WhatsApp chat (with your closest person) as .txt and upload it. The bot will use it to match your real style and tone.</p>
            <form className="upload-form" onSubmit={handleUploadChat}>
              <div className="upload-row">
                <input type="file" accept=".txt" required />
                <label className="checkbox-label">
                  <input type="checkbox" name="asClosest" />
                  Use as <strong>closest person</strong> chat (main style reference)
                </label>
              </div>
              <button type="submit" className="btn btn-primary" disabled={uploading}>
                Upload chat
              </button>
            </form>
            <div className={`upload-status ${uploadStatus.type}`}>{uploadStatus.text}</div>
            <div className="chats-list-wrap">
              <span className="chats-list-label">Reference chats:</span>
              <ul className="chats-list">
                {chats.length ? (
                  chats.map((f) => (
                    <li key={f.name} className={f.isClosest ? 'closest' : ''}>
                      {f.name}{f.isClosest ? ' (closest person)' : ''}
                    </li>
                  ))
                ) : (
                  <li>No chats uploaded yet. Upload a .txt export above.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </aside>

      <main className="messages-panel">
        <header className="messages-panel-header">
          <h1>Open trulychat — Incoming messages</h1>
          <button onClick={handleLogout} style={{ marginLeft: 'auto', padding: '8px 16px', cursor: 'pointer' }}>
            Logout
          </button>
        </header>
        <div className="messages-panel-content" ref={messagesContentRef}>
          {configError && (
            <div className="config-error-banner">
              <span className="icon">⚠️</span>
              <span>OpenAI key and personal chat are required to process SMS. Add your API key in Settings and upload a chat (e.g. closest person) to enable replies.</span>
            </div>
          )}
          <div className="messages-wrap">
            {messages.length === 0 && (
              <p className="messages-empty">
                No messages yet. When someone sends a WhatsApp message, it will appear here.
              </p>
            )}
            <ul className="messages-list">
              {messages.map((msg) => (
                <li key={msg.id || `${msg.from}-${msg.timestamp}`}>
                  <div className="message-avatar">
                    {(msg.fromName || msg.from || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="message-body-wrap">
                    <div className="from">{msg.fromName || msg.from || 'Unknown'}</div>
                    <div className="body">{msg.body || '(no text)'}</div>
                    <div className="time">
                      {msg.timestamp ? new Date(msg.timestamp * 1000).toLocaleString() : ''}
                    </div>
                    {msg.hasMedia && <div className="media-badge">📎 Media attached</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
