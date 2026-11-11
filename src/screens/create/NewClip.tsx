import { useEffect, useRef, useState } from "react";
import { Clapperboard, Film, Scissors, X } from "lucide-react";
import { clipApi, timecode, type SourceInfo } from "../../lib/api";
import { Button } from "../../components/ui";
import { MAX_SECONDS, TrimStrip, type Range } from "./TrimStrip";
import { Note, StageAndSide, Step, fileUrl } from "./Step";

/** Yeni video: dosya seçme alanından kırpma ve hazırlık adımlarına uzanan akış. */
export function NewClip({
  source,
  reading,
  error,
  onChoose,
  onClear,
  onCreated,
}: {
  source: SourceInfo | null;
  reading: boolean;
  error: string | null;
  onChoose: () => void;
  onClear: () => void;
  onCreated: (id: string) => void;
}) {
  if (!source) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-stroke bg-well p-10 text-center">
        <Clapperboard size={36} className="text-faint" />
        <div className="text-row font-semibold">{reading ? "Video okunuyor…" : "Başlamak için bir video bırak"}</div>
        <p className="max-w-sm text-note text-muted">
          FFmpeg'in okuyabildiği video biçimleri desteklenir. Merogi AI videodaki kişileri bulur, seçtiğin kişiyi
          sahneler boyunca takip eder ve yerine referans karakterini yerleştirir. Dosyaların bilgisayarından çıkmaz.
        </p>
        {error && <Note tone="bad">{error}</Note>}
        <Button variant="primary" onClick={onChoose} disabled={reading}>
          <span className="flex items-center gap-2">
            <Film size={16} /> Video Seç…
          </span>
        </Button>
      </div>
    );
  }
  return <Trim key={source.path} source={source} onChoose={onChoose} onClear={onClear} onCreated={onCreated} />;
}

function Trim({
  source,
  onChoose,
  onClear,
  onCreated,
}: {
  source: SourceInfo;
  onChoose: () => void;
  onClear: () => void;
  onCreated: (id: string) => void;
}) {
  const [range, setRange] = useState<Range>({ start: 0, end: Math.min(source.duration, MAX_SECONDS) });
  const [url, setUrl] = useState(fileUrl(source.path));
  const [converting, setConverting] = useState(false);
  const [strip, setStrip] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const name = source.path.split(/[\\/]/).pop() ?? "Video";

  useEffect(() => {
    clipApi.strip(source.path, source.duration).then(setStrip, () => setStrip(null));
  }, [source]);

  const unplayable = () => {
    if (converting) return;
    setConverting(true);
    clipApi.playable(source.path).then(
      (p) => setUrl(fileUrl(p)),
      (e) => setFailure(String(e)),
    );
  };

  const scrub = (t: number) => {
    if (video.current) video.current.currentTime = t;
  };

  const keepInRange = () => {
    const v = video.current;
    if (v && !v.paused && (v.currentTime >= range.end || v.currentTime < range.start - 0.1)) {
      v.currentTime = range.start;
    }
  };

  const prepare = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const clip = await clipApi.create(source.path, range.start, range.end - range.start);
      onCreated(clip.id);
    } catch (e) {
      setFailure(String(e));
    } finally {
      setBusy(false);
    }
  };

  const seconds = `${(range.end - range.start).toFixed(1)} sn`;
  return (
    <div className="flex h-full flex-col gap-5 rounded-card border border-stroke bg-card p-6">
      <header className="flex items-end gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-display text-[30px] leading-none font-extrabold uppercase">{name}</h2>
          <p className="mt-1 text-muted">
            Yeni video · {timecode(source.duration)} · {source.width}×{source.height}
            {source.hasAudio ? "" : " · ses yok"}
          </p>
        </div>
        <span className="ml-auto flex gap-2">
          <Button onClick={onChoose} title="Başka bir video seç">
            <span className="flex items-center gap-2">
              <Film size={14} /> Videoyu Değiştir…
            </span>
          </Button>
          <Button onClick={onClear} title="Bu videoyu kaldır">
            <span className="flex items-center gap-2">
              <X size={14} /> Temizle
            </span>
          </Button>
        </span>
      </header>
      <StageAndSide
        stage={
          <div className="flex flex-col gap-4">
            <video
              ref={video}
              src={url}
              controls
              onError={unplayable}
              onTimeUpdate={keepInRange}
              onLoadedMetadata={() => scrub(range.start)}
              className="aspect-video w-full rounded-media bg-black object-contain"
            />
            {converting && url === fileUrl(source.path) && (
              <Note tone="faint">Önizleme dönüştürülüyor…</Note>
            )}
            <TrimStrip duration={source.duration} strip={strip} range={range} onChange={setRange} onScrub={scrub} />
          </div>
        }
        side={
          <div className="flex flex-col gap-6">
            <Step number={1} title="Video" detail={seconds} state="done">
              <Note>Oynatıcının altından değiştirmek istediğin bölümü 4–30 saniye olacak şekilde kırp.</Note>
            </Step>
            <Step number={2} title="Hazırlık" detail="Bu GPU üzerinde">
              <Note>
                Sahne kesitlerini ve kişileri bulur, kişileri sahneler boyunca takip eder ve maskelerini oluşturur.
                İşlem birkaç saniye ile bir dakika sürebilir; dosyaların hiçbir yere gönderilmez.
              </Note>
            </Step>
            <Step number={3} title="Karakterler" state="later">
              <Note tone="faint">Değiştirmek istediğin her kişi için bir referans fotoğrafı ekle.</Note>
            </Step>
            <Step number={4} title="Komut" detail="İsteğe bağlı" state="later">
              <Note tone="faint">Video ve karaktere göre otomatik hazırlanır; istersen düzenleyebilirsin.</Note>
            </Step>
            <Step number={5} title="Oluştur" state="later">
              <Note tone="faint">Önce kontrol için kısa bir taslak, ardından videonun tamamı GPU üzerinde işlenir.</Note>
            </Step>
          </div>
        }
      />
      <footer className="flex items-center gap-3 border-t border-stroke pt-4">
        <span className={`text-note ${failure ? "text-danger" : "text-muted"}`}>
          {failure ?? `${timecode(range.start)}–${timecode(range.end)} · ${seconds}; sırada karakter seçimi ve video oluşturma var.`}
        </span>
        <Button variant="primary" className="ml-auto" onClick={prepare} disabled={busy}>
          <span className="flex items-center gap-2">
            <Scissors size={16} /> Videoyu Hazırla
          </span>
        </Button>
      </footer>
    </div>
  );
}
