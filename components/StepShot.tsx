type StepShotProps = {
  title: string;
  subtitle?: string;
  badge?: string;
  imgSrc?: string; // optional later
  alt?: string;
};

export function StepShot({ title, subtitle, badge, imgSrc, alt }: StepShotProps) {
  return (
    <div className="mb-6">
      <div className="relative rounded-2xl border border-slate-700 bg-slate-950/50 overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,.35)]">
        {/* top status bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
            <span className="text-[10px] text-slate-400">Tallypadi • WhatsApp</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-5 rounded-full bg-slate-700" />
            <span className="h-1.5 w-3 rounded-full bg-slate-700" />
            <span className="h-1.5 w-4 rounded-full bg-slate-700" />
          </div>
        </div>

        {/* content area */}
        <div className="relative aspect-[16/10] w-full">
          {/* image (optional) */}
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc}
              alt={alt || title}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center p-6">
              <div className="text-center">
                {badge ? (
                  <div className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-200">
                    {badge}
                  </div>
                ) : null}
                <div className="mt-3 text-slate-100 font-semibold">{title}</div>
                {subtitle ? <div className="mt-1 text-slate-500 text-xs">{subtitle}</div> : null}

                {/* tiny dummy bubbles */}
                <div className="mt-5 grid gap-2">
                  <div className="ml-auto w-3/4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                    <div className="h-2 w-2/3 rounded bg-emerald-300/30" />
                  </div>
                  <div className="w-4/5 rounded-2xl bg-slate-900/60 border border-slate-700 px-3 py-2">
                    <div className="h-2 w-1/2 rounded bg-slate-300/20" />
                  </div>
                  <div className="ml-auto w-2/3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                    <div className="h-2 w-3/5 rounded bg-emerald-300/30" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* glare */}
          <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rotate-12 rounded-full bg-white/10 blur-2xl" />
          {/* edge vignette */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_80%_at_50%_10%,transparent_50%,rgba(0,0,0,.35)_100%)]" />
        </div>

        {/* bottom bar */}
        <div className="px-4 py-2 border-t border-slate-800 bg-slate-950/60">
          <div className="h-1.5 w-16 rounded-full bg-slate-700 mx-auto" />
        </div>
      </div>
    </div>
  );
}
