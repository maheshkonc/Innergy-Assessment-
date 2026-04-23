// Public take-the-assessment page. Cream + forest-green palette; the chat
// below carries the conversation.

import { AssessmentChat } from "./AssessmentChat";

export const dynamic = "force-dynamic";

export default async function TakePage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const { tenant } = await searchParams;
  return (
    <div className="min-h-screen bg-[#F5EFE1] text-[#1a1a1a]">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <header className="mb-8 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#E6DFC9] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#2f5d46]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#2f5d46]" />
            Innergy · Leadership diagnostic
          </div>
          <h1 className="font-serif text-3xl leading-tight text-[#1a1a1a] sm:text-4xl">
            A candid read on how you lead in the{" "}
            <em className="text-[#2f5d46]">AI age</em>.
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-[#6B6357]">
            25 questions across three dimensions — about 10–12 minutes. Honest
            answers only you will see.
          </p>
        </header>
        <AssessmentChat tenantSlug={tenant} />
        <footer className="mt-6 text-center text-xs text-[#6B6357]">
          Your answers are anonymous until you share a name.
        </footer>
      </div>
    </div>
  );
}
