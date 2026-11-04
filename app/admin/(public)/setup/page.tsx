import { notFound } from "next/navigation";
import { AuthCard } from "@/components/admin/auth-card";
import { cleanupPendingUsers, hasActiveAccount } from "@/lib/auth/registration";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // Registration is permanently closed once an active account exists.
  if (await hasActiveAccount()) notFound();
  await cleanupPendingUsers();
  return (
    <AuthCard
      title="Ersteinrichtung"
      description="Lege den Admin-Account an. Die Anmeldung erfolgt ausschließlich per Passkey, ein Passwort gibt es nicht."
    >
      <SetupForm />
    </AuthCard>
  );
}
