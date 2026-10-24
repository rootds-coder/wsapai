import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, ShieldCheck, UserX, AlertTriangle, CheckCircle, Trash2, Ban, Lock, Unlock, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatSafeDateTime } from "@/lib/utils";

export default function SecurityShield() {
  const [alerts, setAlerts] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadSecurityData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/features/security/alerts");
      const data = await res.json();
      if (data.ok) {
        setAlerts(data.alerts || []);
        setBlocked(data.blocked || []);
      }
    } catch {
      // API unreachable: show the real (empty) state, never invented alerts.
      setAlerts([]);
      setBlocked([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSecurityData();
  }, []);

  const handleDismiss = async (id) => {
    try {
      await fetch(`/api/features/security/alerts/${id}`, { method: "DELETE" });
      setAlerts(alerts.filter((a) => a.id !== id));
    } catch {
      setAlerts(alerts.filter((a) => a.id !== id));
    }
  };

  const handleBlock = async (jid, reason) => {
    try {
      await fetch("/api/features/security/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid, reason }),
      });
      loadSecurityData();
    } catch {
      setBlocked([{ jid, reason, blockedAt: new Date() }, ...blocked]);
      setAlerts(alerts.filter((a) => a.jid !== jid));
    }
  };

  const handleUnblock = async (jid) => {
    try {
      await fetch("/api/features/security/unblock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid }),
      });
      loadSecurityData();
    } catch {
      setBlocked(blocked.filter((b) => b.jid !== jid));
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full pb-10">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl border border-white/10 bg-[#080c14]/90 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.7)]">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-[0_0_16px_rgba(244,63,94,0.25)]">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">Real-Time Scam & Spam Shield Radar</h2>
            <p className="text-xs text-zinc-400">Automated fraud detection, phishing defense, and abusive spam blacklist.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge className="bg-rose-500/10 border-rose-500/30 text-rose-400 text-xs font-mono">
            {alerts.length} Flagged Threats
          </Badge>
          <Badge className="bg-zinc-800 text-zinc-300 text-xs font-mono border-white/10">
            {blocked.length} Blocked Numbers
          </Badge>
        </div>
      </div>

      {/* Flagged Alerts Section */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
          Detected Threat Radar ({alerts.length})
        </h3>

        {alerts.length === 0 ? (
          <Card className="border border-white/10 bg-[#060a12]/95 p-8 text-center">
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ShieldCheck size={20} />
              </div>
              <p className="text-sm font-semibold text-white">All Clear — Zero Threats Detected</p>
              <p className="text-xs text-zinc-500">Autonomous Sentinel is actively screening all incoming WhatsApp messages.</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {alerts.map((alert) => (
              <motion.div key={alert.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border border-rose-500/30 bg-[#060a12]/95 shadow-[0_8px_24px_rgba(0,0,0,0.6)] flex flex-col justify-between h-full">
                  <CardHeader className="p-4 pb-2 border-b border-white/5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                          <AlertTriangle size={14} />
                        </div>
                        <div>
                          <span className="font-bold text-xs text-white">{alert.name || alert.jid}</span>
                          <p className="text-[10px] text-zinc-500 font-mono">{alert.jid}</p>
                        </div>
                      </div>
                      <Badge
                        variant="destructive"
                        className="text-[9px] uppercase font-mono bg-rose-600/20 text-rose-400 border-rose-500/30"
                      >
                        {alert.threatLevel || "High"} Threat
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-200 font-medium">
                      🛡️ Detected: {alert.reason}
                    </div>

                    <div className="p-2.5 rounded-lg bg-black/60 border border-white/5 text-[11px] text-zinc-300 font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
                      "{alert.text}"
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDismiss(alert.id)}
                        className="h-7 px-3 text-xs text-zinc-400 hover:text-white"
                      >
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleBlock(alert.jid, alert.reason)}
                        className="h-7 px-3 text-xs bg-rose-600 hover:bg-rose-500 text-white font-semibold gap-1.5 rounded-lg"
                      >
                        <Ban size={12} />
                        Block Number
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Blocked Numbers Section */}
      <Card className="border border-white/10 bg-[#060a12]/95 shadow-[0_8px_24px_rgba(0,0,0,0.6)] mt-2">
        <CardHeader className="p-4 pb-3 border-b border-white/5 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <Lock size={14} className="text-zinc-400" />
              Blacklisted Numbers ({blocked.length})
            </CardTitle>
            <CardDescription className="text-xs text-zinc-400">
              Numbers that are permanently muted and excluded from AI auto-replies.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          {blocked.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-4">No numbers currently blacklisted.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {blocked.map((b) => (
                <div
                  key={b.jid}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-md bg-zinc-800 flex items-center justify-center text-zinc-400">
                      <UserX size={12} />
                    </div>
                    <div>
                      <p className="text-xs font-bold font-mono text-zinc-200">{b.jid}</p>
                      <p className="text-[10px] text-zinc-500">{b.reason || "Manual Block"}</p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUnblock(b.jid)}
                    className="h-7 px-3 text-xs bg-black/40 border-white/10 hover:bg-emerald-600/20 hover:border-emerald-500/40 text-zinc-300 gap-1.5"
                  >
                    <Unlock size={12} className="text-emerald-400" />
                    Unblock
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
