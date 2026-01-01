type StepShotProps = {
  badge?: string;
  title?: string;
  subtitle?: string;
  imgSrc?: string; // optional later
  alt?: string;
  accent?: "emerald" | "blue";
  bubbles?: Array<{ side: "bot" | "user"; text: string }>;
};

export function StepShotWhatsApp({
  badge = "STEP",
  title = "TallyPadi",
  subtitle = "WhatsApp",
  imgSrc,
  alt,
  accent = "emerald",
  bubbles,
}: StepShotProps) {
  const isBlue = accent === "blue";

  const defaultBubbles: Array<{ side: "bot" | "user"; text: string }> = [
    { side: "bot", text: "Hi 👋 I’m TallyPadi. Let’s set you up." },
    { side: "user", text: "Create account: snow@email.com / ********" },
    { side: "bot", text: "Done ✅ What’s your shop name?" },
  ];

  const chat = bubbles?.length ? bubbles : defaultBubbles;

  return (
    <div className="mb-6">
      <div className="relative rounded-2xl border border-slate-700 overflow-hidden shadow-[0_20px_70px_rgba(0,0,0,.45)] bg-slate-950/60">
        {/* WhatsApp header */}
        <div className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-gradient-to-r from-emerald-700/70 via-emerald-600/60 to-emerald-700/70">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="h-9 w-9 rounded-full bg-white/10 border border-white/15 grid place-items-center">
              <div className="h-5 w-5 rounded bg-white/20" />
            </div>
            <div className="leading-tight">
              <div className="text-white font-semibold text-sm">TallyPadi</div>
              <div className="text-white/70 text-[11px]">{subtitle}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/80 rounded-full border border-white/15 bg-white/10 px-2 py-1">
              {badge}
            </span>
            <div className="h-7 w-7 rounded-full bg-white/10 border border-white/15" />
          </div>
        </div>

        {/* Chat area */}
        <div className="relative aspect-[16/10] w-full">
          {/* Optional real screenshot layer */}
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc}
              alt={alt || "Step image"}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <>
              {/* WhatsApp-ish wallpaper */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#0b3b2d] via-[#0a2e26] to-[#071f1a]" />
              <div className="absolute inset-0 opacity-35">
                {/* subtle doodle pattern */}
                <div className="absolute -top-10 -left-10 h-72 w-72 rounded-full bg-white/5 blur-2xl" />
                <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-black/30 blur-2xl" />
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 800 500"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <pattern id="waDots" width="48" height="48" patternUnits="userSpaceOnUse">
                      <circle cx="10" cy="12" r="1.2" fill="rgba(255,255,255,.10)" />
                      <circle cx="26" cy="26" r="1.2" fill="rgba(255,255,255,.08)" />
                      <circle cx="40" cy="14" r="1.2" fill="rgba(255,255,255,.06)" />
                      <path
                        d="M6 34c8-6 16-6 24 0"
                        stroke="rgba(255,255,255,.07)"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                      />
                      <path
                        d="M34 40c6-4 12-4 18 0"
                        stroke="rgba(255,255,255,.06)"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                      />
                    </pattern>
                  </defs>
                  <rect width="800" height="500" fill="url(#waDots)" />
                </svg>
              </div>

              {/* Title chip inside chat */}
              <div className="absolute left-4 top-4">
                <div
                  className={[
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] text-white/85",
                    isBlue
                      ? "border-blue-300/25 bg-blue-500/15"
                      : "border-emerald-300/25 bg-emerald-500/15",
                  ].join(" ")}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                  {title}
                </div>
              </div>

              {/* Chat bubbles */}
              <div className="absolute inset-x-0 top-12 bottom-14 px-4 py-3 space-y-2 overflow-hidden">
                {chat.slice(0, 5).map((b, i) => {
                  const isUser = b.side === "user";
                  return (
                    <div key={i} className={isUser ? "flex justify-end" : "flex justify-start"}>
                      <div
                        className={[
                          "max-w-[82%] rounded-2xl px-3 py-2 text-[12px] leading-snug border shadow-sm",
                          isUser
                            ? isBlue
                              ? "bg-blue-500/20 border-blue-300/25 text-white"
                              : "bg-emerald-500/20 border-emerald-300/25 text-white"
                            : "bg-slate-950/60 border-white/10 text-white/90",
                        ].join(" ")}
                      >
                        {b.text}
                        <div className="mt-1 text-[10px] text-white/45 text-right">12:{10 + i} PM</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Input bar */}
              <div className="absolute inset-x-0 bottom-0 p-3">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 px-3 py-2">
                  <div className="h-7 w-7 rounded-full bg-white/10 border border-white/10" />
                  <div className="flex-1">
                    <div className="h-2.5 w-2/3 rounded bg-white/10" />
                  </div>
                  <div
                    className={[
                      "h-8 w-8 rounded-full grid place-items-center border",
                      isBlue
                        ? "bg-blue-500/20 border-blue-300/20"
                        : "bg-emerald-500/20 border-emerald-300/20",
                    ].join(" ")}
                  >
                    <div className="h-3 w-3 rounded bg-white/30" />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Glass glare + vignette to look like a “real screenshot” */}
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rotate-12 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_0%,transparent_55%,rgba(0,0,0,.45)_100%)]" />
        </div>
      </div>
    </div>
  );
}
