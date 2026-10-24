import React, { useRef, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  MessageCircle, Bot, Flame, UserCheck, CheckCircle2,
  Zap, Shield, Cpu, PhoneCall, Sparkles, Send
} from 'lucide-react'

export const WhatsApp3DModel = () => {
  const [activeNode, setActiveNode] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveNode((prev) => (prev + 1) % 3)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 flex items-center justify-center opacity-40 md:opacity-50">
      <div className="relative w-full max-w-5xl h-[700px] flex items-center justify-center">
        
        {/* ── 3D Floating WhatsApp Incoming Message Bubble ── */}
        <motion.div
          animate={{
            y: [-12, 12, -12],
            rotateX: [10, -5, 10],
            rotateY: [-15, 10, -15],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          style={{ perspective: 1000, transformStyle: 'preserve-3d' }}
          className="absolute -top-6 left-10 md:left-24 p-4 rounded-2xl bg-[#111b21] border border-[#25d366]/40 shadow-[0_0_40px_rgba(37,211,102,0.3)] text-white w-64 backdrop-blur-md"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#25d366] flex items-center justify-center text-black font-bold">
                <MessageCircle className="w-4 h-4 text-black fill-current" />
              </div>
              <span className="text-xs font-bold text-emerald-400">WhatsApp Incoming</span>
            </div>
            <span className="text-[9px] font-mono text-emerald-300/80">LIVE SCAN</span>
          </div>
          <p className="text-xs font-medium text-slate-200 bg-[#202c33] p-2.5 rounded-xl border border-white/5">
            "Hi! Can I get pricing details for the AI engine?"
          </p>
          <div className="mt-2 flex items-center justify-between text-[9px] text-slate-400 font-mono">
            <span>+1 (555) 019-2834</span>
            <span className="text-emerald-400">Received ✓✓</span>
          </div>
        </motion.div>

        {/* ── 3D Floating AI Auto-Reply Bubble (Dhruv / Devil / Annu) ── */}
        <motion.div
          animate={{
            y: [14, -14, 14],
            rotateX: [-8, 12, -8],
            rotateY: [12, -12, 12],
          }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          style={{ perspective: 1000, transformStyle: 'preserve-3d' }}
          className="absolute -bottom-4 right-8 md:right-20 p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--primary-border)] shadow-[0_0_50px_rgba(139,92,246,0.35)] text-white w-72 backdrop-blur-md"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[var(--primary-dim)] border border-[var(--primary-border)] flex items-center justify-center">
                <Bot className="w-4 h-4 text-[var(--primary-light)]" />
              </div>
              <div>
                <span className="text-xs font-bold text-[var(--primary-light)] block">Dhruv AI Autopilot</span>
                <span className="text-[9px] text-purple-300 font-mono">Auto-replied in 380ms</span>
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <p className="text-xs text-purple-100 bg-[var(--primary-dim)] p-2.5 rounded-xl border border-[var(--primary-border)]/50">
            "Hey! Devil's AI handles 24/7 WhatsApp auto-replies with zero manual effort. Want a quick demo?"
          </p>
          <div className="mt-2 flex items-center justify-between text-[9px] font-mono text-purple-300">
            <span>GPT-4o RAG Grounded</span>
            <span className="text-emerald-400 font-bold">SENT ✓✓</span>
          </div>
        </motion.div>

        {/* ── Central 3D WhatsApp AI Synapse Ring ── */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
          className="w-96 h-96 rounded-full border-2 border-dashed border-[var(--primary-border)]/40 relative flex items-center justify-center"
        >
          {/* Orbiting WhatsApp Green Dot */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-[#25d366] shadow-[0_0_20px_#25d366] flex items-center justify-center">
            <MessageCircle className="w-3.5 h-3.5 text-black fill-current" />
          </div>

          {/* Orbiting AI Core Purple Dot */}
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-[var(--primary)] shadow-[0_0_20px_var(--primary)] flex items-center justify-center">
            <Cpu className="w-3.5 h-3.5 text-white" />
          </div>
        </motion.div>

        {/* ── Floating 3D Encryption & Voice Note Badges ── */}
        <motion.div
          animate={{ scale: [0.95, 1.05, 0.95] }}
          transition={{ duration: 4, repeat: Infinity }}
          className="absolute top-1/4 right-1/4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 backdrop-blur-md text-emerald-400 text-xs font-mono flex items-center gap-2"
        >
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>End-to-End Encrypted Solution</span>
        </motion.div>

      </div>
    </div>
  )
}
