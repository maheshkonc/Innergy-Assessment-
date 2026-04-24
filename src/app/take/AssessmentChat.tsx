"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type WebAction = { kind: "text"; body: string } | { kind: "image"; imageUrl: string };

type Widget =
  | { kind: "welcome" }
  | { kind: "text_input"; placeholder: string }
  | {
    kind: "question";
    questionNumber: number;
    total: number;
    sectionName: string;
    stem: string;
    options: Array<{ label: "A" | "B" | "C" | "D"; text: string }>;
  }
  | { kind: "yes_no"; context: "debrief_cta" | "coaching_interest" }
  | {
    kind: "results";
    resultId: string;
    imageUrl: string;
    overall: { score: number; maxScore: number; band: string };
    dimensions: Array<{ name: string; score: number; maxScore: number; band: string }>;
  }
  | { kind: "closed"; message: string }
  | { kind: "unsupported"; state: string };

interface ChatResponse {
  sessionId: string;
  state: string;
  actions: WebAction[];
  widget: Widget;
}

type BubbleBase = { ts: number };
type Bubble =
  | (BubbleBase & { author: "bot"; kind: "text"; body: string })
  | (BubbleBase & { author: "bot"; kind: "image"; imageUrl: string })
  | (BubbleBase & { author: "user"; kind: "text"; body: string })
  | (BubbleBase & {
    author: "user";
    kind: "answered_question";
    sectionName: string;
    questionNumber: number;
    total: number;
    stem: string;
    optionLabel: "A" | "B" | "C" | "D";
    optionText: string;
  })
  | (BubbleBase & {
    author: "bot";
    kind: "result_chart";
    dimensions: Array<{ name: string; score: number; maxScore: number; band: string }>;
    imageUrl: string;
  });

// Distributive Omit — plain Omit over a union collapses shared keys and
// loses the discriminant, which breaks the "answered_question" variant.
type BubbleInput = Bubble extends infer B ? (B extends unknown ? Omit<B, "ts"> : never) : never;

// Coach identity for the bot avatar. When you drop a real image in
// `public/rashmi.jpg` (or similar), set COACH_AVATAR_SRC to its public path
// and the avatar will switch from initials to the photo automatically.
const COACH_NAME = "Rashmi Sharma";
const COACH_AVATAR_SRC: string | null = null;

