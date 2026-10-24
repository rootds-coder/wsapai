import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, HelpCircle } from 'lucide-react'

const FAQS = [
  {
    q: 'How does Devil\'s AI connect to my WhatsApp number?',
    a: 'Devil\'s AI connects via Baileys multi-device auth protocol. You simply scan the QR code displayed on your dashboard using WhatsApp -> Linked Devices on your phone. No official WhatsApp API fees required!',
  },
  {
    q: 'Can I train the AI on my specific business products and FAQs?',
    a: 'Yes! Using the AI Studio tab, you can upload .txt or .pdf files, or input website URLs to scrape. The AI uses RAG (Retrieval-Augmented Generation) to ground all answers in your exact business facts.',
  },
  {
    q: 'What happens if a customer sends a voice note or image?',
    a: 'Devil\'s AI automatically transcribes voice notes using Gemini 2.5/3.5 Flash and analyzes incoming images before crafting an intelligent contextual reply.',
  },
  {
    q: 'Is my chat data private and self-hosted?',
    a: '100% self-hosted! All contacts, chat histories, and session keys remain stored securely in your own MongoDB database and server. We never retain or sell your data.',
  },
  {
    q: 'Can I take over a chat manually at any time?',
    a: 'Absolutely! You can change any contact mode to "Manual" or "Off" directly from the Contacts tab. In Manual mode, the AI pauses auto-replying for that specific conversation so you can chat directly.',
  },
]

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <section className="relative z-10 px-6 py-20 max-w-4xl mx-auto">
      <div className="text-center mb-14">
        <Badge className="mb-3 px-3 py-1 text-xs bg-purple-500/10 text-purple-400 border-purple-500/20">
          <HelpCircle className="w-3.5 h-3.5 mr-1" /> Frequently Asked Questions
        </Badge>
        <h2 className="text-3xl md:text-5xl font-extrabold mb-3">Got Questions? We Have Answers</h2>
        <p className="text-sm text-[var(--text-muted)] max-w-lg mx-auto">
          Everything you need to know about setting up and running Devil's AI
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {FAQS.map((faq, i) => {
          const isOpen = openIndex === i
          return (
            <div
              key={faq.q}
              className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] overflow-hidden transition-all duration-300 hover:border-[var(--primary-border)]"
            >
              <button
                onClick={() => setOpenIndex(isOpen ? -1 : i)}
                className="w-full p-5 text-left flex items-center justify-between gap-4 focus:outline-none"
              >
                <span className="text-sm font-bold text-[var(--text-primary)]">{faq.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-[var(--primary-light)] shrink-0 transition-transform duration-300 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 text-xs text-[var(--text-muted)] leading-relaxed border-t border-[var(--border-default)]/50 pt-3">
                      {faq.a}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </section>
  )
}
