import { auth } from "@/auth";
import { redirect } from "next/navigation";
import StatsPanel from "@/components/StatsPanel";
import EmailList from "@/components/EmailList";
import Link from "next/link";
import { TokenExpiredBanner } from "@/components/TokenExpiredBanner";

export default async function Dashboard() {
  const session = await auth();

  if (!session) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-violet-50">
      <TokenExpiredBanner />
      <StatsPanel />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="mb-3 sm:mb-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 mb-0.5 truncate">
              Inbox
            </h1>
            <p className="text-slate-600 text-xs sm:text-sm">
              {session.user?.name?.split(' ')[0]}
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/review-classifications"
              className="flex items-center gap-1.5 px-3 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-sm btn-action font-semibold text-xs sm:text-sm"
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
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
              <span className="hidden sm:inline">Review</span>
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-1.5 px-3 py-2 text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-lg transition-all shadow-sm border border-slate-200 btn-action font-semibold text-xs sm:text-sm"
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
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span className="hidden sm:inline">Settings</span>
            </Link>
          </div>
        </div>

        <EmailList userEmail={session.user?.email ?? ""} />
      </div>
    </div>
  );
}
