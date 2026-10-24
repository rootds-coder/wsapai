# Open Chat — UI Toolchain Policy

> **This document is permanent law for all UI/UX work in Open Chat.**
> Every AI agent, developer, and contributor must follow this toolchain.

---

## Toolchain Status

```
Open Chat UI Toolchain
──────────────────────────────────────────────
Framer Motion     → INSTALLED  (v13+, framer-motion)
GSAP              → INSTALLED  (v3+, gsap)
shadcn/ui         → CONFIGURED (Radix UI + CVA, @/components/ui)
21st.dev MCP      → CONNECTED  / VERIFIED (https://21st.dev/api/mcp)
UI/UX Pro Max     → AVAILABLE  (.agents/skills/uiux-pro-max/SKILL.md)
Taste Skill       → AVAILABLE  (.agents/skills/taste/SKILL.md)
──────────────────────────────────────────────
```

---

## Stack Overview

| Layer | Technology |
|-------|-----------|
| Build | Vite 7 + `@vitejs/plugin-react` |
| Framework | React 19 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) |
| Components | shadcn/ui (Radix UI + CVA) |
| Icons | lucide-react |
| Animation (React) | Framer Motion |
| Animation (Advanced) | GSAP |
| Class merging | clsx + tailwind-merge via `cn()` |
| Component variants | class-variance-authority (CVA) |
| Realtime | Socket.io-client |

---

## Import Paths

```js
// Design utilities
import { cn } from '@/lib/utils'

// Components
import { Button }      from '@/components/ui/button'
import { Card }        from '@/components/ui/card'
import { Dialog }      from '@/components/ui/dialog'
import { Input }       from '@/components/ui/input'
import { Badge }       from '@/components/ui/badge'
import { Tabs }        from '@/components/ui/tabs'
import { Select }      from '@/components/ui/select'
import { Avatar }      from '@/components/ui/avatar'
import { ScrollArea }  from '@/components/ui/scroll-area'
import { Switch }      from '@/components/ui/switch'
import { Skeleton }    from '@/components/ui/skeleton'
import { Separator }   from '@/components/ui/separator'
import { Tooltip }     from '@/components/ui/tooltip'

// Animation
import { motion, AnimatePresence } from 'framer-motion'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Icons
import { MessageCircle, Settings, Users } from 'lucide-react'
```

---

## PERMANENT UI RULES

### DESIGN DECISIONS
Use **UI/UX Pro Max** (`.agents/skills/uiux-pro-max/SKILL.md`) as the primary framework.
Use **Taste** (`.agents/skills/taste/SKILL.md`) as the final quality gate.

### COMPONENTS
- **Default**: shadcn/ui components from `@/components/ui`
- **Advanced patterns**: 21st.dev via MCP
- **Never**: build basic components from scratch when shadcn/ui has them

### REACT ANIMATION — Framer Motion
Use for ALL React UI motion:
- Button tap/hover micro-interactions
- Sidebar open/close
- Dialog/Sheet enter/exit
- Card hover states
- List item stagger animations
- Page transitions
- Presence animations (mount/unmount)
- Layout animations

```jsx
// ✅ Correct
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: 4 }}
  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
>
```

### ADVANCED ANIMATION — GSAP
Use ONLY for:
- ScrollTrigger sequences
- Timeline-based cinematic animations
- Hero section complex sequences
- Canvas/DOM animations beyond React's scope

```js
// ✅ Correct
gsap.registerPlugin(ScrollTrigger)
gsap.timeline().from('.hero-title', { opacity: 0, y: 60, duration: 1 })

// ❌ Wrong — don't use GSAP for button hover
```

---

## TOOL-FIRST WORKFLOW

For every UI request, follow this exact order:

```
REQUEST
   ↓
UI/UX Pro Max  → layout, spacing, type, color decisions
   ↓
Taste          → composition and polish check
   ↓
shadcn/ui      → pick the right component foundation
   ↓
21st.dev       → check for premium patterns if needed
   ↓
Framer Motion  → add appropriate UI motion
   ↓
GSAP           → only if advanced/scroll animation is needed
   ↓
IMPLEMENT
   ↓
Accessibility + responsive review
```

