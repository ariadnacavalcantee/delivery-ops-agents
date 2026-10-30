import { generateOperation } from "@/lib/data";
import { baselineLateRatePct, overview, stageTimes, timeline } from "@/lib/analysis";
import Dashboard from "@/components/Dashboard";

export default function Home() {
  const op = generateOperation();
  return (
    <Dashboard
      city={op.city}
      overview={overview(op)}
      baseline={baselineLateRatePct(op)}
      timeline={timeline(op)}
      stages={stageTimes(op)}
    />
  );
}
