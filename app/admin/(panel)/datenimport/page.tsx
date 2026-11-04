import { AdminPageHeader } from "@/components/admin/page-header";
import { ImportPanel } from "./import-panel";
import { RunsLog } from "./runs-log";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  return (
    <>
      <AdminPageHeader
        title="Datenimport"
        description="Initialer Import und gezieltes Neuladen. Der Import läuft im Hintergrund weiter, auch wenn der Browser geschlossen wird."
      />
      <div className="space-y-6">
        <ImportPanel today={today} />
        <RunsLog />
      </div>
    </>
  );
}