// Conversational-reveal tuning. Slower = feels more like a real person
// thinking and typing. Fast enough not to frustrate across 25 questions.
const TYPING_MS = 1100;
const BETWEEN_BUBBLES_MS = 450;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AssessmentChat({ tenantSlug }: { tenantSlug?: string }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [widget, setWidget] = useState<Widget | null>(null);
  const [state, setState] = useState<string>("loading");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const send = useCallback(
    async (
      text?: string,
      userEcho?: string | BubbleInput,
      opts?: { reset?: boolean },
    ) => {
      setBusy(true);
      setError(null);
      try {
        if (opts?.reset) {
          setBubbles([]);
          setWidget(null);
          setState("loading");
        }
        if (userEcho) {
          const bubble: Bubble =
            typeof userEcho === "string"
              ? { author: "user", kind: "text", body: userEcho, ts: Date.now() }
              : { ...userEcho, ts: Date.now() };
          setBubbles((b) => [...b, bubble]);
        }
        // Hide the prior widget while the bot is "thinking" so the UI feels
        // turn-based rather than mixed-state.
        setWidget(null);

        const res = await fetch("/api/web/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, tenantSlug, reset: opts?.reset }),
        });
        if (!res.ok) {
          const { error: err } = await res.json().catch(() => ({ error: "request failed" }));
          setError(err);
          return;
        }
        const data = (await res.json()) as ChatResponse;
        const incoming: Bubble[] = data.actions.map((a) => {
          if (a.kind === "text") {
            return { author: "bot", kind: "text", body: a.body, ts: Date.now() };
          } else {
            // If we have results data in the widget, attach it to the image bubble
            if (data.widget.kind === "results" && a.imageUrl.includes("/api/image/result/")) {
              return {
                author: "bot",
                kind: "result_chart",
                imageUrl: a.imageUrl,
                dimensions: data.widget.dimensions,
                ts: Date.now(),
              };
            }
            return { author: "bot", kind: "image", imageUrl: a.imageUrl, ts: Date.now() };
          }
        });

        // Reveal one bubble at a time with a typing indicator between,
        // matching the "someone is replying to you" feel.
        for (const b of incoming) {
          setTyping(true);
          await sleep(TYPING_MS);
          setTyping(false);
          // Re-stamp so the timestamp reflects when the user actually saw
          // the bubble, not when the response arrived.
          setBubbles((prev) => [...prev, { ...b, ts: Date.now() }]);
          await sleep(BETWEEN_BUBBLES_MS);
        }

        setState(data.state);
        setWidget(data.widget);
      } catch (err) {
        setError(err instanceof Error ? err.message : "network error");
      } finally {
        setTyping(false);
        setBusy(false);
      }
    },
    [tenantSlug],
  );

  const handleRestart = useCallback(() => {
    if (!window.confirm("Start a new assessment from scratch? Your current progress will be closed.")) return;
    void send(undefined, undefined, { reset: true });
  }, [send]);

  useEffect(() => {
    void send();
  }, [send]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles, widget, typing]);

  const progress = widget?.kind === "question" ? widget.questionNumber / widget.total : null;

  return (
    <div className="flex h-full flex-col gap-4">
      {progress !== null && (
        <ProgressBar
          value={progress}
          label={`Question ${widget && widget.kind === "question" ? widget.questionNumber : 0} of ${widget && widget.kind === "question" ? widget.total : 0}`}
        />
      )}

      <div className="flex flex-col overflow-hidden rounded-3xl border border-[var(--container-light)] bg-[var(--background)] shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--container-light)] bg-[var(--background)] px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--foreground)]">
            <span className="inline-flex h-2 w-2 rounded-full bg-[var(--accent-pink)]" />
            {state === "loading" ? "Connecting…" : stateLabel(state)}
          </div>
          <button
            onClick={handleRestart}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#8A7868] transition hover:bg-white/60 hover:text-[var(--foreground)] disabled:opacity-50"
            title="Abandon the current session and begin a new assessment"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 4v5h5" />
            </svg>
            Start over
          </button>
        </div>

        <div
          ref={scrollRef}
          className="max-h-[78vh] min-h-[520px] overflow-y-auto bg-[var(--background)] p-5 sm:p-6"
        >
          {bubbles.length === 0 && state === "loading" && (
            <div className="flex h-full items-center justify-center py-10">
              <div className="flex items-center gap-2 text-sm text-[var(--foreground)] opacity-70">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-yellow)]" />
                Loading
              </div>
            </div>
          )}
          <div className="space-y-2.5">
            {bubbles.map((b, i) => (
              <div key={i} className="innergy-bubble-in">
                <BubbleView
                  bubble={b}
                  resultsData={widget?.kind === "results" ? widget : null}
                />
              </div>
            ))}
            {typing && <TypingBubble />}
            {widget && !typing && (
              <div className="innergy-bubble-in pt-2">
                <WidgetView widget={widget} busy={busy} onSubmit={send} />
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex items-end gap-2 innergy-bubble-in">
      <Avatar who="bot" />
      <div
        className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border-l-[3px] border-[var(--accent-yellow)] bg-white px-4 py-3 shadow-sm ring-1 ring-[var(--container-light)]"
        aria-label={`${COACH_NAME} is typing`}
      >
        <span className="innergy-typing-dot h-1.5 w-1.5 rounded-full bg-[var(--foreground)]" />
        <span className="innergy-typing-dot h-1.5 w-1.5 rounded-full bg-[var(--foreground)]" />
        <span className="innergy-typing-dot h-1.5 w-1.5 rounded-full bg-[var(--foreground)]" />
      </div>
    </div>
  );
}

