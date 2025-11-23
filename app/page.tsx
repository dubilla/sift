import { auth } from "@/auth";
import { redirect } from "next/navigation";
import SignInButton from "@/components/SignInButton";

export default async function Home() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Sift</h1>
          <p className="text-gray-600">Your path to inbox zero</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-semibold text-gray-800">
              Welcome to Sift
            </h2>
            <p className="text-gray-600">
              Sign in with Google to start managing your emails
            </p>
            <SignInButton />
          </div>
        </div>
      </div>
    </main>
  );
}
