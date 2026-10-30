import { scenarios } from "../src/lib/data";
import { runPipeline } from "../src/lib/agents/orchestrator";
(async () => {
  for (const sc of scenarios) {
    console.log(`\n################ ${sc.title}`);
    await runPipeline(sc, (e) => {
      if (e.type === "agent_done") {
        const o = e.output as Record<string, unknown>;
        console.log(`\n=== ${e.agent}`);
        if (o.markdown) console.log(o.markdown);
        else console.log(JSON.stringify(o, null, 1).slice(0, 2500));
      }
    });
  }
})();
