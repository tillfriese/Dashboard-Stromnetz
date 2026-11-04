import { AuthCard } from "@/components/admin/auth-card";
import { Alert } from "@/components/ui/alert";
import { peekToken } from "@/lib/auth/registration";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

/** Passkey registration via one-time link (invitation or recovery). */
export default async function RegisterPage({ searchParams }: PageProps<"/admin/registrieren">) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : null;
  const ticket = await peekToken(token);
  if (!ticket || !token || ticket.purpose === "setup" || ticket.purpose === "signup") {
    return (
      <AuthCard title="Link ungültig">
        <Alert tone="error">Dieser Link ist ungültig, abgelaufen oder wurde bereits verwendet.</Alert>
      </AuthCard>
    );
  }
  const title = ticket.purpose === "invite" ? "Einladung annehmen" : "Zugang wiederherstellen";
  return (
    <AuthCard
      title={title}
      description={
        <>
          Account: <strong className="font-medium text-slate-700">{ticket.name}</strong> ({ticket.email})
        </>
      }
    >
      <RegisterForm token={token} purpose={ticket.purpose} />
    </AuthCard>
  );
}
