import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { Card, PageHeader, SectionLabel } from "../components/ui";
import { clipApi, joinPath, timecode, type ClipView, type SourceInfo } from "../lib/api";
import { IMAGE_EXTENSIONS, pickImage } from "./create/Characters";
import { ClipWorkspace, title } from "./create/ClipWorkspace";
import { NewClip } from "./create/NewClip";
import { finished } from "./create/Player";
import { fileUrl } from "./create/Step";

const VIDEO_EXTENSIONS = ["mp4", "mov", "mkv", "webm", "avi", "m4v", "mpg", "mpeg", "wmv", "flv", "ogv", "ts", "mts", "3gp"];
const isImage = (path: string) => IMAGE_EXTENSIONS.includes(path.split(".").pop()?.toLowerCase() ?? "");

/** Oluştur: video yüklemeden taslağa veya son çıktıya kadar tek ekranda. */
export function Create({ onOpenLibrary }: { onOpenLibrary?: () => void }) {
  const [clips, setClips] = useState<ClipView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [source, setSource] = useState<SourceInfo | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const clip = clips.find((c) => c.id === selected) ?? null;
  const current = useRef(clip);
  current.current = clip;

  const refresh = () => clipApi.list().then(setClips, () => {});
  useEffect(() => {
    refresh();
    const changed = clipApi.onClip((view) =>
      setClips((all) => (all.some((c) => c.id === view.id) ? all.map((c) => (c.id === view.id ? view : c)) : [view, ...all])),
    );
    const jobs = clipApi.onJob(() => refresh());
    return () => {
      changed.then((f) => f());
      jobs.then((f) => f());
    };
  }, []);

  const read = async (path: string) => {
    setSelected(null);
    setReading(true);
    setError(null);
    try {
      setSource(await clipApi.probe(path));
    } catch (e) {
      setError(String(e));
    } finally {
      setReading(false);
    }
  };

  const choose = async () => {
    const path = await open({ multiple: false, filters: [{ name: "Videolar", extensions: VIDEO_EXTENSIONS }] });
    if (typeof path === "string") read(path);
  };

  const setCharacter = async (person: number, image?: string) => {
    const target = current.current;
    const path = image ?? (await pickImage());
    if (!target || !path) return;
    setBusy((b) => [...b, person]);
    setFailure(null);
    try {
      await clipApi.setCharacter(target.id, person, path);
    } catch (e) {
      setFailure(String(e));
    } finally {
      setBusy((b) => b.filter((p) => p !== person));
    }
  };

  useEffect(() => {
    const dropped = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type !== "drop") return;
      const image = e.payload.paths.find(isImage);
      const target = current.current;
      if (image && target?.manifest) {
        const person = target.targets.find((p) => !target.characters[String(p)]) ?? target.targets[0];
        if (person !== undefined) setCharacter(person, image);
        return;
      }
      const video = e.payload.paths.find((p) => !isImage(p));
      if (video) read(video);
    });
    return () => {
      dropped.then((f) => f());
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Oluştur"
        subtitle="Videonu GPU üzerinde hazırla, kişileri seç ve önce taslak ardından son videonu oluştur."
      />
      <div className="flex min-h-0 flex-1 gap-5">
        <Card className="flex w-[260px] shrink-0 flex-col overflow-y-auto p-2">
          <NewClipRow source={source} selected={selected === null} onClick={() => setSelected(null)} />
          {clips.length > 0 && (
            <div className="mt-4">
              <SectionLabel trailing={String(clips.length)}>Videolar</SectionLabel>
              <div className="flex flex-col gap-1">
                {clips.map((c) => (
                  <ClipRow key={c.id} clip={c} selected={c.id === selected} onClick={() => setSelected(c.id)} />
                ))}
              </div>
            </div>
          )}
        </Card>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {failure && <p className="text-note text-danger">{failure}</p>}
          <div className="min-h-0 flex-1">
            {clip ? (
              <ClipWorkspace
                key={clip.id}
                clip={clip}
                busy={busy}
                onPick={(p) => setCharacter(p)}
                onRemoved={() => {
                  setSelected(null);
                  refresh();
                }}
                onOpenLibrary={onOpenLibrary}
              />
            ) : (
              <NewClip
                source={source}
                reading={reading}
                error={error}
                onChoose={choose}
                onClear={() => setSource(null)}
                onCreated={(id) => {
                  setSource(null);
                  setSelected(id);
                  refresh();
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewClipRow({ source, selected, onClick }: { source: SourceInfo | null; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-field border p-2 text-left transition-colors ${
        selected ? "border-accent bg-glass" : "border-dashed border-stroke hover:bg-well"
      }`}
    >
      <span className="grid h-10 w-16 shrink-0 place-items-center rounded-small bg-well text-accent">
        <Plus size={16} strokeWidth={2.5} />
      </span>
      <span className="min-w-0">
        <span className="block text-body font-semibold">Yeni video</span>
        <span className="block truncate text-meta text-faint">
          {source ? source.path.split(/[\\/]/).pop() : "Video bırak veya seç · 4–30 sn"}
        </span>
      </span>
    </button>
  );
}

/** Hazırlanıyor, karakter bekliyor, oluşturuluyor, taslak hazır… */
function status(clip: ClipView): string {
  if (clip.running) return `${clip.running.stage} · %${Math.round(clip.running.fraction * 100)}`;
  if (!clip.manifest) return clip.error ? "Hazırlık başarısız" : "Hazırlanmadı";
  const active = clip.jobs.find((j) => !j.end);
  if (active) return active.step === "rendering" ? "Oluşturuluyor" : "Sırada";
  const missing = clip.targets.filter((p) => !clip.characters[String(p)]).length;
  if (missing) return missing === 1 ? "Karakter bekleniyor" : `${missing} karakter bekleniyor`;
  const done = finished(clip);
  if (done.length) return `${done.length} çıktı`;
  return "Oluşturmaya hazır";
}

function ClipRow({ clip, selected, onClick }: { clip: ClipView; selected: boolean; onClick: () => void }) {
  const still = clip.prepDir ? clip.prepDir : null;
  const busy = !!clip.running || clip.jobs.some((j) => !j.end);
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-field border p-2 text-left transition-colors ${
        selected ? "border-accent bg-glass" : "border-transparent hover:bg-well"
      }`}
    >
      <span className="h-10 w-16 shrink-0 overflow-hidden rounded-small bg-well">
        {still && (
          <video src={`${fileUrl(joinPath(still, "normalized.mp4"))}#t=0.5`} muted preload="metadata" className="h-full w-full object-cover" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-semibold">{title(clip)}</span>
        <span className="block truncate text-meta text-faint tabular-nums">
          {timecode(clip.duration)} · {status(clip)}
        </span>
      </span>
      {busy && <LoaderCircle size={14} className="shrink-0 animate-spin text-accent" />}
    </button>
  );
}
