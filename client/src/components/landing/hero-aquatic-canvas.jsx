import React, { useRef, useEffect } from 'react'

export function HeroAquaticCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    // Interactive mouse tracking for dolphin curiosity
    let mouse = { x: width / 2, y: height / 2, inside: false }
    const onMouseMove = (e) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
      mouse.inside = true
    }
    const onMouseLeave = () => {
      mouse.inside = false
      mouse.x = width / 2
      mouse.y = height / 2
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseleave', onMouseLeave)

    // ── 100% PURE AQUATIC OCEAN ECOSYSTEM ──

    // 1. UPPER/MID POD: Neon Dolphins (4 Dolphins, stratified across Y: 18% - 48%)
    const dolphins = Array.from({ length: 4 }, (_, i) => ({
      id: `dolphin-${i}`,
      type: 'dolphin',
      name: i === 0 ? 'Phishing Bot' : i === 1 ? 'Spam Lead' : 'Fake Number',
      x: (width / 4) * i - Math.random() * 120,
      baseY: height * (0.18 + i * 0.08),
      y: height * (0.18 + i * 0.08),
      vx: 1.7 + i * 0.35,
      size: 40 + i * 8,
      phase: i * 1.8,
      tailSpeed: 0.11,
      glowColor: i === 0 ? '#25d366' : i === 1 ? '#38bdf8' : i === 2 ? '#a78bfa' : '#34d399',
      trapped: false,
      trapTime: 0,
      trail: [],
    }))

    // 2. LOWER DEEP LAYER: Cyber Manta Rays (3 Mantas, stratified across Y: 54% - 85%)
    const mantas = Array.from({ length: 3 }, (_, i) => ({
      id: `manta-${i}`,
      type: 'manta',
      name: 'Scam Broadcast',
      x: (width / 3) * i - Math.random() * 150,
      baseY: height * (0.54 + i * 0.12),
      y: height * (0.54 + i * 0.12),
      vx: 1.2 + i * 0.3,
      wingSpan: 58 + i * 16,
      flap: i * 2.2,
      color: i === 0 ? '#2dd4bf' : i === 1 ? '#38bdf8' : '#818cf8',
      trapped: false,
      trapTime: 0,
    }))

    // 3. VERTICAL DRIFT LAYER: Bio Jellyfish (8 Jellies rising along sides & depths)
    const jellies = Array.from({ length: 8 }, (_, i) => {
      const isLeft = i % 2 === 0
      const startX = isLeft
        ? Math.random() * (width * 0.25) + 20
        : width - Math.random() * (width * 0.25) - 30
      return {
        id: `jelly-${i}`,
        type: 'jelly',
        name: 'Ad Bot',
        x: startX,
        y: height * (0.2 + (i / 8) * 0.8),
        speedY: 0.5 + Math.random() * 0.45,
        pulse: Math.random() * Math.PI * 2,
        size: 18 + Math.random() * 18,
        color: ['#a78bfa', '#ec4899', '#38bdf8', '#25d366', '#c084fc', '#67e8f9', '#f43f5e', '#34d399'][i % 8],
        tentacleCount: 5 + Math.floor(Math.random() * 3),
        trapped: false,
        trapTime: 0,
      }
    })

    // 4. AMBIENT BUBBLES
    const bubbles = Array.from({ length: 45 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 2.5 + 0.8,
      vy: -(Math.random() * 0.85 + 0.3),
      alpha: Math.random() * 0.55 + 0.2,
      wobble: Math.random() * Math.PI * 2,
    }))

    // ── 5. AI GUARDIAN SHIELD BOT ──
    const allTargets = [...dolphins, ...mantas, ...jellies]
    const aiBot = {
      x: width * 0.2,
      y: height * 0.3,
      vx: 0,
      vy: 0,
      targetIndex: 0,
      state: 'hunting', // 'hunting' | 'trapping'
      trapTimer: 0,
      activeTarget: null,
      dialogueText: '🛡️ Stay away from scammers with our AI Bot!',
      subText: 'THREAT DETECTED · AUTO-TRAPPING',
      speechPulse: 0,
    }

    let time = 0

    const render = () => {
      raf = requestAnimationFrame(render)
      time += 0.02

      // ── PURE OLED BLACK ──
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, width, height)

      // ── RENDER AMBIENT BUBBLES ──
      bubbles.forEach(b => {
        b.y += b.vy
        b.x += Math.sin(time + b.wobble) * 0.45
        if (b.y < -10) {
          b.y = height + 10
          b.x = Math.random() * width
        }
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(167, 139, 250, ${b.alpha * 0.35})`
        ctx.fill()
      })

      // ── 1. RENDER BIO JELLYFISH ──
      jellies.forEach(j => {
        j.pulse += 0.035
        const expansion = Math.sin(j.pulse)
        j.y -= j.speedY * (0.75 + expansion * 0.45)
        if (j.y < -50) j.y = height + 40

        ctx.save()
        ctx.translate(j.x, j.y)
        ctx.shadowColor = j.color
        ctx.shadowBlur = 14
        ctx.strokeStyle = j.color
        ctx.fillStyle = `${j.color}20`
        ctx.lineWidth = 1.8

        const rx = j.size * (1 + expansion * 0.22)
        const ry = j.size * (0.85 - expansion * 0.18)
        ctx.beginPath()
        ctx.ellipse(0, 0, rx, ry, 0, Math.PI, 0)
        ctx.quadraticCurveTo(rx * 0.5, ry * 0.3, 0, ry * 0.1)
        ctx.quadraticCurveTo(-rx * 0.5, ry * 0.3, -rx, 0)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        // Glowing Bio-Core
        ctx.beginPath()
        ctx.arc(0, -ry * 0.4, j.size * 0.32, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.shadowColor = '#ffffff'
        ctx.shadowBlur = 10
        ctx.fill()

        // Flowing Tentacles
        for (let tIdx = 0; tIdx < j.tentacleCount; tIdx++) {
          const tx = -rx * 0.6 + (tIdx / (j.tentacleCount - 1)) * (rx * 1.2)
          ctx.beginPath()
          ctx.moveTo(tx, ry * 0.1)
          const tentacleLen = j.size * 2.2
          for (let seg = 1; seg <= 5; seg++) {
            const segY = (seg / 5) * tentacleLen
            const wave = Math.sin(time * 2.8 + j.pulse + tIdx + seg * 0.6) * (6 + seg * 2)
            ctx.lineTo(tx + wave, ry * 0.1 + segY)
          }
          ctx.strokeStyle = `${j.color}85`
          ctx.lineWidth = 1.2
          ctx.stroke()
        }

        ctx.restore()
      })

      // ── 2. RENDER CYBER MANTA RAYS ──
      mantas.forEach(m => {
        m.x += m.vx
        if (m.x > width + 140) m.x = -120

        m.flap += 0.055
        const wingFlap = Math.sin(m.flap) * 18

        ctx.save()
        ctx.translate(m.x, m.baseY + Math.sin(time + m.flap) * 12)
        ctx.shadowColor = m.color
        ctx.shadowBlur = 18
        ctx.strokeStyle = m.color
        ctx.fillStyle = `${m.color}22`
        ctx.lineWidth = 2

        ctx.beginPath()
        ctx.moveTo(m.wingSpan * 0.5, 0)
        ctx.quadraticCurveTo(m.wingSpan * 0.1, -m.wingSpan * 0.4 + wingFlap, -m.wingSpan * 0.1, -m.wingSpan * 0.7 + wingFlap)
        ctx.quadraticCurveTo(-m.wingSpan * 0.2, -m.wingSpan * 0.2, -m.wingSpan * 0.6, 0)
        ctx.quadraticCurveTo(-m.wingSpan * 0.2, m.wingSpan * 0.2, -m.wingSpan * 0.1, m.wingSpan * 0.7 - wingFlap)
        ctx.quadraticCurveTo(m.wingSpan * 0.1, m.wingSpan * 0.4 - wingFlap, m.wingSpan * 0.5, 0)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        // Whip Tail
        ctx.beginPath()
        ctx.moveTo(-m.wingSpan * 0.6, 0)
        for (let seg = 1; seg <= 6; seg++) {
          ctx.lineTo(-m.wingSpan * 0.6 - seg * 14, Math.sin(m.flap + seg * 0.8) * 8)
        }
        ctx.strokeStyle = `${m.color}b0`
        ctx.lineWidth = 2
        ctx.stroke()

        // Spine Dots
        for (let s = 0; s < 4; s++) {
          ctx.beginPath()
          ctx.arc(-m.wingSpan * 0.3 + s * 14, 0, 2.5, 0, Math.PI * 2)
          ctx.fillStyle = '#ffffff'
          ctx.fill()
        }

        ctx.restore()
      })

      // ── 3. RENDER NEON DOLPHINS ──
      dolphins.forEach(d => {
        d.x += d.vx
        if (d.x > width + 110) d.x = -90

        const naturalY = d.baseY + Math.sin(time * 2 + d.phase) * 22
        if (mouse.inside && Math.abs(mouse.y - d.baseY) < 140) {
          const dy = mouse.y - d.y
          d.y += dy * 0.015
        } else {
          d.y += (naturalY - d.y) * 0.05
        }

        d.phase += d.tailSpeed

        d.trail.push({ x: d.x, y: d.y })
        if (d.trail.length > 20) d.trail.shift()

        if (d.trail.length > 1) {
          ctx.beginPath()
          ctx.moveTo(d.trail[0].x, d.trail[0].y)
          for (let i = 1; i < d.trail.length; i++) {
            ctx.lineTo(d.trail[i].x, d.trail[i].y)
          }
          ctx.strokeStyle = `${d.glowColor}30`
          ctx.lineWidth = 2.2
          ctx.stroke()
        }

        ctx.save()
        ctx.translate(d.x, d.y)
        const angle = Math.sin(time * 2 + d.phase) * 0.14
        ctx.rotate(angle)

        ctx.shadowColor = d.glowColor
        ctx.shadowBlur = 18
        ctx.strokeStyle = d.glowColor
        ctx.fillStyle = `${d.glowColor}25`
        ctx.lineWidth = 2

        // Dolphin Body
        ctx.beginPath()
        ctx.moveTo(d.size * 0.7, 0)
        ctx.quadraticCurveTo(d.size * 0.4, -d.size * 0.35, 0, -d.size * 0.3)
        ctx.lineTo(-d.size * 0.1, -d.size * 0.55)
        ctx.quadraticCurveTo(-d.size * 0.25, -d.size * 0.45, -d.size * 0.2, -d.size * 0.25)
        ctx.quadraticCurveTo(-d.size * 0.5, -d.size * 0.15, -d.size * 0.75, Math.sin(d.phase) * (d.size * 0.2))
        ctx.lineTo(-d.size * 0.9, Math.sin(d.phase) * (d.size * 0.2) - d.size * 0.28)
        ctx.lineTo(-d.size * 0.8, Math.sin(d.phase) * (d.size * 0.2))
        ctx.lineTo(-d.size * 0.9, Math.sin(d.phase) * (d.size * 0.2) + d.size * 0.28)
        ctx.lineTo(-d.size * 0.75, Math.sin(d.phase) * (d.size * 0.2))
        ctx.quadraticCurveTo(-d.size * 0.3, d.size * 0.3, 0, d.size * 0.25)
        ctx.lineTo(d.size * 0.1, d.size * 0.45)
        ctx.lineTo(d.size * 0.15, d.size * 0.2)
        ctx.quadraticCurveTo(d.size * 0.5, d.size * 0.05, d.size * 0.7, 0)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        // Eye
        ctx.beginPath()
        ctx.arc(d.size * 0.42, -d.size * 0.08, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.shadowColor = '#ffffff'
        ctx.shadowBlur = 8
        ctx.fill()

        ctx.restore()
      })

      // ── 4. AI GUARDIAN BOT LOGIC & RENDER (Hunting & Trapping Scammers) ──
      const currentTarget = allTargets[aiBot.targetIndex % allTargets.length]
      aiBot.activeTarget = currentTarget

      const targetX = currentTarget.x
      const targetY = currentTarget.y || currentTarget.baseY

      const dx = targetX - aiBot.x
      const dy = (targetY - 35) - aiBot.y
      const dist = Math.hypot(dx, dy)

      if (aiBot.state === 'hunting') {
        aiBot.x += dx * 0.035
        aiBot.y += dy * 0.035
        if (dist < 65) {
          aiBot.state = 'trapping'
          aiBot.trapTimer = 110 // ~2 seconds trap lock
          const messages = [
            '🛡️ Stay away from scammers with Devil\'s AI!',
            '🚫 Phishing Scammer Intercepted & Trapped!',
            '⚡ 24/7 AI Shield: Fake Leads Blocked!',
            '🔒 Secure WhatsApp Pipeline Activated!',
          ]
          aiBot.dialogueText = messages[Math.floor(Math.random() * messages.length)]
        }
      } else if (aiBot.state === 'trapping') {
        aiBot.x += (targetX - aiBot.x) * 0.08
        aiBot.y += (targetY - 35 - aiBot.y) * 0.08
        aiBot.trapTimer--

        // Render Laser Holographic Security Bubble Trap around creature
        const trapRadius = (currentTarget.size || currentTarget.wingSpan || 30) * 1.3
        const trapPulse = Math.sin(time * 8) * 3

        // Glowing Trap Shield Sphere
        ctx.beginPath()
        ctx.arc(targetX, targetY, trapRadius + trapPulse, 0, Math.PI * 2)
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 2
        ctx.shadowColor = '#ef4444'
        ctx.shadowBlur = 18
        ctx.fillStyle = 'rgba(239, 68, 68, 0.12)'
        ctx.fill()
        ctx.stroke()

        // Rotating Shield Nodes
        for (let n = 0; n < 4; n++) {
          const nAngle = time * 3 + (n * Math.PI) / 2
          const nx = targetX + Math.cos(nAngle) * (trapRadius + trapPulse)
          const ny = targetY + Math.sin(nAngle) * (trapRadius + trapPulse)
          ctx.beginPath()
          ctx.arc(nx, ny, 3, 0, Math.PI * 2)
          ctx.fillStyle = '#fef08a'
          ctx.fill()
        }

        // Floating Trap Tag above creature
        ctx.font = 'bold 9px monospace'
        ctx.fillStyle = '#f87171'
        ctx.shadowColor = '#ef4444'
        ctx.shadowBlur = 8
        ctx.fillText(`[SCAMMER TRAPPED 🚫]`, targetX - 55, targetY - trapRadius - 10)

        ctx.restore()

        if (aiBot.trapTimer <= 0) {
          aiBot.state = 'hunting'
          aiBot.targetIndex++
        }
      }

      // ── DRAW THE AI GUARDIAN BOT (Drone with Visor, Thrusters & Speech Bubble) ──
      ctx.save()
      ctx.translate(aiBot.x, aiBot.y + Math.sin(time * 4) * 4)

      // Dual Thrusters
      const thrusterGlow = Math.sin(time * 12) * 4 + 10
      ctx.beginPath()
      ctx.arc(-14, 12, 3, 0, Math.PI * 2)
      ctx.arc(14, 12, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#38bdf8'
      ctx.shadowColor = '#38bdf8'
      ctx.shadowBlur = thrusterGlow
      ctx.fill()

      // Bot Main Metallic Pod Body
      ctx.beginPath()
      ctx.roundRect(-18, -14, 36, 26, 12)
      ctx.fillStyle = '#0f172a'
      ctx.strokeStyle = '#8b5cf6'
      ctx.lineWidth = 2
      ctx.shadowColor = '#8b5cf6'
      ctx.shadowBlur = 14
      ctx.fill()
      ctx.stroke()

      // Bot Glowing Cyclops Visor Eye
      ctx.beginPath()
      ctx.roundRect(-11, -7, 22, 10, 5)
      ctx.fillStyle = aiBot.state === 'trapping' ? '#ef4444' : '#22c55e'
      ctx.shadowColor = aiBot.state === 'trapping' ? '#ef4444' : '#22c55e'
      ctx.shadowBlur = 12
      ctx.fill()

      // Eye Scanning pupil bar
      const eyeScan = Math.sin(time * 6) * 6
      ctx.beginPath()
      ctx.arc(eyeScan, -2, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()

      // Top Radar Antenna
      ctx.beginPath()
      ctx.moveTo(0, -14)
      ctx.lineTo(0, -22)
      ctx.strokeStyle = '#c4b5fd'
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(0, -23, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = '#a78bfa'
      ctx.shadowColor = '#a78bfa'
      ctx.shadowBlur = 8
      ctx.fill()

      // ── HOLOGRAPHIC SPEECH DIALOGUE BUBBLE ──
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif'
      const textMetrics = ctx.measureText(aiBot.dialogueText)
      const boxW = Math.max(160, textMetrics.width + 24)
      const boxH = 28
      const boxX = 24
      const boxY = -34

      // Speech bubble background
      ctx.beginPath()
      ctx.roundRect(boxX, boxY, boxW, boxH, 8)
      ctx.fillStyle = 'rgba(8, 8, 8, 0.88)'
      ctx.strokeStyle = aiBot.state === 'trapping' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(139, 92, 246, 0.6)'
      ctx.lineWidth = 1.2
      ctx.shadowColor = aiBot.state === 'trapping' ? '#ef4444' : '#8b5cf6'
      ctx.shadowBlur = 10
      ctx.fill()
      ctx.stroke()

      // Little connector triangle to bot
      ctx.beginPath()
      ctx.moveTo(boxX, boxY + 14)
      ctx.lineTo(boxX - 6, boxY + 18)
      ctx.lineTo(boxX, boxY + 22)
      ctx.fillStyle = 'rgba(8, 8, 8, 0.88)'
      ctx.fill()

      // Speech text inside bubble
      ctx.fillStyle = '#ffffff'
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.fillText(aiBot.dialogueText, boxX + 12, boxY + 18)

      ctx.restore()
    }

    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-auto">
      {/* Full-Screen Pure Aquatic Canvas (100% clean, zero scanline bars) */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-0 block cursor-default" />
    </div>
  )
}
