import { generateOperation } from "../src/lib/data";
import { runPipeline } from "../src/lib/agents/orchestrator";
runPipeline(generateOperation(), (e) => {
  if (e.type === "agent_done") console.log(`\n=== ${e.agent} (${e.ms}ms)\n`, JSON.stringify(e.output, null, 1).slice(0, 1800));
  else console.log(e.type, "agent" in e ? e.agent : "", "message" in e ? e.message : "");
});
