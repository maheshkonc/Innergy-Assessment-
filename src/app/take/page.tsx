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
    <div className="min-h-screen bg-[#FBF3DE] text-[#2A1E17]">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <header className="mb-8 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#2A1E17] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#F2C84B]">
            <span className="font-serif text-[13px] italic text-[#FBF3DE]">innergy</span>
            <span className="h-3 w-px bg-[#F2C84B]/70" />
            Leadership diagnostic
          </div>
          <h1 className="font-serif text-3xl leading-tight text-[#2A1E17] sm:text-4xl">
            A candid read on how you lead in the{" "}
            <em className="text-[#C9942B]">AI age</em>.
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-[#8A7868]">
            25 questions across three dimensions — about 10–12 minutes. Honest
            answers only you will see.
          </p>
        </header>
        <AssessmentChat tenantSlug={tenant} />
        <footer className="mt-6 text-center text-xs text-[#8A7868]">
          Your answers are anonymous until you share a name.
        </footer>
      </div>
    </div>
  );
}
