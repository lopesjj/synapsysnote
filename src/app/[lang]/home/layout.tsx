import { HomeHostGate } from "@/components/layout/home-host-gate";
import { RegistrationGate } from "@/components/auth/registration-gate";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceProvider } from "@/lib/data/provider";
import { FlashcardNotificationsWatcher } from "@/components/flashcards/flashcard-notifications";
import { FlashcardSettingsSync } from "@/components/flashcards/flashcard-settings-sync";
import { ImageLightbox } from "@/components/editor/image-lightbox";
import { LegalLayer } from "@/components/legal/legal-layer";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <HomeHostGate>
      <RegistrationGate>
        <WorkspaceProvider>
          <FlashcardSettingsSync />
          <FlashcardNotificationsWatcher />
          {/* Overlay global: o editor e os flashcards abrem o mesmo visualizador. */}
          <ImageLightbox />
          <AppShell>{children}</AppShell>
        </WorkspaceProvider>
      </RegistrationGate>
      <LegalLayer banner={false} />
    </HomeHostGate>
  );
}
