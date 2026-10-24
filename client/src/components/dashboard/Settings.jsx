import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Trash2, RefreshCw, Users, MessageCircle, Zap, Database,
  ShieldAlert, Key, CheckCircle2, AlertCircle, Mic, Volume2,
  Upload, Music, RotateCcw, Loader2, Globe, Send, Sparkles,
  Ban, UserCheck, UserX, QrCode, Wifi, WifiOff, Smartphone, LogOut,
  Mail, Save
} from 'lucide-react'
import { formatSafeDateTime } from '@/lib/utils'

export default function Settings({
  setActiveTab,
  currentUser = { username: 'admin', role: 'admin', isAdmin: true },
  analytics = { users: [] },
  fetchAnalytics,
  deleteAllContacts = () => {},
  clearAllHistory = () => {},
  config = {},
  showApiKeyForm,
  setShowApiKeyForm,
  apiKeyInput = '',
  setApiKeyInput,
  saveApiKey = () => {},
  clearApiKey = () => {},
  ready = false,
  qrUrl = null,
  onReconnect,
}) {
  const [waResetting, setWaResetting] = useState(false)
  const [waAlert, setWaAlert] = useState('')

  const handleManualWaReconnect = async () => {
    setWaResetting(true)
    setWaAlert('')
    try {
      if (onReconnect) await onReconnect()
      setWaAlert('WhatsApp gateway reset command sent. Generating fresh QR...')
    } catch {
      setWaAlert('Failed to reset WhatsApp gateway')
    } finally {
      setTimeout(() => setWaResetting(false), 3000)
      setTimeout(() => setWaAlert(''), 5000)
    }
  }

  const handleManualWaLogout = async () => {
    if (!window.confirm('Are you sure you want to disconnect & unlink your WhatsApp device from the server?')) return
    setWaResetting(true)
    setWaAlert('')
    try {
      const res = await fetch('/api/whatsapp/logout', { method: 'POST', credentials: 'include' })
      const data = await res.json()
      if (data.ok) {
        setWaAlert('WhatsApp device unlinked successfully. A fresh QR code will generate in a few seconds.')
        if (onReconnect) onReconnect()
      } else {
        setWaAlert(data.error || 'Failed to logout device')
      }
    } catch {
      setWaAlert('Network error during WhatsApp device logout')
    } finally {
      setTimeout(() => setWaResetting(false), 3000)
      setTimeout(() => setWaAlert(''), 6000)
    }
  }
  const [defaultMessage, setDefaultMessage] = useState('')
  const [defaultsLoaded, setDefaultsLoaded] = useState(false)
  const [savingMsg, setSavingMsg] = useState(false)
  const [msgSavedAlert, setMsgSavedAlert] = useState(false)

  const [audioInfo, setAudioInfo] = useState({ hasCustomAudio: false, audioFilename: 'default.mp3' })
  const [selectedAudioFile, setSelectedAudioFile] = useState(null)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [audioVersion, setAudioVersion] = useState(Date.now())
  const [audioMsgAlert, setAudioMsgAlert] = useState('')
  const audioInputRef = useRef(null)

  // Phase 1: AI disclosure (opt-in) + alerts list
  const [disclosureEnabled, setDisclosureEnabled] = useState(false)
  const [savingDisclosure, setSavingDisclosure] = useState(false)
  const [disclosureAlert, setDisclosureAlert] = useState('')
  const [alertsList, setAlertsList] = useState([])

  const fetchDisclosure = async () => {
    try {
      const res = await fetch('/api/settings/disclosure', { credentials: 'include' })
      const data = await res.json()
      if (data.ok) setDisclosureEnabled(!!data.enabled)
    } catch {}
  }

  const handleSaveDisclosure = async () => {
    setSavingDisclosure(true)
    setDisclosureAlert('')
    try {
      const res = await fetch('/api/settings/disclosure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: disclosureEnabled }),
        credentials: 'include',
      })
      const data = await res.json()
      if (data.ok) {
        setDisclosureAlert('AI disclosure setting saved.')
        setTimeout(() => setDisclosureAlert(''), 4000)
      }
    } catch {
      setDisclosureAlert('Failed to save. Try again.')
    } finally {
      setSavingDisclosure(false)
    }
  }

  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/alerts', { credentials: 'include' })
      const data = await res.json()
      if (data.ok) setAlertsList(data.alerts || [])
    } catch {}
  }

  // Phase 2: agent tools — UPI ID (the only payee for payment links),
  // free Edge voice per persona, and the owner's reminders.
  const [upiId, setUpiId] = useState('')
  const [savingUpi, setSavingUpi] = useState(false)
  const [upiAlert, setUpiAlert] = useState('')
  const [voiceOptions, setVoiceOptions] = useState([])
  const [personaVoices, setPersonaVoices] = useState({})
  const [savingVoices, setSavingVoices] = useState(false)
  const [voicesAlert, setVoicesAlert] = useState('')
  const [remindersList, setRemindersList] = useState([])

  const fetchAgentSettings = async () => {
    try {
      const upiRes = await fetch('/api/settings/upi', { credentials: 'include' })
      const upiData = await upiRes.json()
      if (upiData.ok) setUpiId(upiData.upiId || '')
    } catch {}
    try {
      const vRes = await fetch('/api/settings/voices', { credentials: 'include' })
      const vData = await vRes.json()
      if (vData.ok) {
        setPersonaVoices(vData.voices || {})
        setVoiceOptions(vData.options || [])
      }
    } catch {}
    try {
      const rRes = await fetch('/api/reminders', { credentials: 'include' })
      const rData = await rRes.json()
      if (rData.ok) setRemindersList(rData.reminders || [])
    } catch {}
  }

  const handleSaveUpi = async () => {
    setSavingUpi(true)
    setUpiAlert('')
    try {
      const res = await fetch('/api/settings/upi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upiId: upiId.trim() }),
        credentials: 'include',
      })
      const data = await res.json()
      setUpiAlert(data.ok ? 'UPI ID saved.' : (data.error || 'Failed to save.'))
      setTimeout(() => setUpiAlert(''), 4000)
    } catch {
      setUpiAlert('Failed to save. Try again.')
    } finally {
      setSavingUpi(false)
    }
  }

  const handleSaveVoices = async () => {
    setSavingVoices(true)
    setVoicesAlert('')
    try {
      const res = await fetch('/api/settings/voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voices: personaVoices }),
        credentials: 'include',
      })
      const data = await res.json()
      setVoicesAlert(data.ok ? 'Voices saved.' : 'Failed to save.')
      setTimeout(() => setVoicesAlert(''), 4000)
    } catch {
      setVoicesAlert('Failed to save. Try again.')
    } finally {
      setSavingVoices(false)
    }
  }

  const handleDeleteReminder = async (id) => {
    try {
      await fetch(`/api/reminders/${id}`, { method: 'DELETE', credentials: 'include' })
      fetchAgentSettings()
    } catch {}
  }

  const handleMarkAlertRead = async (id) => {
    try {
      await fetch(`/api/alerts/${id}/read`, { method: 'POST', credentials: 'include' })
      fetchAlerts()
    } catch {}
  }

  const [webhookUrl, setWebhookUrl] = useState('')
  const [savingWebhook, setSavingWebhook] = useState(false)
  const [testingWebhook, setTestingWebhook] = useState(false)
  const [webhookAlert, setWebhookAlert] = useState('')

  const [mailCfg, setMailCfg] = useState({ host: 's13.serv00.com', port: 587, user: '', pass: '', from: '' })
  const [mailStatus, setMailStatus] = useState({ configured: false })
  const [mailAlert, setMailAlert] = useState('')
  const [savingMail, setSavingMail] = useState(false)

  const fetchMailConfig = async () => {
    try {
      const res = await fetch('/api/admin/mail-config', { credentials: 'include' })
      const data = await res.json()
      if (data.ok && data.config) {
        setMailStatus(data.config)
        if (data.config.configured) {
          setMailCfg((prev) => ({ ...prev, host: data.config.host || prev.host, port: data.config.port || 587, user: data.config.user || '', from: data.config.from || '' }))
        }
      }
    } catch {}
  }

  const handleSaveMailConfig = async () => {
    setSavingMail(true)
    setMailAlert('')
    try {
      const res = await fetch('/api/admin/mail-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(mailCfg),
      })
      const data = await res.json()
      if (data.ok) {
        setMailAlert('Mail settings saved.')
        setMailCfg((prev) => ({ ...prev, pass: '' }))
        fetchMailConfig()
      } else {
        setMailAlert(data.error || 'Failed to save mail settings')
      }
    } catch {
      setMailAlert('Network error while saving mail settings')
    }
    setSavingMail(false)
  }

  const handleTestMail = async () => {
    setMailAlert('')
    try {
      const res = await fetch('/api/admin/mail-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...mailCfg }),
      })
      const data = await res.json()
      setMailAlert(data.ok ? data.message : (data.error || 'Test failed'))
    } catch {
      setMailAlert('Network error during test send')
    }
  }

  // ── Multi-provider AI engine state ──
  const [providerReg, setProviderReg] = useState([])
  const [providerConfigs, setProviderConfigs] = useState([])
  const [provSel, setProvSel] = useState('gemini')
  const [provModel, setProvModel] = useState('')
  const [provKey, setProvKey] = useState('')
  const [provAlert, setProvAlert] = useState('')
  const [provBusy, setProvBusy] = useState(false)

  const fetchProviders = async () => {
    try {
      const res = await fetch('/api/ai-providers', { credentials: 'include' })
      const data = await res.json()
      if (data.ok) {
        setProviderReg(data.providers || [])
        setProviderConfigs(data.configs || [])
        const first = (data.providers || [])[0]
        if (first) {
          const saved = (data.configs || []).find((c) => c.providerId === first.id)
          setProvModel(saved?.model || first.models?.[0]?.id || '')
        }
      }
    } catch {}
  }

  const pickProvider = (id) => {
    setProvSel(id)
    setProvKey('')
    setProvAlert('')
    const reg = providerReg.find((x) => x.id === id)
    const saved = providerConfigs.find((c) => c.providerId === id)
    setProvModel(saved?.model || reg?.models?.[0]?.id || '')
  }

  const handleTestProvider = async () => {
    setProvBusy(true)
    setProvAlert('')
    try {
      const res = await fetch('/api/ai-providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ providerId: provSel, apiKey: provKey, model: provModel }),
      })
      const data = await res.json()
      setProvAlert(data.ok ? data.message : (data.error || 'Key test failed'))
    } catch { setProvAlert('Network error during key test') }
    setProvBusy(false)
  }

  const handleSaveProvider = async () => {
    setProvBusy(true)
    setProvAlert('')
    try {
      const res = await fetch('/api/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ providerId: provSel, apiKey: provKey, model: provModel }),
      })
      const data = await res.json()
      if (data.ok) {
        setProvAlert(data.message + ' — replies will use your providers first (auto-fallback is on).')
        setProvKey('')
        fetchProviders()
      } else setProvAlert(data.error || 'Failed to save provider')
    } catch { setProvAlert('Network error while saving provider') }
    setProvBusy(false)
  }

  const handleSetActiveProvider = async (providerId) => {
    try {
      await fetch('/api/ai-providers/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ providerId }),
      })
      fetchProviders()
    } catch {}
  }

  const handleDeleteProvider = async (providerId) => {
    try {
      await fetch(`/api/ai-providers/${providerId}`, { method: 'DELETE', credentials: 'include' })
      fetchProviders()
    } catch {}
  }

  const [geminiKeyInput, setGeminiKeyInput] = useState('')
  const [geminiStatus, setGeminiStatus] = useState({ hasKey: false, maskedKey: null })
  const [savingGemini, setSavingGemini] = useState(false)
  const [geminiAlert, setGeminiAlert] = useState('')

  const [userActionAlert, setUserActionAlert] = useState('')
  const [actionLoading, setActionLoading] = useState(null)

  const handleToggleUserBan = async (username, currentDisabled) => {
    setActionLoading(username)
    setUserActionAlert('')
    try {
      const res = await fetch('/api/admin/users/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, disabled: !currentDisabled }),
        credentials: 'include',
      })
      const data = await res.json()
      if (data.ok) {
        setUserActionAlert(`User "${username}" ${!currentDisabled ? 'banned / disabled' : 'unbanned / activated'} successfully ✓`)
        if (typeof fetchAnalytics === 'function') fetchAnalytics()
      } else {
        setUserActionAlert(data.error || 'Failed to update user status')
      }
    } catch {
      setUserActionAlert('Failed to update user status')
    } finally {
      setActionLoading(null)
      setTimeout(() => setUserActionAlert(''), 4000)
    }
  }

  const handleDeleteUser = async (username) => {
    if (!window.confirm(`Are you sure you want to permanently delete user account "${username}"?`)) return
    setActionLoading(username)
    setUserActionAlert('')
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json()
      if (data.ok) {
        setUserActionAlert(`User "${username}" permanently deleted ✓`)
        if (typeof fetchAnalytics === 'function') fetchAnalytics()
      } else {
        setUserActionAlert(data.error || 'Failed to delete user')
      }
    } catch {
      setUserActionAlert('Failed to delete user')
    } finally {
      setActionLoading(null)
      setTimeout(() => setUserActionAlert(''), 4000)
    }
  }

  useEffect(() => {
    if (typeof fetchAnalytics === 'function') fetchAnalytics()
    fetchDefaults()
    fetchDisclosure()
    fetchAlerts()
    fetchAgentSettings()
    fetchWebhooks()
    fetchGeminiStatus()
    if (currentUser?.isAdmin) fetchMailConfig()
    fetchProviders()
  }, [])

  const fetchGeminiStatus = async () => {
    try {
      const res = await fetch('/api/features/gemini/status')
      const data = await res.json()
      if (data.ok) {
        setGeminiStatus({ hasKey: data.hasKey, maskedKey: data.maskedKey })
      }
    } catch {}
  }

  const handleSaveGeminiKey = async () => {
    if (!geminiKeyInput.trim()) return
    setSavingGemini(true)
    setGeminiAlert('')
    try {
      const res = await fetch('/api/features/gemini/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: geminiKeyInput.trim() }),
      })
      const data = await res.json()
      if (data.ok) {
        setGeminiAlert('Google Gemini API Key activated successfully! ✓')
        setGeminiKeyInput('')
        fetchGeminiStatus()
        setTimeout(() => setGeminiAlert(''), 4000)
      }
    } catch {
      setGeminiAlert('Failed to save Gemini key')
    } finally {
      setSavingGemini(false)
    }
  }

  const handleClearGeminiKey = async () => {
    try {
      await fetch('/api/features/gemini/key', { method: 'DELETE' })
      setGeminiStatus({ hasKey: false, maskedKey: null })
      setGeminiAlert('Gemini key removed')
      setTimeout(() => setGeminiAlert(''), 3000)
    } catch {}
  }

  const fetchWebhooks = async () => {
    try {
      const res = await fetch('/api/features/webhooks')
      const data = await res.json()
      if (data.ok && data.config) {
        setWebhookUrl(data.config.url || '')
      }
    } catch {}
  }

  const handleSaveWebhook = async () => {
    setSavingWebhook(true)
    setWebhookAlert('')
    try {
      const res = await fetch('/api/features/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl.trim(), enabled: !!webhookUrl.trim() }),
      })
      const data = await res.json()
      if (data.ok) {
        setWebhookAlert('Webhook settings saved successfully ✓')
        setTimeout(() => setWebhookAlert(''), 4000)
      }
    } catch {
      setWebhookAlert('Webhook saved locally')
    } finally {
      setSavingWebhook(false)
    }
  }

  const handleTestWebhook = async () => {
    setTestingWebhook(true)
    setWebhookAlert('')
    try {
      const res = await fetch('/api/features/webhooks/test', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setWebhookAlert('Test ping dispatched! Check your webhook receiver.')
      }
    } catch {
      setWebhookAlert('Test ping triggered')
    } finally {
      setTestingWebhook(false)
      setTimeout(() => setWebhookAlert(''), 5000)
    }
  }

  const fetchDefaults = async () => {
    try {
      const res = await fetch('/api/settings/defaults', { credentials: 'include' })
      const data = await res.json()
      if (data.ok) {
        setDefaultMessage(data.defaultMessage || '')
        setAudioInfo({
          hasCustomAudio: !!data.hasCustomAudio,
          audioFilename: data.audioFilename || 'default.mp3',
          audioUpdatedAt: data.audioUpdatedAt || null,
        })
      }
    } catch (err) {
      console.error('Failed to fetch default settings:', err)
    } finally {
      setDefaultsLoaded(true)
    }
  }

  const handleSaveDefaultMessage = async () => {
    if (!defaultMessage.trim()) return
    setSavingMsg(true)
    setMsgSavedAlert(false)
    try {
      const res = await fetch('/api/settings/defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultMessage: defaultMessage.trim() }),
        credentials: 'include',
      })
      const data = await res.json()
      if (data.ok) {
        setMsgSavedAlert(true)
        setTimeout(() => setMsgSavedAlert(false), 4000)
      }
    } catch (err) {
      console.error('Failed to save default message:', err)
    } finally {
      setSavingMsg(false)
    }
  }

  const handleUploadAudio = async () => {
    if (!selectedAudioFile) return
    setUploadingAudio(true)
    setAudioMsgAlert('')
    const formData = new FormData()
    formData.append('audio', selectedAudioFile)

    try {
      const res = await fetch('/api/settings/default-audio', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      const data = await res.json()
      if (data.ok) {
        setAudioInfo({
          hasCustomAudio: true,
          audioFilename: data.filename || selectedAudioFile.name,
        })
        setSelectedAudioFile(null)
        if (audioInputRef.current) audioInputRef.current.value = ''
        setAudioVersion(Date.now())
        setAudioMsgAlert('Custom voice note uploaded successfully!')
        setTimeout(() => setAudioMsgAlert(''), 4000)
      } else {
        setAudioMsgAlert(data.error || 'Failed to upload audio')
      }
    } catch (err) {
      setAudioMsgAlert('Network error during audio upload')
    } finally {
      setUploadingAudio(false)
    }
  }

  const handleResetAudio = async () => {
    try {
      const res = await fetch('/api/settings/default-audio', {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json()
      if (data.ok) {
        setAudioInfo({ hasCustomAudio: false, audioFilename: 'default.mp3' })
        setAudioVersion(Date.now())
        setAudioMsgAlert('Reset to factory default audio!')
        setTimeout(() => setAudioMsgAlert(''), 4000)
      }
    } catch (err) {
      console.error('Reset audio error:', err)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header ── */}
      <div>
        <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
          Settings & Admin
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          API configuration, WhatsApp device connection, default away responses, voice notes, and system maintenance
        </p>
      </div>

      {/* ── WhatsApp Gateway & Device Session Manager Card ── */}
      <Card className="border border-white/10 bg-[#080808]/95 shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                {ready ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-red-400" />}
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-white">WhatsApp Gateway & Device Session</CardTitle>
                <CardDescription className="text-[11px] text-zinc-400">
                  Manage your active WhatsApp connection, linked phone device, and QR authentication state
                </CardDescription>
              </div>
            </div>
            <Badge variant={ready ? 'success' : qrUrl ? 'warning' : 'destructive'} className="text-[10px]">
              {ready ? '● Gateway Active & Online' : qrUrl ? '⚡ Scan QR Code' : '✕ Gateway Disconnected'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5 flex flex-col gap-4">
          {waAlert && (
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs flex items-center gap-2">
              <Sparkles size={14} className="shrink-0" />
              <span>{waAlert}</span>
            </div>
          )}

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-black/40 border border-white/5">
            <div className="flex items-center gap-3.5">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${ready ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                <Smartphone size={20} />
              </div>
              <div>
                <p className="text-xs font-bold text-white">
                  {ready ? 'Phone Device Linked & Synchronized' : qrUrl ? 'Awaiting QR Code Authentication' : 'No Phone Device Linked'}
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {ready
                    ? 'Incoming messages are automatically answered with AI auto-replies and neural voice notes.'
                    : qrUrl
                    ? 'Scan the QR code below on your phone: WhatsApp → Linked Devices → Link a Device.'
                    : 'WhatsApp gateway is offline. Click Initialize / Reset to generate a brand new QR login.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
              <Button
                size="sm"
                variant="outline"
                onClick={handleManualWaReconnect}
                disabled={waResetting}
                className="text-xs gap-1.5 bg-black/40 border-white/10 hover:bg-purple-600/20 hover:border-purple-500/40 text-zinc-200"
              >
                <RefreshCw size={13} className={waResetting ? "animate-spin" : "text-purple-400"} />
                {waResetting ? 'Resetting...' : 'Reset & New QR'}
              </Button>

              {ready && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleManualWaLogout}
                  disabled={waResetting}
                  className="text-xs gap-1.5 bg-red-500/10 border-red-500/20 hover:bg-red-500/20 text-red-300"
                >
                  <LogOut size={13} />
                  Unlink Device
                </Button>
              )}
            </div>
          </div>

          {/* If not connected and QR is present, render QR preview in settings */}
          {!ready && qrUrl && (
            <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl bg-purple-950/20 border border-purple-500/20">
              <div className="p-2.5 rounded-xl bg-white shrink-0 shadow-lg">
                <img src={qrUrl} alt="WhatsApp QR" className="w-40 h-40 block rounded-md" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>Scan to Connect WhatsApp</span>
                </div>
                <ol className="text-xs text-zinc-300 space-y-1 list-decimal list-inside font-sans">
                  <li>Open <strong>WhatsApp</strong> on your phone</li>
                  <li>Tap <strong>Settings / Three Dots</strong> → <strong>Linked Devices</strong></li>
                  <li>Tap <strong>Link a Device</strong> and point your camera at this QR code</li>
                </ol>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Default Message & Voice Note Card (per-user: your own away text + audio) ── */}
      <Card className="border border-white/10 bg-[#080808]/95 shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Mic className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-white">Away Message & Voice Note</CardTitle>
                <CardDescription className="text-[11px] text-zinc-400">
                  Your own auto-reply text and voice note, sent to your contacts when your Don Away mode is on
                </CardDescription>
              </div>
            </div>
            <Badge variant={audioInfo.hasCustomAudio ? 'success' : 'secondary'} className="text-[10px]">
              {audioInfo.hasCustomAudio ? 'Custom Voice Active' : 'Factory Audio'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5 flex flex-col gap-5">
          {/* Default Text Message Editor */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-purple-400" />
                Default Fallback / Away Message
              </label>
              <span className="text-[10px] font-mono text-zinc-500">
                {defaultMessage.length} characters
              </span>
            </div>
            <textarea
              rows={3}
              value={defaultMessage}
              onChange={(e) => setDefaultMessage(e.target.value)}
              placeholder="Enter default message..."
              className="w-full rounded-xl border p-3 text-xs outline-none transition-all duration-150 resize-none font-sans"
              style={{
                background: 'var(--input-bg)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--primary)' }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border-default)' }}
            />
            <div className="flex items-center justify-between">
              {msgSavedAlert ? (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Default message saved successfully!
                </span>
              ) : (
                <span className="text-[10px] text-zinc-500">Sent automatically to contacts before AI opt-in</span>
              )}
              <Button
                onClick={handleSaveDefaultMessage}
                size="sm"
                disabled={savingMsg || !defaultMessage.trim()}
                className="gap-1.5"
              >
                {savingMsg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save Default Message
              </Button>
            </div>
          </div>

          <div className="h-px bg-white/5" />

          {/* Default Audio Note Player & Upload */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                Default Voice Note Audio (.mp3 / .ogg / .opus / .m4a)
              </label>
              <span className="text-[10px] font-mono text-zinc-400">
                File: {audioInfo.audioFilename}
              </span>
            </div>

            {/* Audio Live Preview Player */}
            <div className="flex flex-col sm:flex-row items-center gap-3 p-3 rounded-xl bg-black/60 border border-white/10">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Music className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1 w-full">
                <audio
                  key={audioVersion}
                  controls
                  className="w-full h-8"
                  src={`/api/settings/default-audio?v=${audioVersion}`}
                >
                  Your browser does not support audio playback.
                </audio>
              </div>
              {audioInfo.hasCustomAudio && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetAudio}
                  className="text-xs text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 gap-1 h-8 shrink-0 border border-white/5"
                  title="Reset to factory audio"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </Button>
              )}
            </div>

            {/* Upload New Custom Audio */}
            <div className="flex flex-col sm:flex-row items-center gap-2 mt-1">
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,.mp3,.ogg,.opus,.wav,.m4a"
                onChange={(e) => setSelectedAudioFile(e.target.files?.[0] || null)}
                className="text-xs text-zinc-400 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer w-full"
              />
              <Button
                onClick={handleUploadAudio}
                size="sm"
                disabled={!selectedAudioFile || uploadingAudio}
                className="gap-1.5 shrink-0 w-full sm:w-auto"
              >
                {uploadingAudio ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</>
                ) : (
                  <><Upload className="w-3.5 h-3.5" /> Upload Voice Note</>
                )}
              </Button>
            </div>

            {audioMsgAlert && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {audioMsgAlert}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Phase 1: AI Disclosure & Alerts ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <ShieldAlert className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-white">AI Disclosure &amp; Alerts</CardTitle>
              <CardDescription className="text-[11px] text-zinc-400">
                Tell contacts they are talking to an AI (off by default), and see disconnect/backup alerts
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-200 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={disclosureEnabled}
                onChange={(e) => setDisclosureEnabled(e.target.checked)}
                className="w-4 h-4 accent-purple-600"
              />
              Show AI disclosure on first reply to each contact
            </label>
            <p className="text-[11px] text-zinc-500">
              When on, the first AI reply to each contact starts with a short note that they are talking to Devil AI, not a real person. It is sent once per contact, never repeated.
            </p>
            <div className="flex items-center justify-between">
              {disclosureAlert ? (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {disclosureAlert}
                </span>
              ) : (<span />)}
              <Button onClick={handleSaveDisclosure} size="sm" disabled={savingDisclosure} className="gap-1.5">
                {savingDisclosure ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save Disclosure Setting
              </Button>
            </div>
          </div>

          <div className="h-px bg-white/5" />

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-200">Recent alerts</label>
              <Button variant="ghost" size="sm" onClick={fetchAlerts} className="gap-1 h-7 text-xs text-zinc-400">
                <RefreshCw className="w-3 h-3" /> Refresh
              </Button>
            </div>
            {alertsList.length === 0 ? (
              <p className="text-[11px] text-zinc-500">No alerts yet. WhatsApp disconnects and backup results will appear here.</p>
            ) : (
              alertsList.slice(0, 10).map((a) => (
                <div key={a._id} className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-black/40 border border-white/5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-zinc-200">{a.title}</span>
                    <span className="text-[11px] text-zinc-400">{a.detail}</span>
                    <span className="text-[10px] font-mono text-zinc-500">{a.createdAt ? formatSafeDateTime(a.createdAt) : ''}</span>
                  </div>
                  {!a.read && (
                    <Button variant="ghost" size="sm" onClick={() => handleMarkAlertRead(a._id)} className="h-7 text-[11px] shrink-0">
                      Mark read
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Phase 2: Agent Tools — UPI, Voices, Reminders ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-white">Agent Tools: UPI &amp; Voices</CardTitle>
              <CardDescription className="text-[11px] text-zinc-400">
                Free-only agent actions: your UPI ID is the only payee payment links can ever use
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-200">Your UPI ID (for payment links)</label>
            <div className="flex gap-2">
              <Input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="name@bank"
                className="text-xs"
              />
              <Button onClick={handleSaveUpi} size="sm" disabled={savingUpi} className="gap-1.5 shrink-0">
                {savingUpi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save UPI ID
              </Button>
            </div>
            {upiAlert && <p className="text-[11px] text-emerald-400">{upiAlert}</p>}
            <p className="text-[11px] text-zinc-500">Leave empty to disable payment links. No gateway, no fee — the link opens the payer's own UPI app.</p>
          </div>

          <div className="h-px bg-white/5" />

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-200">Voice per persona (all free Edge voices)</label>
            {['girl', 'boy', 'devil'].map((mode) => (
              <div key={mode} className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 w-12 capitalize">{mode}</span>
                <select
                  value={personaVoices[mode] || ''}
                  onChange={(e) => setPersonaVoices((prev) => ({ ...prev, [mode]: e.target.value }))}
                  className="flex-1 rounded-xl border p-2 text-xs outline-none"
                  style={{ background: 'var(--input-bg)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                >
                  <option value="">Default voice</option>
                  {voiceOptions.map((v) => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </div>
            ))}
            <div className="flex items-center justify-between">
              {voicesAlert ? (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {voicesAlert}
                </span>
              ) : (<span />)}
              <Button onClick={handleSaveVoices} size="sm" disabled={savingVoices} className="gap-1.5">
                {savingVoices ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save Voices
              </Button>
            </div>
          </div>

          <div className="h-px bg-white/5" />

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-200">Reminders</label>
              <Button variant="ghost" size="sm" onClick={fetchAgentSettings} className="gap-1 h-7 text-xs text-zinc-400">
                <RefreshCw className="w-3 h-3" /> Refresh
              </Button>
            </div>
            {remindersList.length === 0 ? (
              <p className="text-[11px] text-zinc-500">No reminders. A contact can ask the bot to remind them, e.g. "kal subah yaad dila dena".</p>
            ) : (
              remindersList.slice(0, 20).map((r) => (
                <div key={r._id} className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-black/40 border border-white/5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-zinc-200">{r.text}</span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {r.sent ? 'Sent' : `Due ${r.dueAt ? formatSafeDateTime(r.dueAt) : ''}`}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteReminder(r._id)} className="h-7 text-[11px] shrink-0">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── API Key Card ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--primary-dim)' }}
              >
                <Key className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
              </div>
              <div>
                <CardTitle>OpenRouter API Key</CardTitle>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Required for AI auto-replies
                </p>
              </div>
            </div>
            <Badge variant={config?.hasApiKey ? 'success' : 'destructive'}>
              {config?.hasApiKey ? (
                <><CheckCircle2 className="w-3 h-3 mr-1" />Active</>
              ) : (
                <><AlertCircle className="w-3 h-3 mr-1" />Missing</>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="relative">
              <input
                type="password"
                placeholder="sk-or-v1-…"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full h-9 rounded-xl border px-3 text-xs outline-none transition-all duration-150"
                style={{
                  background: 'var(--input-bg)',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--primary)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border-default)'
                }}
                onKeyDown={(e) => e.key === 'Enter' && saveApiKey()}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveApiKey} size="sm" disabled={!apiKeyInput?.trim()}>
                Save Key
              </Button>
              {config?.hasApiKey && (
                <Button variant="destructive" size="sm" onClick={clearApiKey}>
                  Remove Key
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── AI Providers moved to its own tab ── */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.12)' }}>
              <Zap className="w-3.5 h-3.5" style={{ color: '#22d3ee' }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">AI Providers</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Providers, keys, routing mode aur usage stats ab apne alag tab mein hain.</p>
            </div>
            <Button size="sm" onClick={() => typeof setActiveTab === 'function' && setActiveTab('providers')}>Open AI Providers tab</Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Google Gemini Free Tier Engine Card ── */}
      <Card className="border border-cyan-500/20 bg-[#060a12]/95 shadow-[0_8px_30px_rgba(0,0,0,0.7)]">
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-cyan-500/15 border border-cyan-500/30 text-cyan-400"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-bold text-white">Google Gemini Multimodal AI (100% Free)</CardTitle>
                  <span className="px-2 py-0.2 rounded-full text-[9px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">1,500 RPD Free</span>
                </div>
                <p className="text-[11px] mt-0.5 text-zinc-400">
                  Powers free WhatsApp Voice-to-Text, photo vision, and real-time chat without OpenAI credits.
                </p>
              </div>
            </div>
            <Badge variant={geminiStatus.hasKey ? 'success' : 'secondary'} className="text-[10px]">
              {geminiStatus.hasKey ? (
                <><CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" />Active (Free Tier)</>
              ) : (
                <>Not Configured</>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                <span>Gemini API Key (AIzaSy...)</span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-cyan-400 hover:underline"
                >
                  Get free key on Google AI Studio ↗
                </a>
              </label>
              <input
                type="password"
                placeholder={geminiStatus.maskedKey || "AIzaSy..."}
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                className="w-full h-9 rounded-xl border border-white/10 bg-black/60 px-3 text-xs text-white outline-none focus:border-cyan-500/60 font-mono"
                onKeyDown={(e) => e.key === 'Enter' && handleSaveGeminiKey()}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleSaveGeminiKey}
                size="sm"
                disabled={!geminiKeyInput.trim() || savingGemini}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs h-8 px-4 rounded-xl"
              >
                {savingGemini ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                Save Gemini Key
              </Button>
              {geminiStatus.hasKey && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearGeminiKey}
                  className="text-xs text-zinc-400 hover:text-red-400 hover:bg-red-500/10 h-8"
                >
                  Remove Key
                </Button>
              )}
            </div>
            {geminiAlert && (
              <p className="text-[11px] text-cyan-400 font-mono">{geminiAlert}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Mail Server / OTP Email Settings (Master Admin Only) ── */}
      {currentUser?.isAdmin ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(244,114,182,0.1)' }}>
                <Mail className="w-3.5 h-3.5" style={{ color: '#f472b6' }} />
              </div>
              <div>
                <CardTitle>Mail Server (Registration OTP)</CardTitle>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  New users verify their email with a 6-digit code sent from this mailbox. Use your serv00 mailbox (SMTP: s13.serv00.com, port 587).
                </p>
              </div>
              <Badge variant={mailStatus.configured ? 'success' : 'destructive'} className="text-[10px] ml-auto">
                {mailStatus.configured ? '● Configured' : '✕ Not configured'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="SMTP host" value={mailCfg.host} onChange={(e) => setMailCfg({ ...mailCfg, host: e.target.value })} />
                <Input placeholder="Port (587)" type="number" value={mailCfg.port} onChange={(e) => setMailCfg({ ...mailCfg, port: Number(e.target.value) || 587 })} />
              </div>
              <Input placeholder="Mailbox email (e.g. jiopay-india-com@jiopay-india-com.serv00.net)" value={mailCfg.user} onChange={(e) => setMailCfg({ ...mailCfg, user: e.target.value })} />
              <Input placeholder={mailStatus.configured ? 'Mailbox password (leave blank to keep current)' : 'Mailbox password'} type="password" value={mailCfg.pass} onChange={(e) => setMailCfg({ ...mailCfg, pass: e.target.value })} />
              <Input placeholder="From address (optional, defaults to mailbox)" value={mailCfg.from} onChange={(e) => setMailCfg({ ...mailCfg, from: e.target.value })} />
              {mailAlert && <p className="text-[11px] text-cyan-400 font-mono">{mailAlert}</p>}
              <div className="flex gap-2">
                <Button onClick={handleSaveMailConfig} disabled={savingMail} className="gap-2">
                  {savingMail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Mail Settings
                </Button>
                <Button variant="outline" onClick={handleTestMail} className="gap-2">
                  <Send className="w-3.5 h-3.5" /> Send Test Email
                </Button>
              </div>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>The test email goes to your admin account address on file. If the mailbox password is unknown, reset it in the serv00 panel (Email section) first.</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ── User Accounts Table (Master Admin Only) ── */}
      {currentUser?.isAdmin ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(56,189,248,0.1)' }}
                >
                  <Users className="w-3.5 h-3.5" style={{ color: '#38bdf8' }} />
                </div>
                <div>
                  <CardTitle>User Accounts & Master Control</CardTitle>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Active sessions, multi-tenant permissions, and account ban / delete management
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={fetchAnalytics}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                Refresh
              </Button>
            </div>
            {userActionAlert && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 p-2.5 rounded-lg text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
              >
                {userActionAlert}
              </motion.div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea style={{ maxHeight: 360 }}>
              {(analytics?.users || []).length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                      {['User', 'Role', 'Status', 'API Key', 'Msgs Today', 'API Calls', 'Last Active', 'Actions'].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left font-semibold"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(analytics?.users || []).map((u, i) => (
                      <motion.tr
                        key={u.username || i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="transition-colors hover:bg-white/[0.02]"
                        style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      >
                        <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                          <div className="flex items-center gap-2">
                            <Avatar className="w-6 h-6">
                              <AvatarFallback className="text-[9px]">
                                {u.username?.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className={u.disabled ? 'line-through text-zinc-500' : ''}>{u.username}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                            {u.role || 'user'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={u.disabled ? 'destructive' : 'success'} className="text-[10px]">
                            {u.disabled ? 'Banned' : 'Active'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={(u.userApiKey || u.hasAiProviders) ? 'success' : 'secondary'}>
                            {u.userApiKey ? 'Set' : u.hasAiProviders ? 'Providers' : 'Missing'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                          {u.messagesToday ?? 0}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                          {u.apiCallsToday ?? 0}
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {formatSafeDateTime(u.lastActive)}
                        </td>
                        <td className="px-4 py-3">
                          {u.role === 'admin' ? (
                            <span className="text-[10px] text-zinc-500 font-mono">Protected</span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-7 px-2 text-[11px] ${
                                  u.disabled
                                    ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
                                    : 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                                }`}
                                onClick={() => handleToggleUserBan(u.username, !!u.disabled)}
                                disabled={actionLoading === u.username}
                                title={u.disabled ? 'Unban user' : 'Ban / disable user'}
                              >
                                {actionLoading === u.username ? (
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                ) : u.disabled ? (
                                  <UserCheck className="w-3.5 h-3.5 mr-1" />
                                ) : (
                                  <Ban className="w-3.5 h-3.5 mr-1" />
                                )}
                                {u.disabled ? 'Unban' : 'Ban'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                onClick={() => handleDeleteUser(u.username)}
                                disabled={actionLoading === u.username}
                                title="Permanently delete user"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                                Delete
                              </Button>
                            </div>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div
                  className="flex flex-col items-center justify-center py-10 gap-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Users className="w-8 h-8 opacity-30" />
                  <p className="text-xs">No user accounts yet</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-purple-500/20 bg-purple-950/10 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
                <Users size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Private Multi-Tenant Workspace Active</h4>
                <p className="text-[11px] text-zinc-400">
                  Logged in as <strong className="text-purple-300">@{currentUser?.username}</strong>. All contacts, chat history, and API keys are isolated to your account.
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] text-purple-300 border-purple-500/30 font-mono">
              Role: Member (Isolated)
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* ── Lead Webhooks & External CRM Integrations ── */}
      <Card className="border border-white/10 bg-[#080c14]/90 shadow-[0_8px_30px_rgba(0,0,0,0.7)]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-cyan-500/15 border border-cyan-500/30 text-cyan-400"
              >
                <Globe size={16} />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-white">Outbound Lead Webhooks & CRM Integration</CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  Stream real-time WhatsApp leads and events to Google Sheets, Telegram, Discord, or Make.com
                </CardDescription>
              </div>
            </div>
            <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-xs font-mono">
              Live Dispatcher
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-zinc-300 block mb-1.5">Webhook Target URL (HTTP POST)</label>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://discord.com/api/webhooks/... or https://hooks.zapier.com/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="flex-1 h-9 px-3 text-xs rounded-xl bg-black/60 border border-white/10 text-white placeholder-zinc-500 outline-none focus:border-cyan-500/60 font-mono"
              />
              <Button
                size="sm"
                onClick={handleSaveWebhook}
                disabled={savingWebhook}
                className="h-9 px-4 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-xl gap-1.5"
              >
                {savingWebhook ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Save Webhook
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleTestWebhook}
                disabled={testingWebhook}
                className="h-9 px-3 bg-black/40 border-white/10 hover:bg-white/10 text-zinc-300 text-xs rounded-xl gap-1.5"
              >
                <Send size={12} className="text-cyan-400" />
                {testingWebhook ? 'Testing...' : 'Test Ping'}
              </Button>
            </div>
            {webhookAlert && (
              <p className="text-[11px] text-cyan-400 mt-2 font-mono">{webhookAlert}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-white/5 text-xs text-zinc-400">
            <span className="font-semibold text-zinc-300">Trigger Events:</span>
            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-zinc-300 font-mono text-[10px]">● new_lead</span>
            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-zinc-300 font-mono text-[10px]">● keyword_triggered</span>
            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-zinc-300 font-mono text-[10px]">● spam_flagged</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Danger Zone ── */}
      <Card style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.1)' }}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            </div>
            <div>
              <CardTitle className="text-red-400">Danger Zone</CardTitle>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Irreversible database operations
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="destructive"
              size="sm"
              onClick={deleteAllContacts}
              className="gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete All Contacts & History
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllHistory}
              className="gap-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Clear Chat Logs Only
            </Button>
          </div>
          <p className="text-[10px] mt-3" style={{ color: 'var(--text-muted)' }}>
            These actions permanently delete data from MongoDB and cannot be undone.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
