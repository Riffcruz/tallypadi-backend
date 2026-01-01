import React from "react";

type Bubble = {
  side: "user" | "bot";
  text: string;
  time?: string;
  cardTitle?: string;
};

type WhatsAppMockProps = {
  badge?: string;
  headerTitle?: string;
  status?: string;
  imgSrc?: string;
  alt?: string;
  bubbles?: Bubble[];
  showTodayPill?: boolean;
};

export default function StepShotWhatsAppLight({
  badge = "STEP",
  headerTitle = "TallyPadi",
  status = "Online",
  imgSrc,
  alt,
  bubbles,
  showTodayPill = true,
}: WhatsAppMockProps) {
  const chat: Bubble[] =
    bubbles?.length
      ? bubbles
      : [
          { side: "user", text: "Add 50 bags of Rice at 40k", time: "10:00 AM" },
          {
            side: "bot",
            cardTitle: "Tallypadi",
            text: "✅ Stock Added!\nItem: Rice\nQty: 50 Bags\nPrice: ₦40,000/bag",
            time: "10:00 AM",
          },
          { side: "user", text: "Sold 2 Rice", time: "12:30 PM" },
          {
            side: "bot",
            cardTitle: "Tallypadi",
            text: "💰 Sale Recorded!\nYou made: ₦80,000\nWarning: Stock is low!",
            time: "12:30 PM",
          },
        ];

  // responsive bubble text size
  const bubbleText =
    "text-[clamp(11px,1.1vw,14px)] leading-[1.25] sm:leading-snug whitespace-pre-wrap break-words";

  return (
    <div className="mb-6">
      <div className="relative rounded-[28px] border border-slate-800/70 bg-slate-950/60 shadow-[0_25px_80px_rgba(0,0,0,.55)] overflow-hidden">
        {/* Notch */}
        <div className="absolute left-1/2 top-0 z-20 h-6 w-36 -translate-x-1/2 rounded-b-2xl bg-slate-900/80 border-x border-b border-white/5" />

        <div className="relative z-10 overflow-hidden rounded-[26px]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#1F6F5B] text-white">
            {/* left */}
            <div className="flex items-center gap-3 w-[calc(100%-76px)]">
              <div className="h-9 w-9 shrink-0 rounded-full bg-white/15 border border-white/20 grid place-items-center">
                <span className="text-xs font-bold">TP</span>
              </div>

              {/* width-capped so it truncates cleanly (no min-w-0) */}
              <div className="w-[calc(100%-48px)]">
                <div className="font-semibold text-[clamp(12px,1.4vw,15px)] truncate">
                  {headerTitle}
                </div>
                <div className="text-[clamp(10px,1.1vw,12px)] text-white/80 truncate">
                  {status}
                </div>
              </div>
            </div>

            {/* right */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">
                {badge}
              </span>
              <span className="h-8 w-8 rounded-full bg-white/10 border border-white/15" />
            </div>
          </div>

          {/* ✅ Responsive height: NO more clipped text */}
          <div className="relative w-full h-[clamp(320px,44vw,520px)]">
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgSrc}
                alt={alt || "WhatsApp preview"}
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <>
                {/* Wallpaper */}
                <div className="absolute inset-0 bg-[#E9E2D8]" />

                <svg
                  className="absolute inset-0 h-full w-full opacity-[0.14]"
                  viewBox="0 0 800 1000"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <pattern id="waLightDoodles_tp" width="120" height="120" patternUnits="userSpaceOnUse">
                      <path d="M20 30c10-10 30-10 40 0" stroke="#000" strokeOpacity=".25" strokeWidth="2" fill="none" strokeLinecap="round"/>
                      <path d="M70 70c8-8 24-8 32 0" stroke="#000" strokeOpacity=".22" strokeWidth="2" fill="none" strokeLinecap="round"/>
                      <circle cx="28" cy="78" r="10" stroke="#000" strokeOpacity=".18" strokeWidth="2" fill="none"/>
                      <path d="M90 30l16 10-16 10-16-10z" stroke="#000" strokeOpacity=".16" strokeWidth="2" fill="none"/>
                      <path d="M18 102c14-10 28-10 42 0" stroke="#000" strokeOpacity=".14" strokeWidth="2" fill="none" strokeLinecap="round"/>
                      <circle cx="98" cy="96" r="6" stroke="#000" strokeOpacity=".14" strokeWidth="2" fill="none"/>
                    </pattern>
                  </defs>
                  <rect width="800" height="1000" fill="url(#waLightDoodles_tp)" />
                </svg>

                {/* TODAY pill */}
                {showTodayPill && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
                    <div className="rounded-full bg-white/75 border border-slate-300/60 px-4 py-1.5 text-[10px] sm:text-xs font-semibold text-slate-600 shadow-sm">
                      TODAY
                    </div>
                  </div>
                )}

                {/* ✅ Chat messages (scrollable so nothing hides) */}
                <div
                  className={[
                    "absolute inset-x-0",
                    "top-12 sm:top-14",
                    "bottom-16 sm:bottom-18",
                    "px-3 sm:px-4",
                    "py-2 sm:py-3",
                    "space-y-2 sm:space-y-3",
                    "overflow-y-auto",
                    "[scrollbar-width:none]",
                    "[-ms-overflow-style:none]",
                    "[&::-webkit-scrollbar]:hidden",
                  ].join(" ")}
                >
                  {chat.map((b, i) => {
                    const isUser = b.side === "user";

                    if (isUser) {
                      return (
                        <div key={i} className="flex justify-end">
                          <div className="max-w-[82%] rounded-2xl bg-[#D6F8C6] px-3 sm:px-4 py-2.5 sm:py-3 shadow-[0_6px_14px_rgba(0,0,0,.08)]">
                            <div className={`${bubbleText} text-slate-900 font-medium`}>
                              {b.text}
                            </div>

                            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] sm:text-[11px] text-slate-500">
                              <span className="whitespace-nowrap">{b.time || "10:00 AM"}</span>
                              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10 shrink-0">
                                <span className="h-2 w-2 rounded-full bg-blue-500/70" />
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={i} className="flex justify-start">
                        <div className="max-w-[86%] rounded-2xl bg-white px-3 sm:px-4 py-2.5 sm:py-3 border border-slate-200 shadow-[0_10px_22px_rgba(0,0,0,.10)]">
                          {b.cardTitle ? (
                            <div className="text-[#1F6F5B] font-semibold mb-1 sm:mb-2 text-[clamp(11px,1.1vw,13px)]">
                              {b.cardTitle}
                            </div>
                          ) : null}

                          <div className={`${bubbleText} text-slate-900`}>{b.text}</div>

                          <div className="mt-2 text-[10px] sm:text-[11px] text-slate-400 text-right whitespace-nowrap">
                            {b.time || "10:00 AM"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Input bar */}
                <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3">
                  <div className="flex items-center gap-2 sm:gap-3 rounded-full bg-white/90 border border-slate-200 px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm">
                    <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-slate-100 border border-slate-200 grid place-items-center text-slate-500 shrink-0">
                      +
                    </div>
                    <div className="flex-1 text-slate-400 text-[clamp(11px,1.2vw,14px)] truncate">
                      Type a message…
                    </div>
                    <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-[#1F6F5B] grid place-items-center shadow-[0_10px_20px_rgba(31,111,91,.25)] shrink-0">
                      <div className="h-3 w-3 rotate-45 border-t-2 border-r-2 border-white" />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* gloss */}
            <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rotate-12 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_0%,transparent_55%,rgba(0,0,0,.30)_100%)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