function Avatar({ who }: { who: "bot" | "user" }) {
  if (who === "bot") {
    return COACH_AVATAR_SRC ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={COACH_AVATAR_SRC}
        alt={COACH_NAME}
        className="h-8 w-8 shrink-0 rounded-full border border-[var(--container-light)] object-cover"
      />
    ) : (
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--container-dark)] font-serif text-sm italic text-[var(--background)] ring-1 ring-[var(--container-light)]"
        title={COACH_NAME}
      >
        i
      </div>
    );
  }
  // User avatar — generic silhouette until we wire per-session identity.
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--container-light)] text-[var(--foreground)] ring-1 ring-[var(--container-light)]"
      title="You"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5Z" />
      </svg>
    </div>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function stateLabel(state: string): string {
  switch (state) {
    case "welcome":
    case "later_reminder":
      return "Ready to begin";
    case "ask_name": return "Getting to know you";
    case "ask_org": return "Getting to know you";
    case "ask_email": return "Getting to know you";
    case "question": return "Assessment in progress";
    case "computing": return "Calculating…";
    case "debrief_cta": return "Results ready";
    case "closed":
    case "results": return "Complete";
    case "escalated": return "Paused";
    default: return state;
  }
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-[#8A7868]">
        <span className="font-medium">{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--container-light)]">
        <div
          className="h-full rounded-full bg-[var(--accent-pink)] transition-all duration-300 ease-out"
          style={{ width: `${Math.max(4, value * 100)}%` }}
        />
      </div>
    </div>
  );
}

function BubbleView({
  bubble,
  resultsData,
}: {
  bubble: Bubble;
  resultsData: Extract<Widget, { kind: "results" }> | null;
}) {
  const time = formatTime(bubble.ts);

  if (bubble.author === "user") {
    if (bubble.kind === "answered_question") {
      return (
        <div className="flex items-end justify-end gap-2">
          <div className="flex max-w-[85%] flex-col items-end gap-1">
            <div className="w-full overflow-hidden rounded-2xl rounded-br-sm border border-[var(--foreground)]/20 bg-white shadow-sm ring-1 ring-[var(--container-light)]">
              <div className="border-b border-[var(--container-light)] bg-[var(--background)] px-4 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground)]">
                  Q{bubble.questionNumber} of {bubble.total} · {bubble.sectionName}
                </div>
                <div className="mt-1 text-sm leading-relaxed text-[var(--foreground)]">
                  {bubble.stem}
                </div>
              </div>
              <div className="flex items-start gap-3 px-4 py-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--foreground)] text-xs font-semibold text-white">
                  {bubble.optionLabel}
                </span>
                <span className="text-sm leading-relaxed text-[var(--foreground)]">{bubble.optionText}</span>
              </div>
            </div>
            <span className="text-[10px] text-[#8A7868]">{time}</span>
          </div>
          <Avatar who="user" />
        </div>
      );
    }
    return (
      <div className="flex items-end justify-end gap-2">
        <div className="flex max-w-[80%] flex-col items-end gap-1">
          <div className="rounded-2xl rounded-br-sm bg-[var(--container-dark)] px-4 py-2 text-sm text-white shadow-sm">
            {bubble.body}
          </div>
          <span className="text-[10px] text-[var(--foreground)] opacity-60">{time}</span>
        </div>
        <Avatar who="user" />
      </div>
    );
  }
  if (bubble.kind === "result_chart") {
    return (
      <div className="flex items-end gap-2">
        <Avatar who="bot" />
        <div className="flex max-w-[85%] flex-col items-start gap-1">
          <div className="w-full min-w-[300px] overflow-hidden rounded-2xl border border-[var(--container-light)] bg-white p-4 shadow-sm">
            <AssessmentDonutChart dimensions={bubble.dimensions} />
          </div>
          <span className="text-[10px] text-[#8A7868]">{time}</span>
        </div>
      </div>
    );
  }

  if (bubble.kind === "image") {
    // If it's a result image, hide it on web because we render the real ApexChart 
    // inside the subsequent overall result card for a cleaner interactive experience.
    if (bubble.imageUrl.includes("/api/image/result/")) {
      return null;
    }
    return (
      <div className="flex items-end gap-2">
        <Avatar who="bot" />
        <div className="flex max-w-[85%] flex-col items-start gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bubble.imageUrl}
            alt="Attachment"
            className="rounded-2xl border border-[var(--container-light)] bg-white shadow-sm"
          />
          <span className="text-[10px] text-[#8A7868]">{time}</span>
        </div>
      </div>
    );
  }
  const dim = parseDimensionResult(bubble.body);
  const overall = dim ? null : parseOverallResult(bubble.body);
  return (
    <div className="flex items-end gap-2">
      <Avatar who="bot" />
      <div className="flex max-w-[85%] flex-col items-start gap-1">
        {dim ? (
          <DimensionResultCard {...dim} />
        ) : overall ? (
          <OverallResultCard {...overall} />
        ) : (
          <div className="whitespace-pre-wrap rounded-2xl rounded-bl-sm border-l-[3px] border-[var(--accent-yellow)] bg-white px-4 py-2.5 text-sm leading-relaxed text-[var(--foreground)] shadow-sm ring-1 ring-[var(--container-light)]">
            <LinkifiedText text={bubble.body} />
          </div>
        )}
        <span className="text-[10px] text-[#8A7868]">{time}</span>
      </div>
    </div>
  );
}

