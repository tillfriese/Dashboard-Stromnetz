import { AdminPageHeader } from "@/components/admin/page-header";
import { getSourceStatus } from "@/lib/admin/source-status";
import { getSettingsForUi } from "@/lib/settings";
import { SourcesPanel } from "./sources-panel";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const [settings, status] = await Promise.all([getSettingsForUi(), getSourceStatus()]);
  return (
    <>
      <AdminPageHeader
        title="Datenquellen"
        description="Status, Zugangsdaten und Schalter je Quelle. Tokens werden verschlüsselt gespeichert und nur maskiert angezeigt."
      />
      <SourcesPanel initialSettings={settings} status={status} />
    </>
  );
}
