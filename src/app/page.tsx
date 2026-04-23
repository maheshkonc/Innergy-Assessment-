import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-3xl font-semibold">Innergy — Full-Spectrum Leadership Coach</h1>
      <p className="mt-4 text-slate-600">
        V1 MVP. WhatsApp diagnostic + admin dashboard. See{" "}
        <code className="rounded bg-slate-200 px-1">CLAUDE.md</code> for the engineering
        guide.
      </p>
      <ul className="mt-8 space-y-2">
        <li>
          <Link className="text-sky-700 underline" href="/admin">
            → Admin dashboard
          </Link>
        </li>
        <li>
          <Link className="text-sky-700 underline" href="/api/health">
            → Health check
          </Link>
        </li>
      </ul>
    </main>
  );
}
