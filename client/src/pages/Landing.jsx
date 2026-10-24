import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ParticlesBackground } from '@/components/ui/particles'

import { BentoSection } from '@/components/landing/3d-bento-section'
import { ComparisonMatrix } from '@/components/landing/3d-comparison-matrix'
import { FAQSection } from '@/components/landing/3d-faq'
import { HeroAquaticCanvas } from '@/components/landing/hero-aquatic-canvas'
import logoImg from '../assets/logo.jpg'

import {
  MessageCircle, Bot, ArrowRight, Eye, EyeOff, UserCheck, Flame, Play
} from 'lucide-react'

export default function Landing({ authenticated, setAuthenticated, onLoginSuccess }) {
  const [showLogin, setShowLogin] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loginUsername, setLoginUsername] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpInput, setOtpInput] = useState('')
  const [otpInfo, setOtpInfo] = useState('')
  const [authError, setAuthError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    const password = passwordInput.trim()
    if (!password) { setAuthError('Password is required'); return }
    setLoading(true)
    setAuthError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim(), password }),
        credentials: 'include',
      })
      let data = {}
      try {
        data = await res.json()
      } catch (_) {}

      if (res.ok && data.ok) {
        if (typeof onLoginSuccess === 'function') {
          onLoginSuccess(data.user)
        }
        if (typeof setAuthenticated === 'function') {
          setAuthenticated(true)
        }
        setPasswordInput('')
        setShowLogin(false)
      } else {
        setAuthError(data.error || (res.status === 429 ? 'Too many attempts. Please wait.' : 'Invalid credentials'))
      }
    } catch {
      setAuthError('Connection failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleRequestOtp = async (e) => {
    e.preventDefault()
    const email = regUsername.trim().toLowerCase()
    const password = regPassword
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setAuthError('Enter a valid email address'); return }
    if (!password || password.length < 8) { setAuthError('Password must be at least 8 characters'); return }
    setLoading(true)
    setAuthError('')
    try {
      const res = await fetch('/api/auth/register/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      })
      let data = {}
      try { data = await res.json() } catch (_) {}
      if (res.ok && data.ok) {
        setOtpSent(true)
        setOtpInfo(data.message || `Verification code sent to ${email}`)
      } else {
        setAuthError(data.error || 'Could not send the verification code')
      }
    } catch {
      setAuthError('Connection failed. Please check network and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    const email = regUsername.trim().toLowerCase()
    const otp = otpInput.trim()
    if (!otp) { setAuthError('Enter the 6-digit code from your email'); return }
    setLoading(true)
    setAuthError('')
    try {
      const res = await fetch('/api/auth/register/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
        credentials: 'include',
      })
      let data = {}
      try { data = await res.json() } catch (_) {}
      if (res.ok && data.ok) {
        if (typeof onLoginSuccess === 'function') {
          onLoginSuccess(data.user)
        }
        if (typeof setAuthenticated === 'function') {
          setAuthenticated(true)
        }
        setShowRegister(false)
        setOtpSent(false)
        setOtpInput('')
      } else {
        setAuthError(data.error || 'Verification failed')
      }
    } catch {
      setAuthError('Connection failed. Please check network and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen relative"
      style={{ background: '#000000', color: 'var(--text-primary)' }}
    >
      {/* ── Ambient Glowing Orbs — ultra-stealth ── */}
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[220px] rounded-full blur-[140px] opacity-[0.06]" style={{ background: 'radial-gradient(ellipse,#4c1d95,transparent 70%)' }} />
      </div>

      {/* ── Particles (subtle star-like micro dust) ── */}
      <ParticlesBackground quantity={35} color="#ffffff" className="z-0 opacity-15" />

      {/* ── NAVBAR: sleek minimal glassmorphism ── */}
      <header
        className="fixed top-0 w-full z-50"
        style={{
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(20px) saturate(160%)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <nav className="max-w-6xl mx-auto px-5 h-12 flex items-center justify-between">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-2.5"
          >
            <div
              className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center border border-white/20 shadow-[0_0_12px_rgba(16,185,129,0.3)] bg-black/40"
            >
              <img src={logoImg} alt="Devil's AI Logo" className="w-full h-full object-cover" />
            </div>
            <span className="text-[14px] font-bold tracking-tight text-white">Devil's AI</span>
            <span className="hidden sm:block text-[9px] font-mono px-1.5 py-0.5 rounded-full" style={{ color: '#a78bfa', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>v2.0</span>
          </motion.div>

          {/* Center nav links */}
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="hidden md:flex items-center gap-7"
          >
            {['Features', 'Personas', 'Pricing', 'Docs'].map(link => (
              <button
                key={link}
                className="text-[13px] text-white/40 hover:text-white/80 transition-colors duration-200"
                onClick={() => {
                  if (link === 'Personas') document.getElementById('interactive-demo-section')?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                {link}
              </button>
            ))}
          </motion.div>

          {/* Right CTAs */}
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex items-center gap-2"
          >
            <button
              className="text-[12px] text-white/40 hover:text-white/70 transition-colors px-2 py-1"
              onClick={() => { setShowRegister(true); setAuthError('') }}
            >
              Register
            </button>
            <button
              onClick={() => { setShowLogin(true); setAuthError('') }}
              className="h-7 px-4 text-[12px] font-semibold rounded-lg text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)' }}
            >
              Sign In
            </button>
          </motion.div>
        </nav>
      </header>

      {/* ══════════════════════════════════════════════════════
           HERO — CYBER AQUATIC FULL-SCREEN LIVING WORLD
           Procedural neon dolphins & cyber creatures background
      ══════════════════════════════════════════════════════ */}
      <section className="oc-hero relative z-10 h-screen w-full flex flex-col items-center justify-between overflow-hidden" style={{ background: '#000000' }}>

        {/* ── Full-Screen Living Background Canvas (Dolphins, Jellyfish, Manta Rays, AI Guardian Bot) ── */}
        <HeroAquaticCanvas />

        {/* ── Top Status Pill (Anchored at Top) ── */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-20 mt-20 pointer-events-auto"
        >
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full text-xs font-mono font-medium bg-black/75 border border-white/12 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] text-purple-300">
            <motion.span className="w-1.5 h-1.5 rounded-full bg-emerald-400" animate={{ scale: [1, 1.7, 1], opacity: [1, 0.4, 1] }} transition={{ duration: 1.1, repeat: Infinity }} />
            WHATSAPP AI AUTOPILOT · 24/7 LIVE
          </div>
        </motion.div>

        {/* ── Center is 100% open for the living ecosystem and Guardian AI Bot ── */}
        <div className="flex-1 pointer-events-none" />

        {/* ── Bottom Floating Command Dock (Anchored at Bottom) ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-20 mb-8 flex flex-col items-center gap-4 pointer-events-auto px-4"
        >
          <div className="flex flex-wrap items-center justify-center gap-3.5 p-2 rounded-2xl bg-black/75 border border-white/12 backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,0,0,0.9)]">
            <div className="relative">
              <Button
                size="lg"
                onClick={() => { setShowLogin(true); setAuthError('') }}
                className="relative h-11 px-7 text-xs sm:text-sm font-bold rounded-xl gap-2 border-0 text-white"
                style={{ background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', boxShadow: '0 0 30px rgba(139,92,246,0.55)' }}
              >
                Launch Dashboard
                <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.2, repeat: Infinity }}>
                  <ArrowRight className="w-3.5 h-3.5" />
                </motion.span>
              </Button>
            </div>

            <Button
              variant="outline"
              size="lg"
              onClick={() => document.getElementById('interactive-demo-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="relative h-11 px-6 text-xs sm:text-sm font-semibold rounded-xl gap-2 overflow-hidden bg-white/[0.04] border border-white/15 text-white/90 hover:text-white hover:bg-white/[0.08] transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current text-purple-400" /> Watch Live Demo
            </Button>
          </div>

          {/* Subtle Scroll Indicator */}
          <motion.div
            className="flex flex-col items-center gap-1 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
            onClick={() => document.getElementById('interactive-demo-section')?.scrollIntoView({ behavior: 'smooth' })}
          >
            <span className="text-[9px] font-mono tracking-[0.25em] uppercase text-zinc-500">Explore</span>
            <motion.div
              className="w-4 h-6 rounded-full border border-white/20 flex items-start justify-center pt-1"
              animate={{ borderColor: ['rgba(255,255,255,0.2)', 'rgba(139,92,246,0.6)', 'rgba(255,255,255,0.2)'] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <motion.div
                className="w-1 h-1.5 rounded-full bg-white/70"
                animate={{ y: [0, 6, 0], opacity: [1, 0, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* Section with bento tiles */}
      <section className="oc-bento-section relative z-10 flex flex-col items-center justify-center px-6 py-16 text-center overflow-hidden" style={{ background: '#000000' }}>


        {/* ── ALIVE BENTO GRID ── */}

        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-5xl grid grid-cols-2 md:grid-cols-4 grid-rows-2 gap-4 auto-rows-fr"
        >

          {/* TILE 1 (wide): Live Chat Feed — 2 cols */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="oc-tile col-span-2 row-span-1 rounded-3xl p-5 relative overflow-hidden group flex flex-col justify-between"
            style={{ background: 'rgba(8,8,8,0.97)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}
          >
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-20 group-hover:opacity-35 transition-opacity" style={{ background: '#25d366' }} />
            <div className="flex items-center justify-between mb-3 relative z-10">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="oc-tile-label text-[10px] font-mono" style={{ color: '#64748b' }}>LIVE AUTOPILOT FEED</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'rgba(37,211,102,0.12)', color: '#4ade80', border: '1px solid rgba(37,211,102,0.25)' }}>142 today</span>
            </div>
            <div className="space-y-2 relative z-10">
              {[
                { from: '+91 98765 43210', msg: 'Do you have a demo available?', reply: 'Yes! Book at cal.com/openchat 🗓️', ms: '310ms' },
                { from: '+1 555 019 2834', msg: 'What\'s the pricing for 500 users?', reply: 'Let me pull our enterprise plan...', ms: '290ms' },
              ].map(({ from, msg, reply, ms }, i) => (
                <motion.div
                  key={from}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + i * 0.2 }}
                  className="oc-tile-msg-row rounded-xl p-2.5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] font-mono" style={{ color: '#25d366' }}>{from}</span>
                    <span className="text-[9px]" style={{ color: '#475569' }}>→</span>
                    <span className="text-[9px]" style={{ color: '#94a3b8' }}>{msg}</span>
                  </div>
                  <div className="flex items-center justify-between pl-2 border-l-2" style={{ borderColor: '#8b5cf6' }}>
                    <span className="text-[9px]" style={{ color: '#c4b5fd' }}>{reply}</span>
                    <span className="text-[9px] font-mono" style={{ color: '#a78bfa' }}>{ms}</span>
                  </div>
                </motion.div>
              ))}
              {/* Typing indicator */}
              <motion.div
                className="flex items-center gap-1.5 pl-2"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              >
                <span className="text-[9px] font-mono" style={{ color: '#a78bfa' }}>Dhruv AI is typing</span>
                {[0, 1, 2].map(i => (
                  <motion.span key={i} className="w-1 h-1 rounded-full" style={{ background: '#a78bfa' }}
                    animate={{ y: [0, -3, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </motion.div>
            </div>
          </motion.div>

          {/* TILE 2: Uptime Ring */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.65 }}
            className="oc-tile col-span-1 row-span-1 rounded-3xl p-5 relative overflow-hidden group flex flex-col items-center justify-center text-center"
            style={{ background: 'rgba(8,8,8,0.97)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="absolute inset-0 rounded-3xl blur-2xl opacity-10 group-hover:opacity-20 transition-opacity" style={{ background: '#8b5cf6' }} />
            <div className="relative z-10">
              <svg width="72" height="72" viewBox="0 0 72 72" className="mb-2">
                <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(139,92,246,0.15)" strokeWidth="6"/>
                <motion.circle cx="36" cy="36" r="30" fill="none" stroke="#8b5cf6" strokeWidth="6"
                  strokeDasharray="188.5" strokeDashoffset="1.885"
                  strokeLinecap="round" transform="rotate(-90 36 36)"
                  animate={{ strokeDashoffset: [20, 1.885] }}
                  transition={{ duration: 2, delay: 0.8, ease: 'easeOut' }}
                />
                <text x="36" y="40" textAnchor="middle" fill="#f1f5f9" fontSize="14" fontWeight="bold" fontFamily="monospace">99.9%</text>
              </svg>
              <p className="text-xs font-bold" style={{ color: '#f1f5f9' }}>Uptime</p>
              <p className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>Last 30 days</p>
            </div>
          </motion.div>

          {/* TILE 3: Voice Waveform */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.7 }}
            className="oc-tile col-span-1 row-span-1 rounded-3xl p-5 relative overflow-hidden group flex flex-col justify-between"
            style={{ background: 'rgba(8,8,8,0.97)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full blur-3xl opacity-15 group-hover:opacity-25 transition-opacity" style={{ background: '#a78bfa' }} />
            <div className="flex items-center gap-2 mb-3 relative z-10">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
              <span className="text-[10px] font-mono" style={{ color: '#64748b' }}>WHISPER AI</span>
            </div>
            <div className="flex items-end gap-0.5 h-12 relative z-10">
              {[30, 60, 45, 80, 95, 50, 70, 40, 85, 55, 75, 35, 90, 60, 45].map((h, i) => (
                <motion.div
                  key={i} className="flex-1 rounded-full" style={{ background: 'linear-gradient(to top, #8b5cf6, #c4b5fd)' }}
                  animate={{ height: [`${h}%`, `${100 - h}%`, `${h}%`] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.06 }}
                />
              ))}
            </div>
            <p className="text-xs font-semibold mt-2 relative z-10" style={{ color: '#c4b5fd' }}>Voice Transcription</p>
          </motion.div>

          {/* TILE 4 (wide): Persona Status Panel — 2 cols */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75 }}
            className="oc-tile col-span-2 row-span-1 rounded-3xl p-5 relative overflow-hidden group"
            style={{ background: 'rgba(8,8,8,0.97)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="absolute -top-10 -left-10 w-48 h-48 rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity" style={{ background: '#f59e0b' }} />
            <p className="text-[10px] font-mono mb-3 relative z-10" style={{ color: '#64748b' }}>AI PERSONAS · ACTIVE NOW</p>
            <div className="grid grid-cols-3 gap-3 relative z-10">
              {[
                { name: 'Dhruv', role: 'General', msgs: 88, color: '#8b5cf6', dot: '#a78bfa' },
                { name: 'Devil', role: 'Sales', msgs: 34, color: '#f59e0b', dot: '#fbbf24' },
                { name: 'Annu', role: 'Support', msgs: 20, color: '#25d366', dot: '#4ade80' },
              ].map(({ name, role, msgs, color, dot }) => (
                <div key={name} className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center text-[10px] font-bold" style={{ background: `${color}22`, color }}>
                      {name[0]}
                    </div>
                    <motion.span
                      className="w-2 h-2 rounded-full"
                      style={{ background: dot }}
                      animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  </div>
                  <p className="text-xs font-bold" style={{ color: '#f1f5f9' }}>{name}</p>
                  <p className="text-[10px]" style={{ color: '#64748b' }}>{role}</p>
                  <div className="mt-2 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(msgs / 100) * 100}%` }}
                      transition={{ duration: 1.2, delay: 0.9 }}
                    />
                  </div>
                  <p className="text-[9px] font-mono mt-1" style={{ color: '#475569' }}>{msgs} msgs</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* TILE 5: Response Speed Meter */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8 }}
            className="oc-tile col-span-1 row-span-1 rounded-3xl p-5 relative overflow-hidden group flex flex-col justify-between"
            style={{ background: 'rgba(8,8,8,0.97)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="absolute inset-0 rounded-3xl blur-xl opacity-10 group-hover:opacity-20 transition-opacity" style={{ background: '#fb923c' }} />
            <p className="text-[10px] font-mono relative z-10" style={{ color: '#64748b' }}>AVG RESPONSE</p>
            <div className="relative z-10 text-center">
              <motion.p
                className="text-3xl font-bold font-mono"
                style={{ color: '#fb923c' }}
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                380ms
              </motion.p>
              <p className="text-[10px] mt-1" style={{ color: '#64748b' }}>AI reply speed</p>
            </div>
            <div className="flex gap-0.5 relative z-10">
              {[60, 80, 45, 90, 70, 55, 85, 40, 75].map((h, i) => (
                <motion.div key={i} className="flex-1 rounded-sm"
                  style={{ background: '#fb923c44', height: `${h * 0.3}px` }}
                  animate={{ height: [`${h * 0.3}px`, `${(100 - h) * 0.3}px`, `${h * 0.3}px`] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.08 }}
                />
              ))}
            </div>
          </motion.div>

          {/* TILE 6: Lead Capture Count */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.85 }}
            className="oc-tile col-span-1 row-span-1 rounded-3xl p-5 relative overflow-hidden group flex flex-col justify-between"
            style={{ background: 'rgba(8,8,8,0.97)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="absolute -bottom-4 -right-4 w-28 h-28 rounded-full blur-2xl opacity-15 group-hover:opacity-25 transition-opacity" style={{ background: '#4ade80' }} />
            <div className="relative z-10">
              <p className="text-[10px] font-mono mb-2" style={{ color: '#64748b' }}>LEADS TODAY</p>
              <motion.p
                className="text-4xl font-bold font-mono"
                style={{ color: '#4ade80' }}
              >
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                >
                  17
                </motion.span>
              </motion.p>
              <p className="text-[10px] mt-1" style={{ color: '#64748b' }}>captured automatically</p>
            </div>
            <div className="flex items-center gap-1.5 relative z-10">
              <motion.span className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 1, repeat: Infinity }} />
              <span className="text-[10px] font-mono text-emerald-400">+3 in last hour</span>
            </div>
          </motion.div>

          {/* Bottom glow under the grid */}
          <div className="absolute -bottom-8 inset-x-16 h-16 pointer-events-none rounded-full blur-2xl opacity-30" style={{ background: 'linear-gradient(90deg, #8b5cf6, #25d366)' }} />
        </motion.div>
      </section>

      {/* Divider */}
      <div className="relative z-10 h-px max-w-5xl mx-auto" style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.4), transparent)' }} />


      {/* ── SECTION 2: 3D Feature Bento Grid ── */}
      <div id="interactive-demo-section">
        <BentoSection />
      </div>

      {/* ── SECTION 3: AI Personas — Alive showcase ── */}
      <section className="relative z-10 px-6 py-24 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-4" style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            3 Personas · Running 24/7
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold mb-3 tracking-tight">Your AI Team. Always On.</h2>
          <p className="text-sm text-[var(--text-muted)] max-w-lg mx-auto">
            Each persona has its own memory, tone, and mission — automatically switching based on context.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { name: 'Dhruv', role: 'General Assistant', badge: 'Autopilot Active', desc: 'Handles daily conversations, bookings, and queries naturally. Learns your business context over time.', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', icon: Bot, msgs: 88, activity: [60,80,45,90,70,85,40,75,95,55], tag: 'PRIMARY' },
            { name: 'Devil', role: 'Sales & Lead Closer', badge: 'High Conversion', desc: 'Closes leads, handles objections, and pitches your product 24/7 without missing a single inquiry.', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: Flame, msgs: 34, activity: [40,70,90,50,80,60,95,45,75,85], tag: 'SALES' },
            { name: 'Annu', role: 'Support Specialist', badge: 'Empathy Engine', desc: 'Patient, clear, step-by-step troubleshooting. Reads your docs and resolves tickets instantly.', color: '#25d366', bg: 'rgba(37,211,102,0.1)', icon: UserCheck, msgs: 20, activity: [30,50,80,40,60,90,35,70,55,85], tag: 'SUPPORT' },
          ].map((p, i) => {
            const Icon = p.icon
            return (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.5 }}
                className="oc-persona-card group relative rounded-3xl p-6 flex flex-col justify-between overflow-hidden cursor-default"
                style={{ background: 'rgba(8,8,8,0.97)', border: '1px solid rgba(255,255,255,0.07)', minHeight: '320px' }}
                whileHover={{ borderColor: p.color + '55', scale: 1.015 }}
              >
                {/* Glow orb */}
                <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl opacity-0 group-hover:opacity-25 transition-opacity duration-500" style={{ background: p.color }} />

                {/* Top row */}
                <div>
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: p.bg, border: `1px solid ${p.color}30` }}>
                        <Icon className="w-5 h-5" style={{ color: p.color }} />
                      </div>
                      <div>
                        <p className="oc-persona-name text-sm font-bold text-white">{p.name}</p>
                        <p className="text-[10px] font-mono" style={{ color: p.color }}>{p.tag}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-mono" style={{ background: `${p.color}15`, color: p.color, border: `1px solid ${p.color}30` }}>
                      <motion.span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }}
                        animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                      />
                      LIVE
                    </div>
                  </div>

                  <p className="text-[11px] font-semibold mb-1" style={{ color: p.color }}>{p.role}</p>
                  <p className="text-xs leading-relaxed oc-persona-desc" style={{ color: '#94a3b8' }}>{p.desc}</p>
                </div>

                {/* Activity waveform */}
                <div>
                  <div className="flex items-end gap-0.5 h-10 mb-4 mt-5">
                    {p.activity.map((h, ai) => (
                      <motion.div
                        key={ai}
                        className="flex-1 rounded-full"
                        style={{ background: `linear-gradient(to top, ${p.color}60, ${p.color})` }}
                        animate={{ height: [`${h}%`, `${100-h}%`, `${h}%`] }}
                        transition={{ duration: 1.4, repeat: Infinity, delay: ai * 0.08 }}
                      />
                    ))}
                  </div>

                  {/* Bottom stats */}
                  <div className="oc-persona-border flex items-center justify-between pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                    <div>
                      <p className="oc-persona-stat-label text-[10px] font-mono" style={{ color: '#475569' }}>MSGS TODAY</p>
                      <p className="text-lg font-bold font-mono" style={{ color: p.color }}>{p.msgs}</p>
                    </div>
                    <div className="text-right">
                      <p className="oc-persona-stat-label text-[10px] font-mono" style={{ color: '#475569' }}>STATUS</p>
                      <p className="text-xs font-mono font-bold" style={{ color: '#4ade80' }}>ONLINE 24/7</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* ── SECTION 5: 3D Comparison Matrix ── */}
      <ComparisonMatrix />

      {/* ── SECTION 6: FAQ Accordion Section ── */}
      <FAQSection />

      {/* ── CTA SECTION: clean, confident, minimal ── */}
      <section className="relative z-10 px-6 py-28 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)' }} />
          <div className="oc-cta-glow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-[140px] opacity-[0.04]" style={{ background: '#8b5cf6' }} />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative max-w-2xl mx-auto text-center"
        >
          <h2
            className="text-4xl md:text-6xl font-bold tracking-tight mb-8"
            style={{ background: 'linear-gradient(to bottom,#fff,rgba(255,255,255,0.5))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', letterSpacing: '-0.03em' }}
          >
            Ready to go live?
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="relative">
              <motion.div
                className="absolute inset-0 rounded-xl"
                animate={{ opacity: [0.4, 0.9, 0.4] }}
                transition={{ duration: 2.5, repeat: Infinity }}
                style={{ background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', filter: 'blur(14px)' }}
              />
              <button
                onClick={() => { setShowLogin(true); setAuthError('') }}
                className="relative h-11 px-8 text-sm font-bold rounded-xl text-white flex items-center gap-2"
                style={{ background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)' }}
              >
                Launch Dashboard <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => { setShowRegister(true); setAuthError('') }}
              className="h-11 px-8 text-sm font-medium rounded-xl transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
            >
              Create Account
            </button>
          </div>
        </motion.div>
      </section>

      {/* ── FOOTER: pure black OLED, compact, minimal ── */}
      <footer className="relative z-20 border-t border-white/[0.08]" style={{ background: '#000000' }}>
        <div className="max-w-6xl mx-auto px-5 py-7">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">

            {/* Brand */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#25d366,#128c7e)' }}>
                <MessageCircle className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-[13px] font-semibold text-white tracking-tight">Devil's AI</span>
              <span className="text-[11px] text-zinc-700">·</span>
              <span className="text-[11px] text-zinc-500 font-mono">WhatsApp AI</span>
            </div>

            {/* Links */}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {['Features', 'Personas', 'Docs', 'Privacy', 'Terms', 'Support'].map(link => (
                <button
                  key={link}
                  className="text-[12px] text-zinc-400 hover:text-white transition-colors duration-200"
                  onClick={() => {
                    if (link === 'Features' || link === 'Personas') {
                      document.getElementById('interactive-demo-section')?.scrollIntoView({ behavior: 'smooth' })
                    }
                  }}
                >
                  {link}
                </button>
              ))}
            </div>

            {/* Status & Copyright */}
            <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>© 2026 Devil's AI</span>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Sign In Modal ── */}
      <Dialog open={showLogin} onOpenChange={(o) => { setShowLogin(o); setAuthError('') }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign In</DialogTitle>
            <DialogDescription>
              Sign in with your account email and password. (Master admin: leave email blank, enter the admin password.)
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLogin} className="flex flex-col gap-4 mt-2">
            <Input
              type="text"
              placeholder="Email or username (blank for admin)"
              value={loginUsername}
              onChange={(e) => { setLoginUsername(e.target.value); setAuthError('') }}
              autoFocus
            />
            <div className="relative">
              <Input
                type={showPw ? 'text' : 'password'}
                placeholder="Security password"
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setAuthError('') }}
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              >
                {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            {authError && (
              <p className="text-[11px] text-red-400">{authError}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Authenticating…' : 'Sign In'}
              {!loading && <ArrowRight className="w-3.5 h-3.5" />}
            </Button>

            <p className="text-center text-[11px] text-[var(--text-muted)]">
              Need an account?{' '}
              <button
                type="button"
                className="font-semibold text-[var(--accent-green)]"
                onClick={() => { setShowLogin(false); setShowRegister(true); setAuthError('') }}
              >
                Create one
              </button>
            </p>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Register Modal ── */}
      <Dialog open={showRegister} onOpenChange={(o) => { setShowRegister(o); setAuthError('') }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Account</DialogTitle>
            <DialogDescription>
              Register a personal workspace account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={otpSent ? handleVerifyOtp : handleRequestOtp} className="flex flex-col gap-3 mt-2">
            <Input
              type="email"
              placeholder="Email address"
              value={regUsername}
              onChange={(e) => { setRegUsername(e.target.value); setAuthError('') }}
              disabled={otpSent}
              autoFocus
              required
            />
            <Input
              type="password"
              placeholder="Password (min 8 characters)"
              value={regPassword}
              onChange={(e) => { setRegPassword(e.target.value); setAuthError('') }}
              disabled={otpSent}
              required
            />
            {otpSent && (
              <>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit verification code"
                  value={otpInput}
                  onChange={(e) => { setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6)); setAuthError('') }}
                  autoFocus
                  required
                />
                {otpInfo && <p className="text-[11px] text-emerald-400">{otpInfo} Check your inbox (and spam folder).</p>}
              </>
            )}

            {authError && (
              <p className="text-[11px] text-red-400">{authError}</p>
            )}

            <Button type="submit" className="w-full mt-1" disabled={loading}>
              {loading ? (otpSent ? 'Verifying…' : 'Sending code…') : (otpSent ? 'Verify & Create Account' : 'Send Verification Code')}
              {!loading && <ArrowRight className="w-3.5 h-3.5" />}
            </Button>

            {otpSent && (
              <button
                type="button"
                className="text-[11px] font-semibold text-[var(--primary-light)]"
                onClick={handleRequestOtp}
                disabled={loading}
              >
                Resend code
              </button>
            )}

            <p className="text-center text-[11px] text-[var(--text-muted)]">
              Your account gets its own isolated workspace: your own WhatsApp number, contacts and API key.
            </p>

            <p className="text-center text-[11px] text-[var(--text-muted)]">
              Already have an account?{' '}
              <button
                type="button"
                className="font-semibold text-[var(--primary-light)]"
                onClick={() => { setShowRegister(false); setShowLogin(true); setAuthError(''); setOtpSent(false) }}
              >
                Sign in
              </button>
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
