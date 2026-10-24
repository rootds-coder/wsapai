// Pair flat Live Feed events (newest-first) into question -> reply pairs
// per contact, for the dashboard Live Feed view. An "out" event (AI reply,
// auto-rule, Don Away notice, system ack) closes the pending question for
// the same jid; a question with no reply yet renders as pending.
export function pairFeedEvents(eventsNewestFirst) {
  const events = [...(eventsNewestFirst || [])].reverse() // oldest first
  const pairs = []
  const pending = new Map()
  for (const e of events) {
    if (!e || !e.jid) continue
    if (e.direction === 'in') {
      if (pending.has(e.jid)) pairs.push(pending.get(e.jid))
      pending.set(e.jid, { jid: e.jid, contactName: e.contactName || '', question: e, reply: null })
    } else {
      const p = pending.get(e.jid)
      if (p) {
        p.reply = e
        pairs.push(p)
        pending.delete(e.jid)
      } else {
        pairs.push({ jid: e.jid, contactName: e.contactName || '', question: null, reply: e })
      }
    }
  }
  for (const p of pending.values()) pairs.push(p)
  return pairs.reverse() // newest first
}
