// Public take-the-assessment page. Warm cream + dark brown palette with
// mustard + coral accents; the chat below carries the conversation.

import { AssessmentChat } from "./AssessmentChat";

export const dynamic = "force-dynamic";

export default async function TakePage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const { tenant } = await searchParams;
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Branding Header - Pinned to left corner */}
      <div className="px-6 py-4 lg:px-12">
        <div className="relative flex h-[40px] w-full items-center justify-start overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png?v=19"
            alt="innergy"
            className="h-[140px] w-[140px] max-w-none object-contain"
          />
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-10 sm:pb-14">
        <header className="mb-8">
          <div className="mb-6 inline-flex items-center rounded-full bg-[var(--foreground)] px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-yellow)]">
            Leadership diagnostic
          </div>
          <h1 className="font-serif text-3xl leading-tight text-[var(--foreground)] sm:text-4xl">
            A candid read on how you lead in the{" "}
            <em className="text-[var(--accent-pink)]">AI age</em>.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--foreground)] opacity-70">
            25 questions across three dimensions — about 10–12 minutes. Honest
            answers only you will see.
          </p>
        </header>
        <AssessmentChat tenantSlug={tenant} />
        <footer className="mt-6 text-center text-xs text-[var(--foreground)] opacity-50">
          Your answers are anonymous until you share a name.
        </footer>
      </div>
    </div>
  );
}
