import { motion } from "framer-motion";
import {
  LayoutDashboard,
  MessageCircle,
  Users,
  Megaphone,
  Bot,
  Settings,
  Moon,
  LogOut,
  Zap,
  Mic,
  ShieldAlert,
  Flame,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import logoImg from "@/assets/logo-nav.webp";

/* -- Nav items config with rich cyber accents -------------------------------- */
const NAV_ITEMS = [
  { id: "dashboard", icon: LayoutDashboard, label: "Overview", color: "#a855f7", bg: "rgba(168,85,247,0.15)", border: "rgba(168,85,247,0.3)" },
  { id: "chats", icon: MessageCircle, label: "Live Chats", color: "#10b981", bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.3)" },
  { id: "contacts", icon: Users, label: "Contacts & Tags", color: "#06b6d4", bg: "rgba(6,182,212,0.15)", border: "rgba(6,182,212,0.3)" },
  { id: "groups", icon: Flame, label: "Group AI 😈", color: "#f97316", bg: "rgba(249,115,22,0.15)", border: "rgba(249,115,22,0.3)" },
  { id: "automation", icon: Zap, label: "Auto-Rules & Triggers", color: "#eab308", bg: "rgba(234,179,8,0.15)", border: "rgba(234,179,8,0.3)" },
  { id: "vault", icon: Mic, label: "Voice Vault & Media", color: "#10b981", bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.3)" },
  { id: "security", icon: ShieldAlert, label: "Scam Shield Radar", color: "#f43f5e", bg: "rgba(244,63,94,0.15)", border: "rgba(244,63,94,0.3)" },
  { id: "broadcast", icon: Megaphone, label: "Broadcast", color: "#ec4899", bg: "rgba(236,72,153,0.15)", border: "rgba(236,72,153,0.3)" },
  { id: "personas", icon: Bot, label: "AI Studio", color: "#f59e0b", bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.3)" },
  { id: "providers", icon: Cpu, label: "AI Providers", color: "#22d3ee", bg: "rgba(34,211,238,0.15)", border: "rgba(34,211,238,0.3)" },
  { id: "settings", icon: Settings, label: "Settings & Webhooks", color: "#8b5cf6", bg: "rgba(139,92,246,0.15)", border: "rgba(139,92,246,0.3)" },
];

/* -- Mini NavItem Component -------------------------------------------------- */
function MiniNavItem({ item, active, onClick }) {
  const Icon = item.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          type="button"
          aria-label={item.label}
          aria-current={active ? "page" : undefined}
          onClick={() => onClick(item.id)}
          whileTap={{ scale: 0.92 }}
          className={cn(
            "relative flex items-center justify-center w-11 h-11 rounded-xl mx-auto my-0.5",
            "transition-all duration-150 cursor-pointer select-none outline-none group",
            active
              ? "border shadow-[0_0_16px_rgba(0,0,0,0.6)]"
              : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200 border border-transparent"
          )}
          style={{
            background: active ? item.bg : undefined,
            borderColor: active ? item.border : undefined,
            color: active ? item.color : undefined,
          }}
        >
          <Icon
            size={19}
            className="transition-transform duration-150 group-hover:scale-110"
            style={{ color: active ? item.color : 'currentColor' }}
          />
          {active && (
            <motion.div
              layoutId="activeIndicator"
              className="absolute left-0 w-1 h-5 rounded-r-full shadow-[0_0_10px_currentColor]"
              style={{ backgroundColor: item.color, color: item.color }}
            />
          )}
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="font-semibold text-xs bg-[#090d14] border-white/10 text-white shadow-xl">
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

/* -- Fixed Mini Sidebar Component ------------------------------------------- */
export default function Sidebar({
  currentUser = { username: 'admin', role: 'admin', isAdmin: true },
  setAuthenticated,
  activeTab,
  setActiveTab,
  donAwayMode,
  toggleDonAway,
}) {
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {}
    if (typeof setAuthenticated === 'function') {
      setAuthenticated(false);
    }
    window.location.href = '/';
  };

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (currentUser?.isAdmin) return true;
    // Tenants get the isolated feature set: their own chats, contacts,
    // keyword rules, scam shield, AI studio and settings (own keys).
    // Admin-only: Group AI, Voice Vault, Broadcast.
    return ["dashboard", "chats", "contacts", "automation", "security", "personas", "providers", "settings"].includes(item.id);
  });

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className="fixed top-0 left-0 bottom-0 h-screen w-16 z-40 flex flex-col justify-between shrink-0 overflow-y-auto overflow-x-hidden select-none bg-[#050810]/95 backdrop-blur-2xl border-r border-white/10 shadow-[4px_0_24px_rgba(0,0,0,0.7)]"
      >
        {/* Top Logo */}
        <div className="flex flex-col items-center">
          <div
            className="flex items-center justify-center h-14 w-full shrink-0 border-b border-white/10"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="Go to overview"
                  className="flex items-center justify-center shrink-0 rounded-xl overflow-hidden shadow-[0_0_16px_rgba(16,185,129,0.35)] cursor-pointer transition-transform hover:scale-105 border border-white/20 bg-black/40"
                  style={{
                    width: 38,
                    height: 38,
                  }}
                  onClick={() => setActiveTab("dashboard")}
                >
                  <img src={logoImg} alt="" width="36" height="36" decoding="async" className="w-full h-full object-cover rounded-xl" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10} className="font-semibold text-xs bg-[#090d14] border-white/10 text-white">
                Devil's AI v2.0
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Navigation Items */}
          <nav className="flex flex-col gap-1 py-3 w-full items-center">
            {visibleNavItems.map((item) => (
              <MiniNavItem
                key={item.id}
                item={item}
                active={activeTab === item.id}
                onClick={setActiveTab}
              />
            ))}
          </nav>
        </div>

        {/* Bottom Actions */}
        <div
          className="flex flex-col items-center gap-1.5 py-3 w-full shrink-0 border-t border-white/10"
        >
          {/* Don Away Toggle Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                whileTap={{ scale: 0.92 }}
                type="button"
                aria-label="Don Away mode"
                aria-pressed={donAwayMode}
                onClick={toggleDonAway}
                className={cn(
                  "flex items-center justify-center w-11 h-11 rounded-xl cursor-pointer transition-all duration-150",
                  donAwayMode
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                    : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200 border border-transparent"
                )}
              >
                <Moon
                  size={18}
                  className={cn(
                    "transition-colors",
                    donAwayMode ? "text-amber-400" : "text-zinc-400"
                  )}
                />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10} className="font-semibold text-xs bg-[#090d14] border-white/10 text-white">
              {donAwayMode ? "Don Away Mode (Enabled)" : "Don Away Mode (Disabled)"}
            </TooltipContent>
          </Tooltip>

          {/* Logout Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                whileTap={{ scale: 0.92 }}
                type="button" aria-label="Log out"
                onClick={handleLogout}
                className="flex items-center justify-center w-11 h-11 rounded-xl cursor-pointer text-zinc-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent transition-all duration-150"
              >
                <LogOut size={17} />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10} className="font-semibold text-xs bg-[#090d14] border-white/10 text-white">
              Logout
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}