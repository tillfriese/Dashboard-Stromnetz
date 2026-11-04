import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/admin-nav";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { getAdminSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  // Checked again here, independent of proxy.ts.
  const session = await getAdminSession();
  if (!session) redirect("/anmelden?next=/admin");

  return (
    <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-8 sm:px-8 sm:py-10 lg:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:h-fit">
        <AdminNav />
        <div className="mt-6 hidden border-t border-slate-200/60 pt-4 lg:block">
          <p className="truncate px-3 text-xs text-slate-500" title={session.user.email}>
            {session.user.name}
          </p>
          <SignOutButton />
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
