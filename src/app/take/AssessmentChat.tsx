"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
        const incoming: Bubble[] = data.actions.map((a) =>
          a.kind === "text"
            ? { author: "bot", kind: "text", body: a.body, ts: Date.now() }
            : { author: "bot", kind: "image", imageUrl: a.imageUrl, ts: Date.now() },
        );

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

      <div className="flex flex-col overflow-hidden rounded-3xl border border-[#E6DFC9] bg-[#FAF6EC] shadow-sm">
        <div className="flex items-center justify-between border-b border-[#E6DFC9] bg-[#F5EFE1] px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#2f5d46]">
            <span className="inline-flex h-2 w-2 rounded-full bg-[#2f5d46]" />
            {state === "loading" ? "Connecting…" : stateLabel(state)}
          </div>
          <button
            onClick={handleRestart}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#6B6357] transition hover:bg-white/60 hover:text-[#2f5d46] disabled:opacity-50"
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
          className="max-h-[78vh] min-h-[520px] overflow-y-auto bg-[#FAF6EC] p-5 sm:p-6"
        >
          {bubbles.length === 0 && state === "loading" && (
            <div className="flex h-full items-center justify-center py-10">
              <div className="flex items-center gap-2 text-sm text-[#6B6357]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#8FAE94]" />
                Loading
              </div>
            </div>
          )}
          <div className="space-y-2.5">
            {bubbles.map((b, i) => (
              <div key={i} className="innergy-bubble-in">
                <BubbleView bubble={b} />
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
        className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm ring-1 ring-[#E6DFC9]"
        aria-label={`${COACH_NAME} is typing`}
      >
        <span className="innergy-typing-dot h-1.5 w-1.5 rounded-full bg-[#2f5d46]" />
        <span className="innergy-typing-dot h-1.5 w-1.5 rounded-full bg-[#2f5d46]" />
        <span className="innergy-typing-dot h-1.5 w-1.5 rounded-full bg-[#2f5d46]" />
      </div>
    </div>
  );
}

function Avatar({ who }: { who: "bot" | "user" }) {
  if (who === "bot") {
    const initials = COACH_NAME
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0]!)
      .slice(0, 2)
      .join("")
      .toUpperCase();
    return COACH_AVATAR_SRC ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={COACH_AVATAR_SRC}
        alt={COACH_NAME}
        className="h-8 w-8 shrink-0 rounded-full border border-[#E6DFC9] object-cover"
      />
    ) : (
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2f5d46] text-[11px] font-semibold text-white ring-1 ring-[#E6DFC9]"
        title={COACH_NAME}
      >
        {initials}
      </div>
    );
  }
  // User avatar — generic silhouette until we wire per-session identity.
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E6DFC9] text-[#2f5d46] ring-1 ring-[#E6DFC9]"
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
    case "question": return "Assessment in progress";
    case "computing": return "Calculating…";
    case "debrief_cta": return "Results ready";
    case "coaching_interest": return "Wrapping up";
    case "closed":
    case "results": return "Complete";
    case "escalated": return "Paused";
    default: return state;
  }
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-[#6B6357]">
        <span className="font-medium">{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E6DFC9]">
        <div
          className="h-full rounded-full bg-[#2f5d46] transition-all duration-300 ease-out"
          style={{ width: `${Math.max(4, value * 100)}%` }}
        />
      </div>
    </div>
  );
}

