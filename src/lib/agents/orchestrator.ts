import type { AgentId, RunEvent, Scenario } from "../types";
import { AGENTS, type Ctx } from "./agents";
import { hasApiKey, MODEL } from "./llm";

// Decimais no padrão brasileiro em todo texto exibido (31.3% → 31,3%), sem mexer em milhares (11.852).
function brDecimals<T>(v: T): T {
  if (typeof v === "string") return v.replace(/(\d)\.(\d{1,2})(?!\d)/g, "$1,$2") as T;
  if (Array.isArray(v)) return v.map(brDecimals) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, brDecimals(x)])) as T;
  return v;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Orquestração:
 *   Monitor → [Diagnóstico ∥ Vendedores] → Ações → Relatório
 * Diagnóstico e Vendedores não dependem um do outro, então rodam em paralelo.
 */
export async function runPipeline(sc: Scenario, emit: (e: RunEvent) => void) {
  const live = hasApiKey();
  const ctx: Ctx = { sc };
  const t0 = Date.now();
  emit({ type: "run_start", mode: live ? "live" : "simulado", model: live ? MODEL : undefined });

  const step = async (id: AgentId) => {
    const agent = AGENTS[id];
    const start = Date.now();
    emit({ type: "agent_start", agent: id });
    try {
      const log = (message: string) => emit({ type: "agent_log", agent: id, message: brDecimals(message) });
      const { output, tokens } = await agent.run(ctx, live, log);
      if (!live && typeof window !== "undefined") await sleep(900 + Math.random() * 900); // ritmo legível no modo simulado
      (ctx as Record<string, unknown>)[id] = output;
      emit({ type: "agent_done", agent: id, output: brDecimals(output), ms: Date.now() - start, tokens });
    } catch (err) {
      emit({ type: "agent_error", agent: id, message: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  };

  await step("monitor");
  await Promise.all([step("diagnostico"), step("vendedores")]);
  await step("acoes");
  await step("relatorio");

  emit({ type: "run_done", ms: Date.now() - t0 });
  return ctx;
}