// ─── Result-message parsers + cards ──────────────────────────────────────
// The bot emits `dimension_result` + `overall_result` as plain template text
// (so WhatsApp gets readable markdown-style `*bold*`). On the web we detect
// that shape and render a richer card instead of the raw string.

type DimensionResult = { title: string; score: string; max: string; band: string; body: string };

function parseDimensionResult(text: string): DimensionResult | null {
  const lines = text.split("\n").map((l) => l.trim());
  const header = lines[0];
  if (!header) return null;

  // New format: *Title* — Score / Max · Band
  const headerMatch = header.match(/^\*(.+)\*\s*[—\-]\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*·\s*(.+)$/);
  if (headerMatch) {
    const title = headerMatch[1]!.trim();
    const score = headerMatch[2]!;
    const max = headerMatch[3]!;
    const band = headerMatch[4]!.trim();
    const body = lines.slice(1).join("\n").trim();
    return { title, score, max, band, body };
  }

  // Fallback to old format if needed
  const title = header.match(/^\*(.+)\*$/)?.[1];
  if (!title) return null;
  const scoreLine = lines.find((l) => /^Your score:/i.test(l));
  const bandLine = lines.find((l) => /^Band:/i.test(l));
  if (!scoreLine || !bandLine) return null;
  const m = scoreLine.match(/Your score:\s*(\S+)\s*\/\s*(\S+)/i);
  if (!m) return null;
  const band = bandLine.replace(/^Band:\s*/i, "").trim();
  const startIdx = lines.indexOf(bandLine) + 1;
  const body = lines.slice(startIdx).join("\n").trim();
  return { title, score: m[1]!, max: m[2]!, band, body };
}

type OverallResult = {
  title: string;
  sections: Array<{ label: string; score: string; max: string }>;
  overallScore?: string;
  overallMax?: string;
  bandLabel?: string;
  body: string;
  dimensions?: Array<{ name: string; score: number; maxScore: number; band: string }>;
};