function BubbleView({ bubble }: { bubble: Bubble }) {
  const time = formatTime(bubble.ts);

  if (bubble.author === "user") {
    if (bubble.kind === "answered_question") {
      return (
        <div className="flex items-end justify-end gap-2">
          <div className="flex max-w-[85%] flex-col items-end gap-1">
            <div className="w-full overflow-hidden rounded-2xl rounded-br-sm border border-[#2f5d46]/20 bg-white shadow-sm ring-1 ring-[#E6DFC9]">
              <div className="border-b border-[#E6DFC9] bg-[#F5EFE1] px-4 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#2f5d46]">
                  Q{bubble.questionNumber} of {bubble.total} · {bubble.sectionName}
                </div>
                <div className="mt-1 text-sm leading-relaxed text-[#1a1a1a]">
                  {bubble.stem}
                </div>
              </div>
              <div className="flex items-start gap-3 px-4 py-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2f5d46] text-xs font-semibold text-white">
                  {bubble.optionLabel}
                </span>
                <span className="text-sm leading-relaxed text-[#1a1a1a]">{bubble.optionText}</span>
              </div>
            </div>
            <span className="text-[10px] text-[#6B6357]">{time}</span>
          </div>
          <Avatar who="user" />
        </div>
      );
    }
    return (
      <div className="flex items-end justify-end gap-2">
        <div className="flex max-w-[80%] flex-col items-end gap-1">
          <div className="rounded-2xl rounded-br-sm bg-[#2f5d46] px-4 py-2 text-sm text-white shadow-sm">
            {bubble.body}
          </div>
          <span className="text-[10px] text-[#6B6357]">{time}</span>
        </div>
        <Avatar who="user" />
      </div>
    );
  }
  if (bubble.kind === "image") {
    return (
      <div className="flex items-end gap-2">
        <Avatar who="bot" />
        <div className="flex max-w-[85%] flex-col items-start gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bubble.imageUrl}
            alt="Your results chart"
            className="rounded-2xl border border-[#E6DFC9] bg-white shadow-sm"
          />
          <span className="text-[10px] text-[#6B6357]">{time}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-end gap-2">
      <Avatar who="bot" />
      <div className="flex max-w-[85%] flex-col items-start gap-1">
        <div className="whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 text-sm leading-relaxed text-[#1a1a1a] shadow-sm ring-1 ring-[#E6DFC9]">
          <LinkifiedText text={bubble.body} />
        </div>
        <span className="text-[10px] text-[#6B6357]">{time}</span>
      </div>
    </div>
  );
}

// Turns plain text into React nodes where http(s):// URLs render as clickable
// <a> tags. Needed so DB-rendered templates — e.g. the Calendly booking link
// in `coaching_yes` — open when clicked instead of showing as raw text.
function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>()]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#2f5d46] underline underline-offset-2 hover:text-[#264d3a]"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
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
          className="w-full rounded-xl bg-[#F5EFE1] px-5 py-3 text-sm font-medium text-[#2f5d46] transition hover:bg-[#E6DFC9] disabled:opacity-50"
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
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#2f5d46] text-lg text-white">
          ▶
        </div>
        <h2 className="font-serif text-xl text-[#1a1a1a]">Ready when you are</h2>
        <p className="text-sm text-[#6B6357]">
          25 quick questions across 3 dimensions. About 10–12 minutes.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          disabled={busy}
          onClick={onStart}
          className="flex-1 rounded-xl bg-[#2f5d46] px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#264d3a] disabled:opacity-50"
        >
          {busy ? "Starting…" : "Let's begin →"}
        </button>
        <button
          disabled={busy}
          onClick={onLater}
          className="flex-1 rounded-xl border border-[#E6DFC9] bg-white px-5 py-3 text-sm font-medium text-[#1a1a1a] transition hover:bg-[#F5EFE1] disabled:opacity-50"
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
        className="flex-1 rounded-xl border border-[#E6DFC9] bg-white px-4 py-3 text-sm shadow-sm outline-none ring-[#2f5d46]/30 transition focus:ring-2 disabled:bg-[#F5EFE1]"
      />
      <button
        type="submit"
        disabled={busy || !val.trim()}
        className="rounded-xl bg-[#2f5d46] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#264d3a] disabled:opacity-40"
      >
        Send
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
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#2f5d46]">
          {widget.sectionName}
        </div>
        <h3 className="mt-1 text-base font-semibold leading-relaxed text-[#1a1a1a]">
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
                  ? "border-[#2f5d46] bg-[#2f5d46] text-white shadow-sm"
                  : "border-[#E6DFC9] bg-white text-[#1a1a1a] hover:border-[#2f5d46]/40 hover:bg-[#F5EFE1]")
              }
            >
              <span
                className={
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold " +
                  (isSelected
                    ? "border-white/40 bg-white/10 text-white"
                    : "border-[#E6DFC9] bg-white text-[#2f5d46] group-hover:border-[#2f5d46]/50")
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
        className="w-full rounded-xl bg-[#2f5d46] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#264d3a] disabled:opacity-40"
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
        className="flex-1 rounded-xl bg-[#2f5d46] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#264d3a] disabled:opacity-50"
      >
        Yes
      </button>
      <button
        disabled={busy}
        onClick={() => onSubmit("NO", "No")}
        className="flex-1 rounded-xl border border-[#E6DFC9] bg-white px-5 py-3 text-sm font-medium text-[#1a1a1a] transition hover:border-[#2f5d46]/50 hover:bg-[#F5EFE1] disabled:opacity-50"
      >
        No
      </button>
    </div>
  );
}

function ResultsWidget({ widget }: { widget: Extract<Widget, { kind: "results" }> }) {
  return (
    <div className="space-y-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={widget.imageUrl}
        alt="Your scores"
        className="mx-auto w-full max-w-sm rounded-xl border border-[#E6DFC9]"
      />
      <div className="rounded-xl bg-[#2f5d46] p-4 text-white">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8FAE94]">
          Overall
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <div className="text-lg font-semibold">{widget.overall.band}</div>
          <div className="font-mono text-sm">
            {widget.overall.score}
            <span className="text-white/60"> / {widget.overall.maxScore}</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {widget.dimensions.map((d) => (
          <div
            key={d.name}
            className="rounded-xl border border-[#E6DFC9] bg-white p-3 text-center"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#2f5d46]">
              {d.name}
            </div>
            <div className="mt-1 font-mono text-sm text-[#1a1a1a]">
              {d.score}
              <span className="text-[#6B6357]"> / {d.maxScore}</span>
            </div>
            <div className="mt-0.5 text-xs text-[#6B6357]">{d.band}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
