"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type Candidate = {
  userId: string;
  firstName: string | null;
  email: string | null;
  organisation: string | null;
  sessionCount: number;
};

type Analytics = {
  scope: {
    filtered: boolean;
    userIdsCount: number | null;
    totals: { sessions: number; results: number; abandoned: number; inProgress: number };
  };
  kpis: {
    totalCandidates: number;
    totalSessions: number;
    completed: number;
    completionRate: number;
    avgOverall: number | null;
    medianOverall: number | null;
    p25Overall: number | null;
    p75Overall: number | null;
  };
  histogramOverall: { bin: string; count: number }[];
  bands: {
    overall: { band: string; count: number }[];
    cognitive: { band: string; count: number }[];
    relational: { band: string; count: number }[];
    inner: { band: string; count: number }[];
  };
  funnel: { stage: string; count: number }[];
  completionsOverTime: { date: string; count: number }[];
  radar: { dimension: string; avg: number }[];
};

export function AnalyticsDashboard({ candidates }: { candidates: Candidate[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const reqId = useRef(0);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      [c.firstName, c.email, c.organisation]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q)),
    );
  }, [candidates, search]);

  const fetchData = useMemo(
    () => async () => {
      const myReq = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const qs = selected.size > 0 ? `?userIds=${Array.from(selected).join(",")}` : "";
        const res = await fetch(`/api/admin/analytics${qs}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = (await res.json()) as Analytics;
        if (myReq === reqId.current) setData(json);
      } catch (e) {
        if (myReq === reqId.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (myReq === reqId.current) setLoading(false);
      }
    },
    [selected],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchData]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-slate-500">
            {selected.size === 0
              ? `All candidates (${candidates.length})`
              : `${selected.size} candidate${selected.size === 1 ? "" : "s"} selected`}
            {data && (
              <>
                {" · "}
                {data.scope.totals.sessions} session{data.scope.totals.sessions === 1 ? "" : "s"}
                {" · "}
                {data.scope.totals.results} result{data.scope.totals.results === 1 ? "" : "s"}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh (15s)
          </label>
          <button
            onClick={fetchData}
            disabled={loading}
            className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <ScopePicker
          candidates={visible}
          totalCount={candidates.length}
          selected={selected}
          onToggle={toggleOne}
          onClear={() => setSelected(new Set())}
          onSelectAllVisible={() => setSelected(new Set(visible.map((c) => c.userId)))}
          search={search}
          onSearch={setSearch}
        />

        <div className="space-y-6">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              Failed to load analytics: {error}
            </div>
          )}
          {data && <DashboardBody data={data} />}
        </div>
      </div>
    </div>
  );
}

function ScopePicker({
  candidates,
  totalCount,
  selected,
  onToggle,
  onClear,
  onSelectAllVisible,
  search,
  onSearch,
}: {
  candidates: Candidate[];
  totalCount: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onClear: () => void;
  onSelectAllVisible: () => void;
  search: string;
  onSearch: (q: string) => void;
}) {
  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Scope</div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search name / email / org"
          className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          {selected.size}/{totalCount} selected
        </span>
        <span className="flex gap-2">
          <button onClick={onSelectAllVisible} className="font-semibold text-slate-700 hover:text-slate-900">
            Select visible
          </button>
          <button onClick={onClear} className="font-semibold text-slate-700 hover:text-slate-900">
            Clear
          </button>
        </span>
      </div>
      <ul className="mt-2 max-h-[460px] overflow-y-auto divide-y divide-slate-100 text-sm">
        {candidates.length === 0 && (
          <li className="px-1 py-3 text-slate-400">No candidates match your search.</li>
        )}
        {candidates.map((c) => {
          const checked = selected.has(c.userId);
          return (
            <li key={c.userId}>
              <label className="flex cursor-pointer items-start gap-2 px-1 py-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={checked}
                  onChange={() => onToggle(c.userId)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">
                    {c.firstName ?? "Anonymous"}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {c.email ?? c.organisation ?? "—"}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">
                    {c.sessionCount} session{c.sessionCount === 1 ? "" : "s"}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function DashboardBody({ data }: { data: Analytics }) {
  const noResults = data.scope.totals.results === 0;
  return (
    <>
      <KpiTiles k={data.kpis} />
      {noResults ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No completed results in the current scope.
        </div>
      ) : (
        <>
          <Card title="Overall score distribution">
            <Chart
              type="bar"
              height={260}
              series={[{ name: "Candidates", data: data.histogramOverall.map((b) => b.count) }]}
              options={{
                chart: { toolbar: { show: false } },
                xaxis: { categories: data.histogramOverall.map((b) => b.bin), title: { text: "Score bin" } },
                yaxis: { title: { text: "Candidates" }, labels: { formatter: (v) => `${Math.round(v)}` } },
                colors: ["#0f172a"],
                dataLabels: { enabled: false },
              }}
            />
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card title="Overall band distribution">
              <DonutChart entries={data.bands.overall} />
            </Card>
            <Card title="Dimension averages (radar)">
              <Chart
                type="radar"
                height={300}
                series={[{ name: "Avg score", data: data.radar.map((r) => round1(r.avg)) }]}
                options={{
                  chart: { toolbar: { show: false } },
                  xaxis: { categories: data.radar.map((r) => r.dimension) },
                  colors: ["#0f172a"],
                  fill: { opacity: 0.2 },
                  stroke: { width: 2 },
                  yaxis: { show: false },
                }}
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card title="Cognitive bands">
              <DonutChart entries={data.bands.cognitive} />
            </Card>
            <Card title="Relational bands">
              <DonutChart entries={data.bands.relational} />
            </Card>
            <Card title="Inner bands">
              <DonutChart entries={data.bands.inner} />
            </Card>
          </div>
        </>
      )}

      <Card title="Funnel">
        <Chart
          type="bar"
          height={220}
          series={[{ name: "Count", data: data.funnel.map((s) => s.count) }]}
          options={{
            chart: { toolbar: { show: false } },
            plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
            xaxis: { categories: data.funnel.map((s) => s.stage) },
            colors: ["#0f172a"],
            dataLabels: { enabled: true },
          }}
        />
      </Card>

      <Card title="Completions over the last 30 days">
        <Chart
          type="area"
          height={220}
          series={[{ name: "Completed", data: data.completionsOverTime.map((b) => b.count) }]}
          options={{
            chart: { toolbar: { show: false }, sparkline: { enabled: false } },
            xaxis: { categories: data.completionsOverTime.map((b) => b.date), labels: { rotate: -45, hideOverlappingLabels: true } },
            colors: ["#0f172a"],
            stroke: { curve: "smooth", width: 2 },
            fill: { type: "gradient", gradient: { shadeIntensity: 0.4, opacityFrom: 0.4, opacityTo: 0 } },
            dataLabels: { enabled: false },
          }}
        />
      </Card>
    </>
  );
}

function KpiTiles({ k }: { k: Analytics["kpis"] }) {
  const tiles: { label: string; value: string }[] = [
    { label: "Candidates", value: String(k.totalCandidates) },
    { label: "Sessions", value: String(k.totalSessions) },
    { label: "Completed", value: String(k.completed) },
    { label: "Completion rate", value: `${Math.round(k.completionRate * 100)}%` },
    { label: "Average overall", value: fmt(k.avgOverall) },
    { label: "Median overall", value: fmt(k.medianOverall) },
    { label: "P25 overall", value: fmt(k.p25Overall) },
    { label: "P75 overall", value: fmt(k.p75Overall) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t.label}</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{t.value}</div>
        </div>
      ))}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function DonutChart({ entries }: { entries: { band: string; count: number }[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-400">No data.</p>;
  }
  return (
    <Chart
      type="donut"
      height={260}
      series={entries.map((e) => e.count)}
      options={{
        chart: { toolbar: { show: false } },
        labels: entries.map((e) => e.band),
        legend: { position: "bottom", fontSize: "11px" },
        dataLabels: { enabled: true },
        colors: ["#0f172a", "#475569", "#94a3b8", "#cbd5e1", "#e2e8f0"],
      }}
    />
  );
}

function fmt(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toFixed(1);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
