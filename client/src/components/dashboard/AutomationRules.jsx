import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Plus, Trash2, Edit3, Power, CheckCircle, Tag, MessageSquare, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function AutomationRules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    keywords: "",
    matchType: "contains",
    actionType: "reply",
    replyText: "",
    targetMode: "manual",
    enabled: true,
  });

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/features/rules");
      const data = await res.json();
      if (data.ok && Array.isArray(data.rules)) {
        setRules(data.rules);
      }
    } catch {
      // API unreachable: show the real (empty) state, never invented rules.
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const openCreate = () => {
    setEditingRule(null);
    setFormData({
      name: "",
      keywords: "",
      matchType: "contains",
      actionType: "reply",
      replyText: "",
      targetMode: "manual",
      enabled: true,
    });
    setShowModal(true);
  };

  const openEdit = (rule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name || "",
      keywords: Array.isArray(rule.keywords) ? rule.keywords.join(", ") : rule.keywords || "",
      matchType: rule.matchType || "contains",
      actionType: rule.actionType || "reply",
      replyText: rule.replyText || "",
      targetMode: rule.targetMode || "manual",
      enabled: rule.enabled !== false,
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const payload = {
      id: editingRule ? editingRule.id : `rule-${Date.now()}`,
      name: formData.name.trim() || "Auto Rule",
      keywords: formData.keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      matchType: formData.matchType,
      actionType: formData.actionType,
      replyText: formData.replyText.trim(),
      targetMode: formData.targetMode,
      enabled: formData.enabled,
    };

    try {
      await fetch("/api/features/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      loadRules();
    } catch {
      setRules((prev) => (editingRule ? prev.map((r) => (r.id === payload.id ? payload : r)) : [payload, ...prev]));
    }
    setShowModal(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this automation rule?")) return;
    try {
      await fetch(`/api/features/rules/${id}`, { method: "DELETE" });
      loadRules();
    } catch {
      setRules((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const handleToggle = async (id, current) => {
    const next = !current;
    try {
      await fetch(`/api/features/rules/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      loadRules();
    } catch {
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: next } : r)));
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full pb-10">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl border border-white/10 bg-[#080c14]/90 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.7)]">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-[0_0_16px_rgba(168,85,247,0.25)]">
            <Zap size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">Keyword Triggers & Auto-Workflows</h2>
            <p className="text-xs text-zinc-400">Deterministic instant replies and mode switches before AI model generation.</p>
          </div>
        </div>

        <Button
          onClick={openCreate}
          className="gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold px-4 h-9 rounded-xl shadow-[0_0_20px_rgba(139,92,246,0.35)]"
        >
          <Plus size={15} />
          Create New Rule
        </Button>
      </div>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rules.map((rule, idx) => (
          <motion.div
            key={rule.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
          >
            <Card
              className="border border-white/10 bg-[#060a12]/95 hover:border-white/20 transition-all duration-200 shadow-[0_8px_24px_rgba(0,0,0,0.6)] flex flex-col justify-between h-full group"
            >
              <CardHeader className="p-4 pb-3 border-b border-white/5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-white truncate group-hover:text-purple-300 transition-colors">
                    {rule.name}
                  </span>
                  <Switch
                    checked={rule.enabled !== false}
                    onCheckedChange={() => handleToggle(rule.id, rule.enabled)}
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge
                    variant="outline"
                    className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border-purple-500/30"
                  >
                    Action: {rule.actionType === "mode" ? `Switch to ${rule.targetMode}` : "Instant Reply"}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-4 flex flex-col justify-between flex-1 gap-4">
                {/* Keywords Cloud */}
                <div>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1.5">
                    Trigger Keywords ({rule.keywords?.length || 0})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {rule.keywords?.map((kw) => (
                      <span
                        key={kw}
                        className="px-2 py-0.5 text-[11px] rounded-md bg-white/[0.04] border border-white/10 text-zinc-300 font-mono"
                      >
                        #{kw}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Reply snippet */}
                {rule.replyText && (
                  <div className="p-2.5 rounded-lg bg-black/50 border border-white/5 text-[11px] text-zinc-300 leading-relaxed max-h-24 overflow-y-auto whitespace-pre-wrap font-sans">
                    {rule.replyText}
                  </div>
                )}

                {/* Card footer actions */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(rule)}
                    className="h-7 px-2.5 text-xs text-zinc-400 hover:text-white gap-1"
                  >
                    <Edit3 size={12} />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(rule.id)}
                    className="h-7 px-2.5 text-xs text-zinc-400 hover:text-red-400 hover:bg-red-500/10 gap-1"
                  >
                    <Trash2 size={12} />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Modal: Create/Edit Rule */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg bg-[#080d18] border-white/15 text-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingRule ? "Edit Automation Rule" : "Create Automation Trigger"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="flex flex-col gap-4 mt-2">
            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-1">Rule Name</label>
              <Input
                placeholder="e.g. VIP Pricing Trigger"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-black/60 border-white/10 text-white h-9 text-xs"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-1">
                Trigger Keywords (comma separated)
              </label>
              <Input
                placeholder="price, cost, rate, kitna, payment"
                value={formData.keywords}
                onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                className="bg-black/60 border-white/10 text-white h-9 text-xs font-mono"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">Match Type</label>
                <select
                  value={formData.matchType}
                  onChange={(e) => setFormData({ ...formData, matchType: e.target.value })}
                  className="w-full h-9 rounded-md bg-black/60 border border-white/10 text-white text-xs px-3 outline-none"
                >
                  <option value="contains">Contains Keyword</option>
                  <option value="exact">Exact Match</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">Action Type</label>
                <select
                  value={formData.actionType}
                  onChange={(e) => setFormData({ ...formData, actionType: e.target.value })}
                  className="w-full h-9 rounded-md bg-black/60 border border-white/10 text-white text-xs px-3 outline-none"
                >
                  <option value="reply">Send Instant Text Reply</option>
                  <option value="mode">Switch Contact AI Mode</option>
                </select>
              </div>
            </div>

            {formData.actionType === "mode" && (
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">Target Mode</label>
                <select
                  value={formData.targetMode}
                  onChange={(e) => setFormData({ ...formData, targetMode: e.target.value })}
                  className="w-full h-9 rounded-md bg-black/60 border border-white/10 text-white text-xs px-3 outline-none"
                >
                  <option value="manual">Manual (Pause AI for human handover)</option>
                  <option value="devil">Devil v1.0 (Roast / Direct)</option>
                  <option value="boy">Dhruv (Playful Boy)</option>
                  <option value="girl">Annu (Sweet & Natural Girl)</option>
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-1">Response Message</label>
              <Textarea
                rows={4}
                placeholder="Message to send immediately when triggered..."
                value={formData.replyText}
                onChange={(e) => setFormData({ ...formData, replyText: e.target.value })}
                className="bg-black/60 border-white/10 text-white text-xs leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <Button type="button" variant="ghost" onClick={() => setShowModal(false)} className="text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold px-5"
              >
                Save Rule
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
