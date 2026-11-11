import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, formatBytes, type AssetInfo, type AssetProgress, type SystemInfo } from "../lib/api";
import { Button, Card, Notice, PageHeader, Pill, Progress, SectionLabel } from "../components/ui";
import { ComfySettings } from "./settings/ComfySettings";
import { LlmSettings } from "./settings/LlmSettings";
import { StorageSettings } from "./settings/StorageSettings";
import { Acknowledgements } from "./settings/Acknowledgements";

const GROUP_LABEL: Record<AssetInfo["group"], string> = {
  tool: "Araç",
  tracking: "Takip",
  people: "Kişi algılama",
  faces: "Yüz algılama",
  shots: "Sahne kesitleri",
  cutout: "Arka plan ayırma",
  render: "Video oluşturma",
  llm: "Komut asistanı",
};

type Tab = "general" | "comfy" | "llm" | "storage";
const TABS: [Tab, string][] = [
  ["general", "GPU ve Modeller"],
  ["comfy", "ComfyUI"],
  ["llm", "Yapay Zekâ Asistanı"],
  ["storage", "Depolama"],
];

/** Ayarlar: GPU, modeller, ComfyUI, asistan ve depolama. */
export function Settings({ system, onChanged }: { system: SystemInfo | null; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>("general");
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Ayarlar" subtitle="GPU, yapay zekâ modelleri, araçlar, ComfyUI ve diskte saklanan dosyalar." />
      <div className="flex pb-6">
        <div className="flex rounded-full border border-stroke bg-well p-1">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-full px-3.5 py-1.5 text-body font-semibold transition-colors ${
                tab === id ? "bg-selection text-text" : "text-muted hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        <div className="flex max-w-[860px] flex-col gap-6 pb-8">
          {tab === "general" && <General system={system} onChanged={onChanged} />}
          {tab === "comfy" && <ComfySettings system={system} />}
          {tab === "llm" && <LlmSettings />}
          {tab === "storage" && <StorageSettings />}
        </div>
      </div>
    </div>
  );
}

function General({ system, onChanged }: { system: SystemInfo | null; onChanged: () => void }) {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [progress, setProgress] = useState<Record<string, AssetProgress>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const refresh = () => api.assets().then(setAssets);

  useEffect(() => {
    refresh();
    const unlisten = api.onAssetProgress((p) => setProgress((all) => ({ ...all, [p.id]: p })));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const run = async (id: string, action: (id: string) => Promise<void>) => {
    setErrors(({ [id]: _, ...rest }) => rest);
    setProgress((all) => ({ ...all, [id]: { id, done: 0, total: 1 } }));
    try {
      await action(id);
    } catch (e) {
      setErrors((all) => ({ ...all, [id]: String(e) }));
    } finally {
      setProgress(({ [id]: _, ...rest }) => rest);
      await refresh();
      onChanged();
    }
  };

  const missing = assets.filter((a) => a.status === "missing");
  const problem = system?.gpuProblem;
  return (
    <>
      <div>
        <SectionLabel>GPU</SectionLabel>
        <Card className="p-5">
          {system?.gpus.length ? (
            system.gpus.map((gpu) => (
              <div key={gpu.name} className="flex items-center justify-between">
                <div>
                  <div className="text-row font-semibold">{gpu.name}</div>
                  <div className="text-note text-muted">
                    {Math.round(gpu.memoryMb / 1024)} GB · sürücü {gpu.driver}
                  </div>
                </div>
                <Pill tone={problem?.blocks ? "bad" : problem ? "warn" : "good"}>{problem?.blocks ? "Kullanılamıyor" : "CUDA"}</Pill>
              </div>
            ))
          ) : null}
          {problem && (
            <div className={system?.gpus.length ? "mt-3" : ""}>
              <Notice tone={problem.blocks ? "bad" : "warn"} title={problem.message}>
                {problem.advice}
              </Notice>
            </div>
          )}
          {system?.renderModel && (
            <div className="mt-3 text-note text-muted">Video modeli: {system.renderModel}</div>
          )}
        </Card>
      </div>

      <div>
        <SectionLabel
          trailing={missing.length ? `${formatBytes(missing.reduce((s, a) => s + a.size, 0))} indirme gerekli` : "Tüm bileşenler kurulu"}
        >
          Modeller ve Araçlar
        </SectionLabel>
        <Card className="divide-y divide-stroke">
          {assets.map((asset) => {
            const p = progress[asset.id];
            return (
              <div key={asset.id} className="flex items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-row font-semibold">{asset.title}</span>
                    <Pill>{GROUP_LABEL[asset.group]}</Pill>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-note text-muted">
                    {formatBytes(asset.size)} · {asset.license} ·
                    <button className="inline-flex items-center gap-1 hover:text-text" onClick={() => openUrl(asset.source)}>
                      kaynak <ExternalLink size={11} />
                    </button>
                  </div>
                  {p && (
                    <div className="mt-2 flex items-center gap-3">
                      <Progress value={p.total ? p.done / p.total : 0} />
                      <span className="w-24 text-right text-meta text-faint tabular-nums">
                        {formatBytes(p.done)} / {formatBytes(p.total)}
                      </span>
                    </div>
                  )}
                  {errors[asset.id] && <div className="mt-1 text-note text-danger">{errors[asset.id]}</div>}
                </div>
                {asset.status === "installed" ? (
                  <div className="flex items-center gap-3">
                    <Pill tone="good">Kurulu</Pill>
                    <Button variant="link" onClick={() => run(asset.id, api.remove)}>
                      Kaldır
                    </Button>
                  </div>
                ) : (
                  <Button disabled={!!p} onClick={() => run(asset.id, api.install)}>
                    {p ? "İndiriliyor…" : "İndir"}
                  </Button>
                )}
              </div>
            );
          })}
        </Card>
        <p className="mt-2 px-1 text-note text-faint">
          Her dosya sabitlenmiş sürümden indirilir ve kullanılmadan önce SHA-256 ile doğrulanır. Saklama konumu:{" "}
          {system?.assetsDir ?? "…"}.
        </p>
      </div>

      <div>
        <SectionLabel>Hakkında</SectionLabel>
        <Card className="p-5 text-note text-muted">
          Merogi AI {system?.appVersion} · {system?.os} · {system?.ffmpeg ?? "FFmpeg kurulu değil"}
          <Acknowledgements />
        </Card>
      </div>
    </>
  );
}
