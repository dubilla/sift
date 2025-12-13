import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import AsanaSettings from "@/components/AsanaSettings";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

export default async function SettingsPage() {
  const session = await auth();

  if (!session) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1 mb-4"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">
            Manage your integrations and preferences
          </p>
        </div>

        <div className="space-y-6">
          <AsanaSettings />

          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Account
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  Signed in as {session.user?.email}
                </p>
              </div>
              <div className="pt-4 border-t border-gray-200">
                <SignOutButton />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
