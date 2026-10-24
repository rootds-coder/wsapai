import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Bot, Upload, FileText, Trash2, Globe, Sparkles, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

export default function PersonaStudio({
  chats,
  loadChats,
  uploading,
  uploadStatus,
  handleUploadChat,
  deleteChat,
}) {
  const [scrapeUrlInput, setScrapeUrlInput] = useState('')
  const [scraping, setScraping] = useState(false)
  const [scrapeStatus, setScrapeStatus] = useState({ text: '', type: '' })
  // KB upload: the form owns the selected file + "closest person" flag.
  // Previously the form's onSubmit was wired straight to a handler that
  // expected a file-input change event, so "Upload & Train" silently
  // did nothing.
  const [selectedFile, setSelectedFile] = useState(null)
  const [asClosest, setAsClosest] = useState(false)

  const handleUploadSubmit = (e) => {
    e.preventDefault()
    if (selectedFile) handleUploadChat(selectedFile, asClosest)
  }

  // ── Custom Personas (backed by /api/personas) ──────────────────
  const [personas, setPersonas] = useState([])
  const [pForm, setPForm] = useState({ name: '', emoji: '🎭', description: '', systemPrompt: '', temperature: 0.85 })
  const [pStatus, setPStatus] = useState({ text: '', type: '' })
  const [savingPersona, setSavingPersona] = useState(false)

  const loadPersonas = async () => {
    try {
      const res = await fetch('/api/personas', { credentials: 'include' })
      const data = await res.json()
      if (data.ok && Array.isArray(data.personas)) setPersonas(data.personas)
    } catch {}
  }

  useEffect(() => { loadPersonas() }, [])

  const handleSavePersona = async (e) => {
    e.preventDefault()
    const key = pForm.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    if (!key || !pForm.systemPrompt.trim()) {
      setPStatus({ text: 'Name and system prompt are required.', type: 'error' })
      return
    }
    setSavingPersona(true)
    try {
      const res = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key, name: pForm.name.trim(), emoji: pForm.emoji || '🎭', description: pForm.description.trim(), systemPrompt: pForm.systemPrompt.trim(), temperature: Number(pForm.temperature) || 0.85 }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setPStatus({ text: data.message || 'Persona saved.', type: 'success' })
        setPForm({ name: '', emoji: '🎭', description: '', systemPrompt: '', temperature: 0.85 })
        loadPersonas()
      } else {
        setPStatus({ text: data.error || 'Failed to save persona.', type: 'error' })
      }
    } catch {
      setPStatus({ text: 'Network error while saving persona.', type: 'error' })
    }
    setSavingPersona(false)
  }

  const handleDeletePersona = async (key) => {
    if (!confirm(`Delete persona "${key}"? Contacts using it will fall back to the default persona.`)) return
    try {
      const res = await fetch(`/api/personas/${encodeURIComponent(key)}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) {
        setPersonas((prev) => prev.filter((p) => p.key !== key))
      } else {
        const data = await res.json().catch(() => ({}))
        setPStatus({ text: data.error || 'Failed to delete persona.', type: 'error' })
      }
    } catch {
      setPStatus({ text: 'Network error while deleting persona.', type: 'error' })
    }
  }

  const handleScrapeUrl = async (e) => {
    e.preventDefault()
    const url = scrapeUrlInput.trim()
    if (!url) return
    setScraping(true)
    setScrapeStatus({ text: 'Scraping website content...', type: '' })
    try {
      const res = await fetch('/api/scrape-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setScrapeStatus({ text: data.message || 'Website content trained successfully!', type: 'success' })
        setScrapeUrlInput('')
        loadChats()
      } else {
        setScrapeStatus({ text: data.error || 'Failed to scrape URL.', type: 'error' })
      }
    } catch {
      setScrapeStatus({ text: 'Network error while scraping URL.', type: 'error' })
    }
    setScraping(false)
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
          AI Persona & Knowledge Base Studio
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Train Dhruv, Devil, & Annu on your chat history and documentation for accurate AI responses
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Upload / Scrape Panel */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--primary-dim)' }}
              >
                <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
              </div>
              <div>
                <CardTitle>Train Knowledge Base</CardTitle>
                <CardDescription>Upload chat exports or scrape web documentation</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="upload">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="upload" className="flex-1 gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> File Upload
                </TabsTrigger>
                <TabsTrigger value="scrape" className="flex-1 gap-1.5">
                  <Globe className="w-3.5 h-3.5" /> Scrape Website
                </TabsTrigger>
              </TabsList>

              {/* Upload Tab */}
              <TabsContent value="upload">
                <form onSubmit={handleUploadSubmit} className="flex flex-col gap-4">
                  <div
                    className="border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer flex flex-col items-center gap-2"
                    style={{
                      borderColor: 'var(--border-default)',
                      background: 'var(--bg-surface)',
                    }}
                    onClick={() => document.getElementById('chat-file-input')?.click()}
                  >
                    <Upload className="w-6 h-6 text-[var(--text-muted)]" />
                    <div>
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Click to choose .txt or .pdf export file
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Export WhatsApp chat (without media) or upload PDF/text guides
                      </p>
                    </div>
                    <input
                      id="chat-file-input"
                      type="file"
                      name="chat"
                      accept=".txt,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setSelectedFile(file)
                          const label = document.getElementById('selected-file-label')
                          if (label) label.innerText = `Selected: ${file.name}`
                        }
                      }}
                    />
                    <span id="selected-file-label" className="text-[11px] font-mono text-[var(--primary-light)] font-medium"></span>
                  </div>

                  <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>
                    <input type="checkbox" name="asClosest" checked={asClosest} onChange={(e) => setAsClosest(e.target.checked)} className="rounded accent-[var(--primary)]" />
                    <span>Train as Closest Person context (<code className="text-[10px] text-[var(--primary-light)]">closest-person.txt</code>)</span>
                  </label>

                  {uploadStatus?.text && (
                    <div
                      className={`flex items-center gap-2 p-2.5 rounded-xl text-xs ${
                        uploadStatus.type === 'error'
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {uploadStatus.type === 'error' ? (
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{uploadStatus.text}</span>
                    </div>
                  )}

                  <Button type="submit" disabled={uploading || !selectedFile} className="w-full gap-2">
                    {uploading ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Training Model...</>
                    ) : (
                      <><Upload className="w-3.5 h-3.5" /> Upload & Train</>
                    )}
                  </Button>
                  {!selectedFile && (
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Choose a file above first — the button activates once a file is selected.</p>
                  )}
                </form>
              </TabsContent>

              {/* Scrape Tab */}
              <TabsContent value="scrape">
                <form onSubmit={handleScrapeUrl} className="flex flex-col gap-4">
                  <div>
                    <label className="text-[11px] font-semibold mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                      Website URL
                    </label>
                    <input
                      type="url"
                      placeholder="https://example.com/faq"
                      value={scrapeUrlInput}
                      onChange={(e) => setScrapeUrlInput(e.target.value)}
                      className="w-full h-9 rounded-xl border px-3 text-xs outline-none transition-all duration-150"
                      style={{
                        background: 'var(--input-bg)',
                        borderColor: 'var(--border-default)',
                        color: 'var(--text-primary)',
                      }}
                      required
                    />
                  </div>

                  {scrapeStatus?.text && (
                    <div
                      className={`flex items-center gap-2 p-2.5 rounded-xl text-xs ${
                        scrapeStatus.type === 'error'
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {scrapeStatus.type === 'error' ? (
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{scrapeStatus.text}</span>
                    </div>
                  )}

                  <Button type="submit" disabled={scraping || !scrapeUrlInput.trim()} className="w-full gap-2">
                    {scraping ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scraping & Extracting...</>
                    ) : (
                      <><Globe className="w-3.5 h-3.5" /> Scrape Website Content</>
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Existing Files Panel */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(37,211,102,0.1)' }}
                >
                  <Bot className="w-3.5 h-3.5" style={{ color: 'var(--accent-green)' }} />
                </div>
                <div>
                  <CardTitle>Active Reference Documents</CardTitle>
                  <CardDescription>Knowledge base context used for persona generation</CardDescription>
                </div>
              </div>
              <Badge variant="secondary">{chats.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-[320px]">
              {chats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--text-muted)]">
                  <FileText className="w-8 h-8 opacity-30" />
                  <p className="text-xs">No reference context files uploaded yet.</p>
                </div>
              ) : (
                <div className="p-3 flex flex-col gap-2">
                  <AnimatePresence>
                    {chats.map((chat, i) => (
                      <motion.div
                        key={chat.filename || i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-center justify-between p-3 rounded-xl transition-colors"
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-default)',
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: 'var(--primary-dim)' }}
                          >
                            <FileText className="w-4 h-4 text-[var(--primary-light)]" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                {chat.filename}
                              </span>
                              {chat.isClosest && (
                                <Badge variant="default" className="text-[9px] px-1.5 py-0">
                                  Closest Person
                                </Badge>
                              )}
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                              {(chat.docType || chat.type)?.toUpperCase() || 'TXT'} • {chat.size ? `${(chat.size / 1024).toFixed(1)} KB` : 'Trained'}
                            </p>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => deleteChat(chat.filename, e)}
                          className="text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 h-7 w-7"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Custom Personas — create personas here, then assign one to any
          contact from the Contacts tab mode selector. */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary-dim)' }}>
                <Bot className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
              </div>
              <div>
                <CardTitle>Custom Personas</CardTitle>
                <CardDescription>Create AI personas with their own system prompt, then assign them per-contact</CardDescription>
              </div>
            </div>
            <Badge variant="secondary">{personas.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <form onSubmit={handleSavePersona} className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  placeholder="Persona name (e.g. Sales Closer)"
                  value={pForm.name}
                  onChange={(e) => setPForm({ ...pForm, name: e.target.value })}
                  className="flex-1 h-9 rounded-xl border px-3 text-xs outline-none"
                  style={{ background: 'var(--input-bg)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                  required
                />
                <input
                  aria-label="Emoji"
                  value={pForm.emoji}
                  onChange={(e) => setPForm({ ...pForm, emoji: e.target.value })}
                  className="w-14 h-9 rounded-xl border px-2 text-center text-sm outline-none"
                  style={{ background: 'var(--input-bg)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                  maxLength={4}
                />
              </div>
              <input
                placeholder="Short description (optional)"
                value={pForm.description}
                onChange={(e) => setPForm({ ...pForm, description: e.target.value })}
                className="h-9 rounded-xl border px-3 text-xs outline-none"
                style={{ background: 'var(--input-bg)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
              />
              <textarea
                placeholder="System prompt — who is this persona, how does it talk, what must it never do?"
                value={pForm.systemPrompt}
                onChange={(e) => setPForm({ ...pForm, systemPrompt: e.target.value })}
                rows={5}
                className="rounded-xl border px-3 py-2 text-xs outline-none resize-y"
                style={{ background: 'var(--input-bg)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                required
              />
              <label className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span className="shrink-0">Creativity (temperature): {Number(pForm.temperature).toFixed(2)}</span>
                <input
                  type="range" min="0" max="1.5" step="0.05"
                  value={pForm.temperature}
                  onChange={(e) => setPForm({ ...pForm, temperature: e.target.value })}
                  className="flex-1 accent-[var(--primary)]"
                />
              </label>
              {pStatus.text && (
                <div className={`flex items-center gap-2 p-2.5 rounded-xl text-xs ${pStatus.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                  {pStatus.type === 'error' ? <AlertCircle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                  <span>{pStatus.text}</span>
                </div>
              )}
              <Button type="submit" disabled={savingPersona} className="w-full gap-2">
                {savingPersona ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> : <><Sparkles className="w-3.5 h-3.5" /> Save Persona</>}
              </Button>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Personas are private to your account. The persona key is generated from its name.</p>
            </form>

            <div className="flex flex-col gap-2">
              {personas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-[var(--text-muted)]">
                  <Bot className="w-7 h-7 opacity-30" />
                  <p className="text-xs">No custom personas yet. Built-in Devil / Dhruv / Annu are always available.</p>
                </div>
              ) : personas.map((p) => (
                <div key={p.key} className="flex items-start justify-between gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{p.emoji || '🎭'} {p.name} <span className="font-mono text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>({p.key})</span></p>
                    {p.description && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{p.description}</p>}
                    <p className="text-[10px] mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{p.systemPrompt}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDeletePersona(p.key)} className="text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 h-7 w-7 shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
