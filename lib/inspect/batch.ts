/**
 * Bounded-concurrency batch inspection.
 *
 * A naive `Promise.all` over 50 URLs would open 50×4 sockets at once (fetch,
 * robots, TLS, DNS) and get the whole deployment rate-limited or OOM-killed.
 * This runs a fixed number of workers pulling from a shared queue, so memory and
 * socket usage stay flat regardless of input size.
 */

import { inspect, type InspectionReport } from "./report";
import { BlockedTargetError } from "./url";

export interface BatchEntry {
  input: string;
  ok: boolean;
  /** Present only when `ok`. */
  report?: InspectionReport;
  /** Present only when `!ok`; states the actual reason. */
  error?: string;
  errorKind?: string;
}

export const MAX_BATCH_URLS = 20;
const CONCURRENCY = 3;

export async function inspectBatch(
  inputs: string[],
  concurrency = CONCURRENCY,
): Promise<BatchEntry[]> {
  const unique = [...new Set(inputs.map((i) => i.trim()).filter(Boolean))].slice(0, MAX_BATCH_URLS);
  const results: BatchEntry[] = new Array(unique.length);

  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= unique.length) return;
      const input = unique[index];
      try {
        results[index] = { input, ok: true, report: await inspect(input) };
      } catch (error) {
        const isBlocked = error instanceof BlockedTargetError;
        results[index] = {
          input,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          errorKind: isBlocked ? (error as BlockedTargetError).reason : "fetch",
        };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()),
  );

  return results;
}
