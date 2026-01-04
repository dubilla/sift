import { auth } from "@/auth";
import { redirect } from "next/navigation";
import SignInButton from "@/components/SignInButton";

export default async function Home() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-violet-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-fuchsia-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="w-full max-w-2xl space-y-8 relative z-10 animate-slide-in">
        <div className="text-center space-y-4">
          <div className="inline-block mb-4">
            <div className="text-7xl font-black gradient-text mb-2" style={{ letterSpacing: '-0.02em' }}>
              Sift
            </div>
          </div>
          <h2 className="text-3xl font-bold text-slate-800 mb-3">
            Your Inbox Zero Journey Starts Here
          </h2>
          <p className="text-xl text-slate-600 max-w-xl mx-auto">
            Transform email overload into satisfying progress. Every action brings you closer to zero.
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-12 border border-white/20">
          <div className="text-center space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-3 text-slate-700">
                <div className="flex items-center gap-2 bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-2 rounded-full border border-green-200">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-semibold text-sm">Smart Classification</span>
                </div>
                <div className="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 rounded-full border border-blue-200">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="font-semibold text-sm">Rapid Actions</span>
                </div>
              </div>
              <div className="flex items-center justify-center gap-3 text-slate-700">
                <div className="flex items-center gap-2 bg-gradient-to-r from-violet-50 to-purple-50 px-4 py-2 rounded-full border border-violet-200">
                  <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span className="font-semibold text-sm">Progress Tracking</span>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <SignInButton />
            </div>

            <p className="text-sm text-slate-500 pt-2">
              Connect your Gmail to start sifting through your inbox
            </p>
          </div>
        </div>

        <div className="text-center text-sm text-slate-500 space-y-2">
          <p className="font-medium">Join the Inbox Zero movement</p>
          <div className="flex items-center justify-center gap-6 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Fast & Efficient</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
              <span>Privacy First</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
              <span>Productivity Boost</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
