import Dashboard from "@/components/Dashboard";
import { fetchTelemetry } from "@/lib/api";

export default async function Home() {
  const initial = await fetchTelemetry(50).catch(() => null);
  return <Dashboard initial={initial} />;
}
