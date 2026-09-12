import { HomeHostGate } from "@/components/layout/home-host-gate";
import { RegistrationGate } from "@/components/auth/registration-gate";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceProvider } from "@/lib/data/provider";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <HomeHostGate>
      <RegistrationGate>
        <WorkspaceProvider>
          <AppShell>{children}</AppShell>
        </WorkspaceProvider>
      </RegistrationGate>
    </HomeHostGate>
  );
}
