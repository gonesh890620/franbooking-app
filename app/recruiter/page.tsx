import RecruiterDashboard from "@/components/RecruiterDashboard";
import { getSession } from "@/lib/auth";

export default function RecruiterPage() {
  const session = getSession();
  return (
    <RecruiterDashboard
      initialUser={session ? { email: session.email, name: session.name, impersonatorEmail: session.impersonatorEmail, impersonatorName: session.impersonatorName } : null}
    />
  );
}
