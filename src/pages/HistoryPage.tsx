import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { isAuthConfigured } from "../lib/supabase";
import { fetchHistory, deleteHistoryEntry, type HistoryEntry } from "../lib/history";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";

const ENGINE_LABEL: Record<HistoryEntry["engine"], string> = {
  sql: "SQL",
  python: "PYTHON",
  insights: "INSIGHTS",
  meta: "INFO",
};

function groupByDataset(entries: HistoryEntry[]): Map<string, HistoryEntry[]> {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.dataset_name) ?? [];
    list.push(entry);
    groups.set(entry.dataset_name, list);
  }
  return groups;
}

export function HistoryPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetchHistory(user.id).then((data) => {
      setEntries(data);
      setLoading(false);
    });
  }, [user]);

  async function handleDelete(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    await deleteHistoryEntry(id);
  }

  function handleNavigate(id: string) {
    if (id === "top") navigate("/");
  }

  const groups = groupByDataset(entries);

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-4 gap-6">
      <Navbar onNavigate={handleNavigate} variant="tool" />

      <div className="w-full max-w-4xl flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Your history</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Every question you've asked, grouped by dataset
          </p>
        </div>

        {!isAuthConfigured && (
          <div className="clay p-6 text-center text-sm text-[var(--color-text-muted)]">
            Login isn't set up for this deployment yet.
          </div>
        )}

        {isAuthConfigured && !authLoading && !user && (
          <div className="clay p-6 text-center text-sm text-[var(--color-text-muted)]">
            Log in from the navbar above to see your saved history.
          </div>
        )}

        {isAuthConfigured && user && loading && (
          <div className="clay p-6 text-center text-sm text-[var(--color-text-muted)]">Loading…</div>
        )}

        {isAuthConfigured && user && !loading && entries.length === 0 && (
          <div className="clay p-6 text-center text-sm text-[var(--color-text-muted)]">
            Nothing here yet — ask a question in the tool and it'll show up here.
          </div>
        )}

        {[...groups.entries()].map(([datasetName, datasetEntries]) => (
          <div key={datasetName} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-[var(--color-text-muted)] px-1">
              {datasetName} <span className="font-normal">· {datasetEntries.length} question(s)</span>
            </h2>

            {datasetEntries.map((entry) => {
              const isExpanded = expandedId === entry.id;
              return (
                <div key={entry.id} className="clay p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      className="text-left flex-1"
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-[var(--color-text)]">{entry.question}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                          {ENGINE_LABEL[entry.engine]}
                        </span>
                      </div>
                      {entry.answer_summary && (
                        <p className="mt-1 text-sm text-[var(--color-text-muted)] italic">
                          {entry.answer_summary}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="text-xs text-[var(--color-text-muted)] hover:text-red-500 transition-colors shrink-0"
                    >
                      Delete
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 flex flex-col gap-2">
                      {entry.code && (
                        <pre className="text-xs bg-[var(--color-surface-muted)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                          {entry.code}
                        </pre>
                      )}
                      <pre className="text-xs bg-[var(--color-surface-muted)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                        {entry.result_summary}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <Footer onBackToTop={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
    </div>
  );
}