function parseOverallResult(text: string): OverallResult | null {
  const lines = text.split("\n").map((l) => l.trim());
  const header = lines[0];
  if (!header) return null;

  // Title is usually *BOLD*
  const titleMatch = header.match(/^\*(.+)\*$/);
  if (!titleMatch) return null;
  const title = titleMatch[1]!.trim();

  const sections: OverallResult["sections"] = [];
  let overallScore: string | undefined;
  let overallMax: string | undefined;
  let bandLabel: string | undefined;
  const interpretationLines: string[] = [];
  let seenAll = false;

  for (const line of lines.slice(1)) {
    if (!line) continue;

    // Matches "Section 1: 10 / 20" or "Section 1 — 10 / 20"
    const secMatch = line.match(/^(Section\s+\d+)\s*[:—\-]\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i);
    // Matches "OVERALL: 10 / 20" or "Total: 10 / 20"
    const overallMatch = line.match(/^(?:OVERALL|Total)\s*[:—\-]\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i);
    // Matches "Readiness Level: XYZ" or "Band: XYZ"
    const bandMatch = line.match(/^(?:Readiness Level|Band)\s*[:—\-]\s*(.+)/i);

    if (secMatch) {
      sections.push({ label: secMatch[1]!, score: secMatch[2]!, max: secMatch[3]! });
    } else if (overallMatch) {
      overallScore = overallMatch[1];
      overallMax = overallMatch[2];
      seenAll = true;
    } else if (bandMatch) {
      bandLabel = bandMatch[1]!.trim();
      seenAll = true;
    } else if (seenAll) {
      interpretationLines.push(line);
    }
  }

  if (sections.length === 0 && !overallScore) return null;

  return {
    title,
    sections,
    overallScore,
    overallMax,
    bandLabel,
    body: interpretationLines.join("\n").trim(),
    dimensions: sections.map((s) => ({
      name: s.label,
      score: parseFloat(s.score),
      maxScore: parseFloat(s.max),
      band: "", // Not used in small chart
    })),
  };
}

function DimensionResultCard({ title, score, max, band, body }: DimensionResult) {
  return (
    <div className="overflow-hidden rounded-2xl rounded-bl-sm border-l-[3px] border-[var(--accent-yellow)] bg-white shadow-sm ring-1 ring-[var(--container-light)]">
      <div className="border-b border-[var(--container-light)] bg-[var(--background)] px-4 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--accent-pink)] opacity-80">
          Result
        </div>
        <div className="mt-0.5 font-serif-heading text-base font-semibold text-[var(--foreground)]">{title}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <span className="inline-flex items-baseline gap-1 rounded-lg bg-[var(--foreground)] px-2.5 py-1 text-white">
          <span className="font-mono text-base font-semibold">{score}</span>
          <span className="font-mono text-xs text-white/60">/ {max}</span>
        </span>
        <span className="inline-flex items-center rounded-full bg-[var(--accent-yellow)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground)]">
          {band}
        </span>
      </div>
      {body && (
        <p className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-[var(--foreground)]">
          {body}
        </p>
      )}
    </div>
  );
}