---

## DESIGN TOKEN USAGE

**Always use CSS variables — never hardcode colors:**

```css
/* ✅ Correct */
color: var(--text-primary);
background: var(--bg-elevated);
border-color: var(--border-default);

/* ❌ Wrong */
color: #f8fafc;
background: #111318;
```

**Key design tokens:**
```css
/* Backgrounds */
--bg:           #07080c   /* deepest */
--bg-elevated:  #111318   /* cards */
--bg-surface:   #161820   /* tabs, inputs */
--bg-hover:     #1c1f28   /* hover states */

/* Text */
--text-primary:   #f8fafc
--text-secondary: #a1aebf
--text-muted:     #6b7a90

/* Accent */
--primary:       #8b5cf6  /* purple */
--accent-green:  #25d366  /* WhatsApp green */

/* Borders */
--border-default: rgba(255,255,255,0.08)
--border-hover:   rgba(255,255,255,0.14)
--border-accent:  rgba(139,92,246,0.35)
```

---

## WHAT NOT TO DO

❌ Random purple gradients as full backgrounds  
❌ Excessive glassmorphism blur on everything  
❌ Generic SaaS dashboard templates  
❌ Huge hero headings in dashboard views  
❌ Overusing shadows (make them heavy/distracting)  
❌ Neon glow effects on everything  
❌ Inconsistent border-radius values  
❌ Animations with no UX purpose  
❌ Plain `className=""` string concatenation (use `cn()`)  
❌ Hardcoded color values  
❌ Creating basic components when shadcn/ui already has them  

---

## BEFORE EVERY UI BUILD — SILENT CHECKLIST

```
[ ] UI/UX Pro Max principles consulted
[ ] Taste checklist applied
[ ] Existing shadcn/ui components checked first
[ ] 21st.dev checked for premium patterns
[ ] Framer Motion used for UI motion
[ ] GSAP used ONLY if advanced animation needed
[ ] Design tokens used (no hardcoded colors)
[ ] Accessibility: ARIA, keyboard navigation, contrast
[ ] Responsive: works at 320px width
[ ] Empty states designed
[ ] Loading states handled (skeletons)
```

---

## FILE STRUCTURE REFERENCE

```
client/
├── src/
│   ├── components/
│   │   ├── ui/              ← shadcn/ui components (foundation)
│   │   │   ├── button.jsx
│   │   │   ├── card.jsx
│   │   │   ├── dialog.jsx
│   │   │   ├── input.jsx
│   │   │   ├── badge.jsx
│   │   │   ├── tabs.jsx
│   │   │   ├── select.jsx
│   │   │   ├── avatar.jsx
│   │   │   ├── scroll-area.jsx
│   │   │   ├── switch.jsx
│   │   │   ├── skeleton.jsx
│   │   │   ├── separator.jsx
│   │   │   ├── tooltip.jsx
│   │   │   └── index.js     ← barrel export
│   │   ├── chat/            ← chat-specific components
│   │   ├── dashboard/       ← dashboard components
│   │   └── landing/         ← landing page components
│   ├── lib/
│   │   └── utils.js         ← cn() utility
│   ├── hooks/               ← custom React hooks
│   ├── pages/               ← page components
│   ├── services/            ← API service layer
│   └── index.css            ← design tokens + Tailwind entry
├── vite.config.js           ← Vite + Tailwind v4 + path alias
└── package.json
.agents/
├── mcp_config.json          ← 21st.dev MCP (needs API key)
├── skills/
│   ├── uiux-pro-max/SKILL.md ← primary design framework
│   └── taste/SKILL.md        ← visual quality gate
UI_TOOLCHAIN.md              ← this file
```

---

## 21st.dev MCP Setup

To activate the 21st.dev MCP:

1. Get your API key at [https://21st.dev](https://21st.dev)
2. Edit `.agents/mcp_config.json`
3. Replace `<YOUR_21STDEV_API_KEY>` with your actual key
4. Restart the Antigravity agent

Once active, the agent will use 21st.dev to discover premium React UI patterns
and components before implementing from scratch.

---

*Last updated: 2026-08-11 | Open Chat UI Toolchain v1.0*
