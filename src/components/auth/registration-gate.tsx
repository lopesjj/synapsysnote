"use client";

import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { profileNeedsCompletion } from "@/lib/data/user-profile";
import { CompleteRegistrationForm } from "./complete-registration-form";

export function RegistrationGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();

  if (loading || (user && profileLoading)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--canvas)]">
        <Loader2 className="size-5 animate-spin text-muted" />
      </div>
    );
  }

  if (user && profileNeedsCompletion(user, profile)) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[var(--canvas)] px-6 py-14">
        <div className="lux-gradient w-full max-w-md rounded-[22px] border border-[var(--border)] p-7 shadow-[var(--shadow-float)] sm:p-8">
          <CompleteRegistrationForm />
        </div>
      </div>
    );
  }

  return children;
}
