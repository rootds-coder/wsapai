import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Mic, Upload, Play, Pause, Trash2, Tag, Music, Volume2, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function VoiceVault() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [tagInput, setTagInput] = useState("greeting");
  const fileInputRef = useRef(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState(null);

  const loadVault = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/features/vault");
      const data = await res.json();
      if (data.ok && Array.isArray(data.items)) {
        setItems(data.items);
      }
    } catch {
      // Mock items for local preview
      setItems([
        { id: "v1", title: "Welcome Voice Note (Alloy)", tag: "welcome", filename: "welcome_voice.mp3", size: 48200, createdAt: new Date() },
        { id: "v2", title: "Annu Casual Greeting (Nova)", tag: "annu", filename: "annu_greeting.opus", size: 62400, createdAt: new Date() },
        { id: "v3", title: "Pricing & Payment Guide", tag: "pricing", filename: "pricing_audio.mp3", size: 85100, createdAt: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVault();
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const fd = new FormData();
    fd.append("audio", file);
    fd.append("title", titleInput.trim() || file.name);
    fd.append("tag", tagInput);

    try {
      const res = await fetch("/api/features/vault", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.ok) {
        setTitleInput("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        loadVault();
      }
    } catch {
      const fakeItem = {
        id: `v-${Date.now()}`,
        title: titleInput.trim() || file.name,
        tag: tagInput,
        filename: file.name,
        size: file.size,
        createdAt: new Date(),
      };
      setItems([fakeItem, ...items]);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this voice note from the Vault?")) return;
    try {
      await fetch(`/api/features/vault/${id}`, { method: "DELETE" });
      loadVault();
    } catch {
      setItems(items.filter((i) => i.id !== id));
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full pb-10">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl border border-white/10 bg-[#080c14]/90 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.7)]">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.25)]">
            <Mic size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">Voice Vault & Audio Assets</h2>
            <p className="text-xs text-zinc-400">Store and stream push-to-talk voice notes, greetings, and sales pitches.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-xs font-mono">
            {items.length} Audio Notes
          </Badge>
        </div>
      </div>

      {/* Upload Box */}
      <Card className="border border-white/10 bg-[#060a12]/95 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
        <CardHeader className="p-4 pb-2 border-b border-white/5">
          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
            <Upload size={14} className="text-emerald-400" />
            Upload New Voice Note / Media Note
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Audio Title / Label</label>
              <Input
                placeholder="e.g. Annu Welcome Voice"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                className="bg-black/60 border-white/10 text-white h-9 text-xs"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Category Tag</label>
              <select
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                className="w-full h-9 rounded-md bg-black/60 border border-white/10 text-white text-xs px-3 outline-none"
              >
                <option value="welcome">Welcome Greeting</option>
                <option value="annu">Annu Persona Note</option>
                <option value="dhruv">Dhruv Persona Note</option>
                <option value="pricing">Pricing & Sales Pitch</option>
                <option value="support">Customer Support</option>
              </select>
            </div>

            <div>
              <input
                type="file"
                ref={fileInputRef}
                accept="audio/*,.mp3,.ogg,.opus,.m4a,.wav"
                onChange={handleUpload}
                className="hidden"
                id="vault-file-upload"
              />
              <Button
                asChild
                disabled={uploading}
                className="w-full h-9 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                <label htmlFor="vault-file-upload" className="flex items-center justify-center gap-2">
                  <Upload size={14} />
                  {uploading ? "Uploading Audio..." : "Select Audio File"}
                </label>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Voice Notes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item, idx) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
          >
            <Card className="border border-white/10 bg-[#060a12]/95 hover:border-emerald-500/30 transition-all duration-200 shadow-[0_8px_24px_rgba(0,0,0,0.6)] flex flex-col justify-between h-full">
              <CardHeader className="p-4 pb-2 border-b border-white/5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <Volume2 size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-white truncate">{item.title}</h4>
                      <span className="text-[10px] text-zinc-500 font-mono">{item.filename}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[9px] uppercase font-mono bg-white/[0.04] text-zinc-300 border-white/10">
                    {item.tag}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-4 flex flex-col gap-3">
                {/* Audio Player */}
                <div className="p-2 rounded-xl bg-black/60 border border-white/5">
                  <audio
                    controls
                    src={`/api/features/vault/${item.id}/stream`}
                    className="w-full h-8"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] text-zinc-400 font-mono">
                  <span>{item.size ? `${Math.round(item.size / 1024)} KB` : "Opus / MP3"}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(item.id)}
                    className="h-6 px-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 gap-1 text-[10px]"
                  >
                    <Trash2 size={11} />
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
