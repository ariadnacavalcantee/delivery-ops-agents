import { generateOperation } from "@/lib/data";
import { runPipeline } from "@/lib/agents/orchestrator";
import type { RunEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Transmite os eventos dos agentes em NDJSON para a interface acompanhar ao vivo.
export async function POST() {
  const op = generateOperation();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: RunEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runPipeline(op, emit);
      } catch {
        // erro já emitido como agent_error
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
