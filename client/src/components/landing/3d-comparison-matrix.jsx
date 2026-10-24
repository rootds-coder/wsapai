import React from 'react'
import { motion } from 'framer-motion'
import { GlareCard } from '@/components/ui/glare-card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Sparkles, MessageCircle, Bot, Zap } from 'lucide-react'

const COMPARISONS = [
  {
    feature: '24/7 Autopilot Replies',
    openChat: true,
    traditional: false,
    manual: false,
  },
  {
    feature: 'Context Memory & Persona Training',
    openChat: true,
    traditional: false,
    manual: true,
  },
  {
    feature: 'Voice Note & Image Vision Analysis',
    openChat: true,
    traditional: false,
    manual: false,
  },
  {
    feature: 'Per-Contact Mode Control (Auto/Manual/Off)',
    openChat: true,
    traditional: false,
    manual: true,
  },
  {
    feature: 'Sub-second Response Speed',
    openChat: true,
    traditional: true,
    manual: false,
  },
  {
    feature: 'Anti-Ban Safe Broadcast Campaigner',
    openChat: true,
    traditional: false,
    manual: false,
  },
  {
    feature: 'Self-Hosted Data Ownership',
    openChat: true,
    traditional: false,
    manual: true,
  },
]

export function ComparisonMatrix() {
  return (
    <section className="relative z-10 px-6 py-20 max-w-5xl mx-auto">
      <div className="text-center mb-14">
        <Badge className="mb-3 px-3 py-1 text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
          <Sparkles className="w-3.5 h-3.5 mr-1" /> Feature Comparison
        </Badge>
        <h2 className="text-3xl md:text-5xl font-extrabold mb-3">Why Devil's AI Wins</h2>
        <p className="text-sm text-[var(--text-muted)] max-w-lg mx-auto">
          Compare Devil's AI autonomous personas against static rule bots and manual chatting
        </p>
      </div>

      <GlareCard className="p-0 overflow-hidden border border-[var(--border-default)] shadow-[0_24px_80px_rgba(139,92,246,0.18)] rounded-3xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--bg-elevated)]">
                <th className="p-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Feature</th>
                <th className="p-4 text-xs font-extrabold text-[var(--primary-light)] bg-purple-500/10 border-x border-[var(--primary-border)]">
                  <div className="flex items-center gap-1.5">
                    <MessageCircle className="w-4 h-4 text-emerald-400" /> Devil's AI (3D Engine)
                  </div>
                </th>
                <th className="p-4 text-xs font-bold text-[var(--text-muted)]">Traditional Bot</th>
                <th className="p-4 text-xs font-bold text-[var(--text-muted)]">Manual Chatting</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISONS.map((row, i) => (
                <tr
                  key={row.feature}
                  className="border-b border-[var(--border-default)] hover:bg-[var(--bg-hover)] transition-colors text-xs"
                >
                  <td className="p-4 font-semibold text-[var(--text-primary)]">{row.feature}</td>
                  
                  {/* Devil's AI Column */}
                  <td className="p-4 font-bold bg-purple-500/5 border-x border-[var(--primary-border)] text-emerald-400">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>YES</span>
                    </div>
                  </td>

                  {/* Traditional Bot Column */}
                  <td className="p-4 text-[var(--text-muted)]">
                    {row.traditional ? (
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle2 className="w-4 h-4 shrink-0" /> YES
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-rose-400/80">
                        <XCircle className="w-4 h-4 shrink-0" /> NO
                      </div>
                    )}
                  </td>

                  {/* Manual Chatting Column */}
                  <td className="p-4 text-[var(--text-muted)]">
                    {row.manual ? (
                      <div className="flex items-center gap-1.5 text-emerald-400/80">
                        <CheckCircle2 className="w-4 h-4 shrink-0" /> Partial
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-rose-400/80">
                        <XCircle className="w-4 h-4 shrink-0" /> NO
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlareCard>
    </section>
  )
}
