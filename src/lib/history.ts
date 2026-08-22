import { supabase } from "./supabase";
import type { Engine } from "./llm";

export interface HistoryEntry {
  id: string;
  dataset_name: string;
  question: string;
  engine: Engine;
  code: string | null;
  result_summary: string;
  answer_summary: string | null;
  created_at: string;
}

interface SaveHistoryArgs {
  userId: string;
  datasetName: string;
  question: string;
  engine: Engine;
  code: string | null;
  resultSummary: string;
  answerSummary: string | null;
}

// Fails silently by design (returns void either way) — a lost history row
// should never surface as an error to someone who's mid-conversation with
// their actual data. The tool works identically whether or not this succeeds.
export async function saveHistoryEntry(args: SaveHistoryArgs): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("conversation_history").insert({
      user_id: args.userId,
      dataset_name: args.datasetName,
      question: args.question,
      engine: args.engine,
      code: args.code,
      result_summary: args.resultSummary,
      answer_summary: args.answerSummary,
    });
  } catch {
    // Best-effort persistence only.
  }
}

export async function fetchHistory(userId: string): Promise<HistoryEntry[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("conversation_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return data as HistoryEntry[];
  } catch {
    return [];
  }
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("conversation_history").delete().eq("id", id);
  } catch {
    // Best-effort — a delete that silently doesn't happen is far less bad
    // than an error interrupting someone browsing their own history.
  }
}
