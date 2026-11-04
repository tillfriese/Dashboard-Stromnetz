import { redirect } from "next/navigation";
import { AuthCard } from "@/components/admin/auth-card";
import { hasActiveAccount } from "@/lib/auth/registration";
import { getAdminSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

function safeNext(next: string | string[] | undefined): string {
  return typeof next === "string" && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";
}

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (!(await hasActiveAccount())) redirect("/admin/setup");
  const next = safeNext((await searchParams).next);
  if (await getAdminSession()) redirect(next);
  return (
    <AuthCard title="Anmelden" description="Melde dich mit deinem Passkey an (Touch ID, Face ID, Windows Hello oder Sicherheitsschlüssel).">
      <LoginForm next={next} />
    </AuthCard>
  );
}
