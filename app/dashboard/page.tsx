import { auth } from "@/auth";
import { redirect } from "next/navigation";
import StatsPanel from "@/components/StatsPanel";
import EmailList from "@/components/EmailList";

export default async function Dashboard() {
  const session = await auth();

  if (!session) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <StatsPanel />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Welcome back, {session.user?.name}
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Your Emails
          </h2>
          <EmailList />
        </div>
      </div>
    </div>
  );
}
