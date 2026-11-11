import { Film, Layers, Settings, Sparkles } from "lucide-react";
import type { SystemInfo } from "../lib/api";

export type Screen = "create" | "jobs" | "library" | "settings";

const NAV: { id: Screen; label: string; icon: typeof Sparkles }[] = [
  { id: "create", label: "Oluştur", icon: Sparkles },
  { id: "jobs", label: "İşlemler", icon: Layers },
  { id: "library", label: "Kütüphane", icon: Film },
];

export function Sidebar({
  screen,
  onSelect,
  system,
}: {
  screen: Screen;
  onSelect: (s: Screen) => void;
  system: SystemInfo | null;
}) {
  const gpu = system?.gpus[0];
  const problem = system?.gpuProblem;
  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-stroke bg-sidebar px-3 pt-6 pb-4">
      <div className="flex items-center gap-2.5 px-3 pb-7">
        <div className="grid size-8 place-items-center rounded-small bg-accent text-ink">
          <Sparkles size={18} strokeWidth={2.5} />
        </div>
        <span className="font-display text-[24px] font-extrabold uppercase tracking-tight">Merogi AI</span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => (
          <NavRow key={item.id} {...item} active={screen === item.id} onClick={() => onSelect(item.id)} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        <div className="rounded-field border border-stroke bg-card px-4 py-3">
          <div className="flex items-center gap-2 text-body font-semibold">
            <span className={`size-1.5 rounded-full ${problem?.blocks ? "bg-danger" : problem ? "bg-warning" : "bg-accent"}`} />
            {gpu ? gpu.name.replace(/^NVIDIA (GeForce )?/, "") : "NVIDIA GPU bulunamadı"}
          </div>
          <div className="mt-1 text-note text-muted">
            {problem?.kind === "oldDriver"
              ? `Sürücü ${problem.driver} eski`
              : problem?.kind === "lowVram"
                ? `${Math.round(problem.memoryMb / 1024)} GB · bellek yetersiz kalabilir`
                : gpu
                  ? `${Math.round(gpu.memoryMb / 1024)} GB · GPU kullanıma hazır`
                  : "Hazırlık ve render için CUDA gerekli"}
          </div>
        </div>
        <NavRow id="settings" label="Ayarlar" icon={Settings} active={screen === "settings"} onClick={() => onSelect("settings")} />
      </div>
    </aside>
  );
}

function NavRow({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  id: Screen;
  label: string;
  icon: typeof Sparkles;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-row px-3 py-2.5 text-left text-[15px] font-medium transition-colors ${
        active ? "bg-selection text-text" : "text-muted hover:bg-well hover:text-text"
      }`}
    >
      <Icon size={18} className={active ? "text-accent" : ""} />
      {label}
    </button>
  );
}
