import { AdminPageHeader } from "@/components/admin/page-header";
import { VisitorsPanel } from "./visitors-panel";

export const dynamic = "force-dynamic";

export default function VisitorsPage() {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  return (
    <>
      <AdminPageHeader
        title="Besucher"
        description="Selbst gehostete Statistik ohne Cookies und ohne gespeicherte IP-Adressen. Admin-Aufrufe und Bots werden nicht gezählt."
      />
      <VisitorsPanel today={today} />
    </>
  );
}
