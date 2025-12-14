"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function ReconnectGoogleButton() {
  const [isReconnecting, setIsReconnecting] = useState(false);

  const handleReconnect = async () => {
    try {
      setIsReconnecting(true);

      const response = await fetch("/api/auth/unlink-google", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to unlink Google account");
      }

      await signIn("google", { callbackUrl: "/dashboard" });
    } catch (error) {
      console.error("Error reconnecting Google account:", error);
      alert("Failed to reconnect Google account. Please try again.");
      setIsReconnecting(false);
    }
  };

  return (
    <button
      onClick={handleReconnect}
      disabled={isReconnecting}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isReconnecting ? "Reconnecting..." : "Re-connect Google Account"}
    </button>
  );
}
