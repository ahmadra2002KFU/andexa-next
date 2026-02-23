import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell"

export default async function Home() {
  const session = await auth()

  if (!session) {
    redirect("/login")
  }

  return <AppShell userName={session.user?.name || session.user?.email || "User"} />
}
