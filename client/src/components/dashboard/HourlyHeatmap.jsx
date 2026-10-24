import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BarChart3, Clock, Flame, PieChart, Activity, Zap, Cpu, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function HourlyHeatmap() {
  const [hourlyData, setHourlyData] = useState([]);
  const [personas, setPersonas] = useState({
    distribution: { devil: 3, boy: 1, girl: 1, auto: 0, manual: 0 },
    percentages: { devil: 60, boy: 20, girl: 20, auto: 0, manual: 0 },
    totalContacts: 5,
  });

  const loadAnalytics = async () => {
    try {
      const res = await fetch("/api/features/analytics/hourly");
      const data = await res.json();
      if (data.ok) {
        setHourlyData(data.hourly || []);
        if (data.personas) setPersonas(data.personas);
      }
    } catch {
      // Mock data for preview
      const mockHours = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        count: i >= 9 && i <= 21 ? Math.floor(Math.sin((i - 9) / 4) * 20 + 8) : Math.floor(Math.random() * 4),
      }));
      setHourlyData(mockHours);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const maxCount = Math.max(...hourlyData.map((d) => d.count), 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* 24-Hour Peak Traffic Heatmap */}
      <Card className="lg:col-span-2 border border-white/10 bg-[#060a12]/95 shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
        <CardHeader className="p-4 pb-3 border-b border-white/5 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <Clock size={15} className="text-cyan-400" />
              24-Hour WhatsApp Traffic Heatmap
            </CardTitle>
            <CardDescription className="text-xs text-zinc-400">
              Message dispatch and incoming flow by local hour of day.
            </CardDescription>
          </div>
          <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-[10px] font-mono">
            Peak: ~2-6 PM
          </Badge>
        </CardHeader>

        <CardContent className="p-5">
          <div className="flex items-end justify-between gap-1.5 h-44 pt-4">
            {hourlyData.map((d, i) => {
              const heightPercent = Math.max(Math.round((d.count / maxCount) * 100), 6);
              const isPeak = d.count >= maxCount * 0.7 && d.count > 2;

              return (
                <div key={d.hour} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-mono text-cyan-300">
                    {d.count}
                  </div>

                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${heightPercent}%` }}
                    transition={{ duration: 0.5, delay: i * 0.02 }}
                    className="w-full rounded-t-sm transition-all group-hover:brightness-125"
                    style={{
                      background: isPeak
                        ? "linear-gradient(180deg, #06b6d4 0%, #3b82f6 100%)"
                        : "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.04) 100%)",
                      boxShadow: isPeak ? "0 0 12px rgba(6,182,212,0.4)" : "none",
                    }}
                  />

                  <span className="text-[10px] font-mono text-zinc-400 group-hover:text-zinc-300">
                    {String(d.hour).padStart(2, "0")}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* AI Persona Distribution */}
      <Card className="border border-white/10 bg-[#060a12]/95 shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex flex-col justify-between">
        <CardHeader className="p-4 pb-3 border-b border-white/5">
          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
            <PieChart size={15} className="text-purple-400" />
            Active Persona Utilization
          </CardTitle>
          <CardDescription className="text-xs text-zinc-400">
            Contacts assigned across AI personalities
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 flex flex-col gap-3">
          {[
            { label: "Devil v1.0 (Roast / Direct)", count: personas.distribution.devil || 0, pct: personas.percentages.devil || 0, color: "#8b5cf6" },
            { label: "Annu (Sweet & Human)", count: personas.distribution.girl || 0, pct: personas.percentages.girl || 0, color: "#f43f5e" },
            { label: "Dhruv (Playful Boy)", count: personas.distribution.boy || 0, pct: personas.percentages.boy || 0, color: "#06b6d4" },
            { label: "Manual Handover", count: personas.distribution.manual || 0, pct: personas.percentages.manual || 0, color: "#eab308" },
          ].map((item) => (
            <div key={item.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-200">{item.label}</span>
                <span className="font-mono text-zinc-400 font-bold">{item.pct}% ({item.count})</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${item.pct}%` }}
                  transition={{ duration: 0.6 }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: item.color }}
                />
              </div>
            </div>
          ))}

          <div className="mt-2 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-400">
            <span className="flex items-center gap-1">
              <Zap size={12} className="text-emerald-400" /> Avg AI Latency: ~380ms
            </span>
            <span className="font-mono text-emerald-400 font-bold">99.9% Online</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