function OverallResultCard({
  title,
  sections,
  overallScore,
  overallMax,
  bandLabel,
  body,
  dimensions,
}: OverallResult) {
  return (
    <div className="overflow-hidden rounded-2xl rounded-bl-sm border-l-[3px] border-[var(--accent-yellow)] bg-white shadow-sm ring-1 ring-[var(--container-light)]">
      <div className="border-b border-[var(--container-light)] bg-[var(--background)] px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--accent-pink)] opacity-80">
          Overall
        </div>
        <div className="mt-0.5 font-serif-heading text-base font-semibold text-[var(--foreground)]">{title}</div>

        {/* Real Interactive ApexChart in the Bubble! */}
        {dimensions && dimensions.length > 0 && (
          <div className="mt-4 -mb-4 bg-white/50 rounded-xl py-2">
            <AssessmentDonutChart dimensions={dimensions} />
          </div>
        )}

        {(overallScore || bandLabel) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {overallScore && overallMax && (
              <span className="inline-flex items-baseline gap-1 rounded-lg bg-[var(--container-dark)] px-2.5 py-1 text-white">
                <span className="font-mono text-base font-semibold">{overallScore}</span>
                <span className="font-mono text-xs text-white/60">/ {overallMax}</span>
              </span>
            )}
            {bandLabel && (
              <span className="inline-flex items-center rounded-full bg-[var(--accent-yellow)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground)]">
                {bandLabel}
              </span>
            )}
          </div>
        )}
      </div>
      {sections.length > 0 && (
        <div className="divide-y divide-[var(--container-light)]">
          {sections.map((s, i) => (
            <div key={s.label} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ["#36211B", "#FF3F64", "#FFDE59"][i % 3] }} />
                <span className="text-sm font-medium text-[var(--foreground)]">{s.label}</span>
              </div>
              <span className="font-mono text-sm text-[var(--foreground)]">
                {s.score}
                <span className="text-[#8A7868]"> / {s.max}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {body && (
        <div className="border-t border-[var(--container-light)] bg-[var(--background)]/50 px-4 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
            {body}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Renders text with support for:
 * 1. Clickable URLs (https?://...)
 * 2. Bold markdown (*text* or **text**)
 */
function LinkifiedText({ text }: { text: string }) {
  // First, split by URLs
  const urlParts = text.split(/(https?:\/\/[^\s<>()]+)/g);

  return (
    <>
      {urlParts.map((part, i) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--foreground)] underline underline-offset-2 hover:text-[#3B2B20]"
            >
              {part}
            </a>
          );
        }

        // For non-URL parts, handle bold formatting (*text* or **text**)
        // We look for patterns like **bold** or *bold*
        const boldParts = part.split(/(\*\*?[^*]+\*\*?)/g);
        return (
          <span key={i}>
            {boldParts.map((bp, j) => {
              const m = bp.match(/^\*\*?([^*]+)\*\*?$/);
              if (m) {
                return (
                  <strong key={j} className="font-bold">
                    {m[1]}
                  </strong>
                );
              }
              return <span key={j}>{bp}</span>;
            })}
          </span>
        );
      })}
    </>
  );
}

function WidgetView({
  widget,
  busy,
  onSubmit,
}: {
  widget: Widget;
  busy: boolean;
  onSubmit: (text?: string, userEcho?: string | BubbleInput) => void | Promise<void>;
}) {
  switch (widget.kind) {
    case "welcome":
      return (
        <WelcomeWidget
          busy={busy}
          onStart={() => onSubmit("YES", "Let's begin")}
          onLater={() => onSubmit("LATER", "Maybe later")}
        />
      );

    case "text_input":
      return <TextInputWidget placeholder={widget.placeholder} busy={busy} onSubmit={onSubmit} />;

    case "question":
      return <QuestionWidget widget={widget} busy={busy} onSubmit={onSubmit} />;

    case "yes_no":
      return <YesNoWidget busy={busy} onSubmit={onSubmit} />;

    case "results":
      return <ResultsWidget widget={widget} />;

    case "closed":
      return (
        <button
          disabled={busy}
          onClick={() => onSubmit("RESULTS", "Show me my results")}
          className="w-full rounded-xl bg-[var(--container-light)] px-5 py-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--accent-yellow)] disabled:opacity-50"
        >
          View my results
        </button>
      );

    case "unsupported":
      return (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          State <code>{widget.state}</code> has no web widget yet.
        </p>
      );
  }
}

function WelcomeWidget({
  busy,
  onStart,
  onLater,
}: {
  busy: boolean;
  onStart: () => void;
  onLater: () => void;
}) {
  return (
    <div className="space-y-4 text-center">
      <div className="space-y-2">
        <button
          type="button"
          disabled={busy}
          onClick={onStart}
          aria-label="Start assessment"
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--foreground)] text-lg text-white shadow-sm transition hover:bg-[#3B2B20] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground)] focus-visible:ring-offset-2 disabled:opacity-50"
        >
          ▶
        </button>
        <h2 className="font-serif text-xl text-[var(--foreground)]">Ready when you are</h2>
        <p className="text-sm text-[#8A7868]">
          25 quick questions across 3 dimensions. About 10–12 minutes.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          disabled={busy}
          onClick={onStart}
          className="flex-1 rounded-xl bg-[var(--accent-pink)] px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Let's begin →"}
        </button>
        <button
          disabled={busy}
          onClick={onLater}
          className="flex-1 rounded-xl border border-[var(--container-light)] bg-white px-5 py-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--background)] disabled:opacity-50"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

function TextInputWidget({
  placeholder,
  busy,
  onSubmit,
}: {
  placeholder: string;
  busy: boolean;
  onSubmit: (text?: string, userEcho?: string | BubbleInput) => void | Promise<void>;
}) {
  const [val, setVal] = useState("");
  const submit = () => {
    const t = val.trim();
    if (!t) return;
    onSubmit(t, t);
    setVal("");
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-stretch gap-2"
    >
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={placeholder}
        disabled={busy}
        className="flex-1 rounded-xl border border-[var(--container-light)] bg-white px-4 py-3 text-sm shadow-sm outline-none ring-[var(--foreground)]/30 transition focus:ring-2 disabled:bg-[var(--background)]"
      />
      <button
        type="submit"
        disabled={busy || !val.trim()}
        aria-label="Send"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent-pink)] text-white shadow-sm transition hover:bg-[var(--accent-pink)] disabled:opacity-40"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
}

function QuestionWidget({
  widget,
  busy,
  onSubmit,
}: {
  widget: Extract<Widget, { kind: "question" }>;
  busy: boolean;
  onSubmit: (text?: string, userEcho?: string | BubbleInput) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<"A" | "B" | "C" | "D" | null>(null);

  // Reset selection when the question changes.
  useEffect(() => {
    setSelected(null);
  }, [widget.questionNumber, widget.stem]);

  return (
    <div className="space-y-4">
      <div>
        <div className="inline-flex items-center rounded-full bg-[var(--accent-yellow)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground)]">
          {widget.sectionName}
        </div>
        <h3 className="mt-2 font-serif-heading text-lg font-semibold leading-relaxed text-[var(--foreground)]">
          {widget.stem}
        </h3>
      </div>
      <div className="space-y-2">
        {widget.options.map((o) => {
          const isSelected = selected === o.label;
          return (
            <button
              key={o.label}
              disabled={busy}
              onClick={() => setSelected(o.label)}
              className={
                "group flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition " +
                (isSelected
                  ? "border-[var(--foreground)] bg-[var(--foreground)] text-white shadow-sm"
                  : "border-[var(--container-light)] bg-white text-[var(--foreground)] hover:border-[var(--foreground)]/40 hover:bg-[var(--background)]")
              }
            >
              <span
                className={
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold " +
                  (isSelected
                    ? "border-white/40 bg-white/10 text-white"
                    : "border-[var(--container-light)] bg-white text-[var(--foreground)] group-hover:border-[var(--foreground)]/50")
                }
              >
                {o.label}
              </span>
              <span className="leading-relaxed">{o.text}</span>
            </button>
          );
        })}
      </div>
      <button
        disabled={busy || !selected}
        onClick={() => {
          if (!selected) return;
          const opt = widget.options.find((o) => o.label === selected);
          if (!opt) return;
          onSubmit(selected, {
            author: "user",
            kind: "answered_question",
            sectionName: widget.sectionName,
            questionNumber: widget.questionNumber,
            total: widget.total,
            stem: widget.stem,
            optionLabel: selected,
            optionText: opt.text,
          });
        }}
        className="w-full rounded-xl bg-[var(--foreground)] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#3B2B20] disabled:opacity-40"
      >
        {busy ? "Sending…" : selected ? "Submit answer →" : "Choose an option"}
      </button>
    </div>
  );
}
function YesNoWidget({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (text?: string, userEcho?: string | BubbleInput) => void | Promise<void>;
}) {
  return (
    <div className="flex gap-2">
      <button
        disabled={busy}
        onClick={() => onSubmit("YES", "Yes")}
        className="flex-1 rounded-xl bg-[var(--foreground)] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#3B2B20] disabled:opacity-50"
      >
        Yes
      </button>
      <button
        disabled={busy}
        onClick={() => onSubmit("NO", "No")}
        className="flex-1 rounded-xl border border-[var(--container-light)] bg-white px-5 py-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--foreground)]/50 hover:bg-[var(--background)] disabled:opacity-50"
      >
        No
      </button>
    </div>
  );
}


function AssessmentDonutChart({
  dimensions,
}: {
  dimensions: Array<{ name: string; score: number; maxScore: number; band: string }>;
}) {
  const series = dimensions.map((d) => d.score);
  const labels = dimensions.map((d) => d.name);

  // Map to brand colors
  // Section 1: Dark Brown, Section 2: Pink, Section 3: Yellow
  const colors = ["#36211B", "#FF3F64", "#FFDE59"];

  const options: any = {
    chart: {
      type: "donut",
      fontFamily: "Montserrat, sans-serif",
      toolbar: { show: false },
    },
    colors: colors,
    labels: labels,
    stroke: {
      show: true,
      colors: ["var(--background)"],
      width: 4,
    },
    dataLabels: {
      enabled: true,
      style: {
        fontSize: "12px",
        fontFamily: "Montserrat, sans-serif",
        fontWeight: "700",
      },
      dropShadow: { enabled: false },
    },
    plotOptions: {
      pie: {
        expandOnClick: false,
        donut: {
          size: "70%",
          background: "transparent",
          labels: {
            show: true,
            name: {
              show: true,
              fontSize: "10px",
              fontWeight: 600,
              color: "#8A7868",
              offsetY: -8,
            },
            value: {
              show: true,
              fontSize: "18px",
              fontWeight: 700,
              color: "#36211B",
              offsetY: 8,
              formatter: () => "REPORT",
            },
            total: {
              show: true,
              showAlways: true,
              label: "INNERGY",
              color: "#36211B",
              fontSize: "9px",
              fontWeight: 600,
              formatter: () => "REPORT",
            },
          },
        },
      },
    },
    legend: {
      position: "bottom",
      fontSize: "11px",
      fontWeight: 500,
      fontFamily: "Montserrat, sans-serif",
      markers: { radius: 12 },
      itemMargin: { horizontal: 8, vertical: 4 },
    },
    tooltip: {
      y: {
        formatter: (val: number, { seriesIndex }: any) => {
          const dim = dimensions[seriesIndex];
          if (!dim) return `${val}`;
          return `${val} / ${dim.maxScore}`;
        },
      },
    },
  };

  return (
    <div className="mx-auto w-full max-w-sm py-2">
      <div className="mb-4 flex flex-col items-center">
        <div className="relative mb-4 flex h-[40px] w-full items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png?v=19"
            alt="innergy"
            className="h-[140px] w-[140px] max-w-none object-contain"
          />
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--foreground)] opacity-70">
          Full Spectrum Leadership
        </p>
      </div>
      <div className="min-h-[280px]">
        <ReactApexChart options={options} series={series} type="donut" width="100%" />
      </div>
    </div>
  );
}

function ResultsWidget({ widget }: { widget: Extract<Widget, { kind: "results" }> }) {
  return (
    <div className="flex flex-col gap-4 py-2 innergy-bubble-in">
      <div className="rounded-2xl border border-[var(--container-light)] bg-white p-4 shadow-sm transition hover:ring-1 hover:ring-[var(--accent-yellow)]/20">
        <AssessmentDonutChart dimensions={widget.dimensions} />
      </div>

      <div className="rounded-xl bg-[var(--foreground)] p-4 text-white shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-yellow)]">
          Overall Status
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5 text-3xl font-bold">
            {widget.overall.score}
            <span className="text-sm font-normal text-white/50">/ {widget.overall.maxScore}</span>
          </div>
          <div className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider">
            {widget.overall.band}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {widget.dimensions.map((d) => (
          <div
            key={d.name}
            className="rounded-xl border border-[var(--container-light)] bg-white p-4 shadow-sm transition hover:ring-1 hover:ring-[var(--accent-yellow)]"
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground)] opacity-60">
              {d.name}
            </div>
            <div className="mt-1 flex items-baseline gap-1 font-serif text-lg font-bold text-[var(--foreground)]">
              {d.score}
              <span className="font-sans text-[10px] font-normal text-[var(--foreground)] opacity-50">/ {d.maxScore}</span>
            </div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-tight text-[var(--accent-pink)] opacity-80">
              {d.band}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
