import { useEffect, useState } from 'react'
import RouterNetwork from './RouterNetwork'

// Providers tab = ONE tab only: the Network Overview, with provider
// key management merged into it. There is no separate "AI Providers"
// view anymore, and no model picker anywhere: tap a provider, paste
// a key, Save — the engine auto-resolves a working model for the key
// (Router 2.1), so saving always sends model '' (Auto).
export default function ProvidersPanel() {
  const [providerReg, setProviderReg] = useState([])
  const [providerConfigs, setProviderConfigs] = useState([])
  const [routingMode, setRoutingMode] = useState('manual')
  const [provSel, setProvSel] = useState('gemini')
  const [provKey, setProvKey] = useState('')
  const [provBusy, setProvBusy] = useState(false)
  const [provAlert, setProvAlert] = useState('')
  const [stats, setStats] = useState(null)

  const fetchProviders = async () => {
    try {
      const res = await fetch('/api/ai-providers', { credentials: 'include' })
      const data = await res.json()
      if (data.ok) {
        setProviderReg(data.providers || [])
        setProviderConfigs(data.configs || [])
        setRoutingMode(data.routingMode || 'manual')
      }
    } catch {}
  }

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/ai-providers/stats', { credentials: 'include' })
      const data = await res.json()
      if (data.ok) setStats(data)
    } catch {}
  }

  useEffect(() => { fetchProviders(); fetchStats() }, [])

  const pickProvider = (id) => { setProvSel(id); setProvKey(''); setProvAlert('') }
  const refreshAll = () => { fetchProviders(); fetchStats() }

  const handleTestProvider = async () => {
    setProvBusy(true); setProvAlert('')
    try {
      const res = await fetch('/api/ai-providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ providerId: provSel, apiKey: provKey, model: '' }),
      })
      const data = await res.json()
      setProvAlert(data.ok ? data.message : (data.error || 'Key test failed'))
      if (data.ok) fetchStats()
    } catch { setProvAlert('Network error during key test') }
    setProvBusy(false)
  }

  const handleSaveProvider = async () => {
    if (!provKey.trim()) { setProvAlert('Paste a key first — or tap a provider that already has one saved.'); return }
    setProvBusy(true); setProvAlert('')
    try {
      const res = await fetch('/api/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ providerId: provSel, apiKey: provKey, model: '' }),
      })
      const data = await res.json()
      if (data.ok) {
        setProvAlert(data.message + ' — model auto-resolved by the engine, keys encrypted.')
        setProvKey('')
        refreshAll()
      } else setProvAlert(data.error || 'Failed to save provider')
    } catch { setProvAlert('Network error while saving provider') }
    setProvBusy(false)
  }

  const handleSetActiveProvider = async (providerId) => {
    try {
      await fetch('/api/ai-providers/active', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ providerId }) })
      refreshAll()
    } catch {}
  }

  const handleDeleteProvider = async (providerId) => {
    try {
      await fetch(`/api/ai-providers/${providerId}`, { method: 'DELETE', credentials: 'include' })
      refreshAll()
    } catch {}
  }

  const handleModeChange = async (mode) => {
    setRoutingMode(mode)
    try {
      await fetch('/api/ai-providers/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ mode }) })
      fetchStats()
    } catch {}
  }

  return (
    <RouterNetwork
      providerReg={providerReg}
      providerConfigs={providerConfigs}
      stats={stats}
      routingMode={routingMode}
      onModeChange={handleModeChange}
      selectedProviderId={provSel}
      onSelectProvider={pickProvider}
      provKey={provKey}
      onProvKeyChange={setProvKey}
      provBusy={provBusy}
      provAlert={provAlert}
      onSaveProvider={handleSaveProvider}
      onTestProvider={handleTestProvider}
      onSetActiveProvider={handleSetActiveProvider}
      onDeleteProvider={handleDeleteProvider}
      onRefresh={refreshAll}
    />
  )
}
