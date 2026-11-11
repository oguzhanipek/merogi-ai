import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Cpu, Layers, RotateCw, Square, Trash2 } from "lucide-react";
import { jobName, jobsApi, sourceVideo, type GpuHolder, type Job, type JobStep, type SystemInfo } from "../lib/api";
import { useJobs } from "../lib/useJobs";
import { Busy, Button, Card, EmptyState, Notice, PageHeader, Pill, SectionLabel } from "../components/ui";

const STEPS: { title: string; steps: JobStep[] }[] = [
  { title: "Hazırlık", steps: ["prep"] },
  { title: "Yükleme", steps: ["upload"] },
  { title: "Oluşturma", steps: ["queued", "rendering"] },
  { title: "İndirme", steps: ["downloading"] },
  { title: "Tamamlama", steps: ["finishing"] },
];

/** Jobs, as in Swapjutsu: only the work on its way and what stopped; finished renders are in Library. */
export function Jobs({ system, onCreate }: { system: SystemInfo | null; onCreate: () => void }) {
  const { jobs, reload } = useJobs();
  const [holder, setHolder] = useState<GpuHolder | null>(null);

  useEffect(() => {
    const poll = () => jobsApi.gpuHolder().then(setHolder).catch(() => setHolder(null));
    poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, []);

  const newest = (a: Job, b: Job) => b.created - a.created;
  const active = (jobs ?? []).filter((j) => !j.end);
  const running = active.filter((j) => j.detail !== "").sort(newest);
  const waiting = active.filter((j) => j.detail === "").sort(newest);
  const stopped = (jobs ?? []).filter((j) => j.end && j.end.status !== "done").sort(newest);
  const sections = (
    [
      ["Çalışıyor", running],
      ["Bekliyor", waiting],
      ["Durduruldu", stopped],
    ] as const
  ).filter(([, items]) => items.length);
  const problem = system?.gpuProblem;

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="İşlemler" subtitle="Devam eden hazırlık ve video oluşturma işlemlerini buradan takip edebilirsin." />
      <div className="flex flex-col gap-3 pb-4">
        {problem && (
          <Notice tone={problem.blocks ? "bad" : "warn"} title={problem.message}>
            {problem.advice}
          </Notice>
        )}
        {holder && (
          <div className="flex items-center gap-2 text-note text-muted">
            <Cpu size={14} className="text-accent" />
            GPU kullanılıyor: {holder.name}
          </div>
        )}
      </div>
      {jobs && sections.length === 0 ? (
        <div className="min-h-0 flex-1">
          <EmptyState
            icon={<Layers size={36} />}
            title="Devam eden işlem yok"
            note="Hazırlık ve video oluşturma işlemlerini Oluştur bölümünden başlatabilirsin. Tamamlanan videolar Kütüphane bölümünde görünür."
            action={{ label: "Oluştur bölümüne git", onClick: onCreate }}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-2 pb-6">
          {sections.map(([title, items]) => (
            <div key={title} className="pb-4">
              <SectionLabel trailing={String(items.length)}>{title}</SectionLabel>
              <div className="flex flex-col gap-3">
                {items.map((job) => (
                  <JobRow key={job.id} job={job} onKaldırd={reload} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JobRow({ job, onKaldırd }: { job: Job; onKaldırd: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const active = !job.end;
  const run = (action: () => Promise<unknown>, then?: () => void) => {
    setError(null);
    action()
      .then(then)
      .catch((e) => setError(String(e)));
  };
  const reached = STEPS.findIndex((s) => s.steps.includes(job.step));
  const quality = job.spec.settings.quality === "final" ? "Son çıktı" : "Taslak";
  const status =
    job.end?.status === "failed" ? "Failed" : job.end?.status === "cancelled" ? "İptal etled" : job.detail ? "Running" : "Waiting";
  const detail =
    job.end?.status === "failed"
      ? job.end.reason
      : job.end?.status === "cancelled"
        ? "İptal edildi. Yeniden deneme işlemi kaldığı adımdan başlatır."
        : job.detail || "Önceki işlemin tamamlanması bekleniyor.";

  return (
    <Card className="flex gap-4 p-4">
      <video
        src={convertFileSrc(sourceVideo(job))}
        preload="metadata"
        muted
        className={`h-24 w-42 shrink-0 rounded-field bg-well object-cover ${active ? "" : "opacity-60"}`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="truncate text-row font-semibold">{jobName(job)}</span>
          <Pill tone={job.end?.status === "failed" ? "bad" : job.end ? "neutral" : "good"}>
            {quality} · {status}
          </Pill>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {active ? (
              <Button onClick={() => run(() => jobsApi.cancel(job.id))}>
                <span className="inline-flex items-center gap-1.5">
                  <Square size={12} /> İptal et
                </span>
              </Button>
            ) : (
              <>
                <Button onClick={() => run(() => jobsApi.retry(job.id))}>
                  <span className="inline-flex items-center gap-1.5">
                    <RotateCw size={13} /> Yeniden dene
                  </span>
                </Button>
                {confirming ? (
                  <>
                    <Button variant="link" className="text-danger" onClick={() => run(() => jobsApi.remove(job.id), onKaldırd)}>
                      Geri Dönüşüm Kutusu'na taşı
                    </Button>
                    <Button variant="link" onClick={() => setConfirming(false)}>
                      Sakla
                    </Button>
                  </>
                ) : (
                  <Button aria-label="Kaldır" title="Move the job's folder to the Recycle Bin" onClick={() => setConfirming(true)}>
                    <Trash2 size={14} />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
        <Steps reached={reached} active={active} failed={job.end?.status === "failed"} skipPrep={job.spec.source.kind === "prepared"} />
        <div className={`text-note whitespace-pre-wrap ${job.end?.status === "failed" ? "text-danger select-text" : "text-muted"} ${active ? "line-clamp-2" : ""}`}>
          {detail}
        </div>
        {active && job.detail && <Busy />}
        {error && <div className="text-note text-danger">{error}</div>}
      </div>
    </Card>
  );
}

/** "✓ Prep — 2 Upload — 3 Render — 4 Download — 5 Finish", as Swapjutsu's WorkSteps. */
function Steps({ reached, active, failed, skipPrep }: { reached: number; active: boolean; failed: boolean; skipPrep: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, index) => {
        const state = (skipPrep && index === 0) || index < reached ? "done" : index > reached ? "later" : active ? "now" : failed ? "failed" : "stopped";
        const dot = {
          done: "bg-glass text-accent",
          now: "bg-accent text-ink",
          later: "border border-glass-stroke text-faint",
          failed: "border border-danger text-danger",
          stopped: "border border-glass-stroke text-muted",
        }[state];
        return (
          <div key={step.title} className="flex items-center gap-2">
            {index > 0 && <div className={`h-px w-6 ${state === "later" ? "bg-stroke" : "bg-accent/40"}`} />}
            <span className={`grid size-4.5 place-items-center rounded-full text-[10px] font-bold ${dot}`}>
              {state === "done" ? "✓" : state === "failed" ? "!" : index + 1}
            </span>
            <span className={`text-meta font-semibold ${state === "later" ? "text-faint" : state === "failed" ? "text-danger" : "text-text"}`}>
              {step.title}
            </span>
          </div>
        );
      })}
    </div>
  );
}
