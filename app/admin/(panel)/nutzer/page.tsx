import { AdminPageHeader } from "@/components/admin/page-header";
import { listUsers } from "@/lib/admin/users";
import { getAdminSession } from "@/lib/auth/session";
import { UsersTable } from "./users-table";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getAdminSession();
  if (!session) return null; // layout already redirects
  const users = await listUsers();
  return (
    <>
      <AdminPageHeader
        title="Nutzer"
        description="Alle registrierten Konten. Admins können Nutzer befördern, Admin-Rechte entziehen und Konten löschen."
      />
      <UsersTable initial={users} selfId={session.user.id} />
    </>
  );
}
