import { useMemo, useState } from "react";
import type { AskStage, ConversationTurn } from "../hooks/useAskQuestion";
import type { Engine } from "../lib/llm";
import { PROVIDER_OPTIONS, type ProviderId } from "../lib/providers";
import { chooseChartType } from "../lib/chartSelection";
import { ResultTable } from "./ResultTable";
import { ChartViewer } from "./ChartViewer";

interface AnswerCardProps {
  turn: ConversationTurn;
  number: number;
  devMode?: boolean;
  disableActions: boolean;
  /** Currently-selected provider — compared against turn.provider to show a fallback note if they differ (Phase 30). */
  selectedProvider: ProviderId;
  onRegenerate: (turnId: number) => void;
}

const STAGE_LABELS: Record<AskStage, string> = {
  "generating-sql": "Thinking about how to answer this…",
  validating: "Checking the code is safe to run…",
  "loading-python": "Starting the Python engine (first time only, ~10-20s)…",
  "computing-stats": "Computing real statistics about your data…",
  "running-query": "Running it…",
  done: "",
  error: "",
};

const ENGINE_BADGE_STYLES: Record<Engine, string> = {
  sql: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  python: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  insights: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  meta: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const ENGINE_LABELS: Record<Engine, string> = {
  sql: "SQL",
  python: "Python",
  insights: "Insights",
  meta: "Info",
};

export function AnswerCard({
  turn,
  number,
  devMode = false,
  disableActions,
  selectedProvider,
  onRegenerate,
}: AnswerCardProps) {
  const { stage, question, sql, engine, provider, result, narrative, statsSummary, error, attemptsUsed, summary } = turn;
  const [copied, setCopied] = useState(false);

  const isBusy =
    stage === "generating-sql" ||
    stage === "validating" ||
    stage === "loading-python" ||
    stage === "computing-stats" ||
    stage === "running-query";

  const providerLabel = PROVIDER_OPTIONS.find((p) => p.id === provider)?.label ?? provider;
  const usedFallback = stage === "done" && provider !== selectedProvider;

  // Sort tweaks only apply when the result fits the classic "one label +
  // one numeric value" shape chooseChartType already detects — for wider,
  // multi-column results there's no unambiguous "the number" to sort by,
  // so the sort override is silently a no-op rather than guessing a column.
  const displayResult = useMemo(() => {
    if (!result || !turn.displayOverride?.sort) return result;
    const rawChartSpec = chooseChartType(result);
    if (!rawChartSpec) return result;
    const key = rawChartSpec.valueKey;
    const sorted = [...result.rows].sort((a, b) => {
      const av = Number(a[key]);
      const bv = Number(b[key]);
      return turn.displayOverride!.sort === "asc" ? av - bv : bv - av;
    });
    return { ...result, rows: sorted };
  }, [result, turn.displayOverride]);

  async function handleCopyCode() {
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail in locked-down contexts — silently no-op
      // rather than showing an error for a non-critical convenience action.
    }
  }

  const displayedResult = displayResult ?? result;

  return (
    <div className="turn-enter flex gap-3 w-full">
      <div className="flex-shrink-0 flex items-start justify-center pt-6">
        <span
          className="clay flex items-center justify-center h-8 w-8 text-xs font-semibold text-[var(--color-accent)]"
          style={{ borderRadius: 9999 }}
        >
          {number}
        </span>
      </div>

      <div className="clay p-6 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-[var(--color-text-muted)]">You asked</p>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <p className="font-medium text-[var(--color-text)]">{question}</p>
              {engine && (
                <span
                  className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${ENGINE_BADGE_STYLES[engine]}`}
                >
                  {ENGINE_LABELS[engine]}
                </span>
              )}
              {engine && (
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">
                  {providerLabel}
                </span>
              )}
              {usedFallback && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  title="Your selected provider was busy, so this answer came from a different one automatically"
                >
                  auto-switched
                </span>
              )}
              {stage === "done" && attemptsUsed > 1 && (
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
                  Self-corrected after {attemptsUsed} attempts
                </span>
              )}
            </div>
          </div>

          {stage === "done" && (
            <button
              onClick={() => onRegenerate(turn.id)}
              disabled={disableActions}
              title="Ask this again, replacing this answer with a fresh attempt"
              aria-label="Regenerate this answer"
              className="flex-shrink-0 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)] disabled:opacity-40 disabled:pointer-events-none"
            >
              ↻ Regenerate
            </button>
          )}
        </div>

        {isBusy && (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1">
              <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
              <span
                className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
                style={{ animationDelay: "0.15s" }}
              />
              <span
                className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
                style={{ animationDelay: "0.3s" }}
              />
            </span>
            {STAGE_LABELS[stage]}
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {narrative && (
          <div className="mb-4">
            <p className="text-[var(--color-text)] leading-relaxed">{narrative}</p>
            {statsSummary && (
              <details className="mt-3 group">
                <summary className="text-xs text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-text)] select-none">
                  Show the real numbers behind this
                </summary>
                <pre className="mt-2 clay-inset p-3 text-xs text-[var(--color-text-muted)] whitespace-pre-wrap font-mono">
                  {statsSummary}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Visual Chart Section (ECharts Smart Charting) */}
        {result && (
          <ChartViewer
            chart={turn.chart}
            result={displayedResult ?? result}
            explanation={turn.explanation}
            onPinToDashboard={(pinData) => {
              console.log("Chart pinned to dashboard:", pinData);
            }}
          />
        )}

        {/* Collapsible Progressive Reveal Query Code Section */}
        {sql && (
          <details className="mb-4 group" open={devMode}>
            <summary className="text-xs font-semibold text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-accent)] select-none flex items-center gap-1.5 py-1">
              <span>⚡ View Generated {engine === "python" ? "Python Code" : "SQL Query"}</span>
            </summary>
            <div className="relative mt-2">
              <pre className="clay-inset p-3 pr-16 text-xs text-[var(--color-text)] whitespace-pre-wrap font-mono overflow-x-auto">
                {sql}
              </pre>
              <button
                onClick={handleCopyCode}
                className="absolute top-2 right-2 text-[10px] font-medium px-2 py-1 rounded-full clay clay-pressable text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </details>
        )}

        {/* Raw Data Table */}
        {result && <ResultTable result={displayedResult ?? result} questionForFilename={question} />}

        {summary && (engine === "sql" || engine === "python") && (
          <p className="mt-3 text-sm text-[var(--color-text-muted)] italic leading-relaxed">{summary}</p>
        )}
      </div>
    </div>
  );
}
