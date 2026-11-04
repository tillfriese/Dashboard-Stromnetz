import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/safe-next";
import { getUserSession } from "@/lib/auth/session";
import { AuthPanel } from "./auth-panel";

export const metadata: Metadata = { title: "Anmelden", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: PageProps<"/anmelden">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getUserSession()) redirect(next);
  return (
    <main className="mx-auto max-w-md px-4 py-10 sm:py-16">
      <AuthPanel next={next} initialMode={sp.modus === "registrieren" ? "register" : "login"} />
    </main>
  );
}
