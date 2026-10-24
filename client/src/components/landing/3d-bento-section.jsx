import React from 'react'
import { motion } from 'framer-motion'
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid'
import { Badge } from '@/components/ui/badge'
import { Mic, Eye, FileText, ShieldAlert, Cpu, Sparkles, Database, Users } from 'lucide-react'

export function BentoSection() {
  return (
    <section className="relative z-10 px-6 py-24 max-w-6xl mx-auto">
      <div className="text-center mb-16">
        <Badge className="mb-3 px-3 py-1 text-xs bg-purple-500/10 text-purple-400 border-purple-500/20">
          <Sparkles className="w-3.5 h-3.5 mr-1" /> Autonomous AI Suite
        </Badge>
        <h2 className="text-3xl md:text-5xl font-extrabold mb-3 tracking-tight text-white">
          Engineered for Autonomous WhatsApp Growth
        </h2>
        <p className="text-sm text-zinc-400 max-w-lg mx-auto">
          Whisper audio transcription, vision intelligence, RAG knowledge training, and anti-ban broadcasting built right in.
        </p>
      </div>

      <BentoGrid>
        {/* Item 1: Large Hero Bento Card */}
        <BentoGridItem
          span="col-span-1 md:col-span-2"
          title="Voice Note Transcription & Audio Replies"
          description="Received a WhatsApp voice note? Devil's AI automatically transcribes audio messages via Gemini 2.5/3.5 Flash, analyzes intent, and generates realistic voice or text replies instantly."
          icon={<Mic className="w-5 h-5 text-purple-400" />}
          badge="Multimodal AI"
          header={
            <div className="w-full h-40 rounded-2xl bg-gradient-to-br from-purple-900/40 via-purple-600/10 to-transparent border border-[var(--border-default)] p-4 flex flex-col justify-between overflow-hidden relative">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                <span className="text-[10px] font-mono text-purple-300">AUDIO WAVEFORM PROCESSING</span>
              </div>
              {/* Fake Audio Waveform bars */}
              <div className="flex items-end justify-between gap-1 h-20 px-4">
                {[40, 65, 30, 85, 95, 45, 75, 60, 90, 35, 80, 50, 70, 40, 90, 60, 30, 75].map((h, i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 rounded-full bg-purple-500/60"
                    animate={{ height: [`${h}%`, `${100 - h}%`, `${h}%`] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.05 }}
                  />
                ))}
              </div>
            </div>
          }
        />

        {/* Item 2: Image Vision Analysis */}
        <BentoGridItem
          span="col-span-1"
          title="Image & Vision Intelligence"
          description="Devil's AI inspects images, receipts, screenshots, and product photos sent in WhatsApp chats."
          icon={<Eye className="w-5 h-5 text-amber-400" />}
          badge="GPT-4 Vision"
          header={
            <div className="w-full h-40 rounded-2xl bg-gradient-to-br from-amber-900/40 via-amber-500/10 to-transparent border border-[var(--border-default)] p-4 flex flex-col justify-center items-center relative overflow-hidden">
              <Eye className="w-12 h-12 text-amber-400/80 mb-2 animate-pulse" />
              <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20">
                Visual Inspection Active
              </span>
            </div>
          }
        />

        {/* Item 3: RAG Knowledge Base */}
        <BentoGridItem
          span="col-span-1"
          title="RAG Knowledge Trainer"
          description="Upload .txt, .pdf documents or scrape website URLs to ground AI responses in your exact business facts."
          icon={<FileText className="w-5 h-5 text-emerald-400" />}
          badge="RAG Context"
          header={
            <div className="w-full h-40 rounded-2xl bg-gradient-to-br from-emerald-900/40 via-emerald-500/10 to-transparent border border-[var(--border-default)] p-4 flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between text-[10px] font-mono text-emerald-400">
                <span>DATABASE SYNC</span>
                <span>MongoDB GridFS</span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-emerald-500/20 text-xs font-mono text-emerald-300">
                📄 closest-person.txt (28.5 KB)<br />
                🌐 Scraped: /pricing (Trained)
              </div>
            </div>
          }
        />

        {/* Item 4: Anti-Ban Protection */}
        <BentoGridItem
          span="col-span-1 md:col-span-2"
          title="Anti-Ban Broadcast Engine"
          description="Send broadcast campaigns with customizable delay intervals, randomized jitter, and typing simulation to protect your WhatsApp number from account restrictions."
          icon={<ShieldAlert className="w-5 h-5 text-rose-400" />}
          badge="Anti-Ban Safe"
          header={
            <div className="w-full h-40 rounded-2xl bg-gradient-to-br from-rose-900/40 via-rose-500/10 to-transparent border border-[var(--border-default)] p-4 flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between text-[10px] font-mono text-rose-300">
                <span>SIMULATED TYPING DELAY</span>
                <span className="text-emerald-400 font-bold">STATUS: SAFE</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-mono text-rose-300">
                  Delay: 3000ms
                </div>
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-mono text-rose-300">
                  Jitter: +840ms
                </div>
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-300">
                  Sent: 100%
                </div>
              </div>
            </div>
          }
        />
      </BentoGrid>
    </section>
  )
}
