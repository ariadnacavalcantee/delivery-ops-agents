import { generateOperation } from "@/lib/data";
import { byRestaurant, byZone, overview } from "@/lib/analysis";
import { hasApiKey, MODEL } from "@/lib/agents/llm";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default function Home() {
  const op = generateOperation();
  return (
    <Dashboard
      city={op.city}
      window={op.window}
      overview={overview(op)}
      zones={byZone(op)}
      restaurants={byRestaurant(op)}
      live={hasApiKey()}
      model={MODEL}
    />
  );
}
