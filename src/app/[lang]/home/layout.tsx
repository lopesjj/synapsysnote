import { HomeHostGate } from "@/components/layout/home-host-gate";
import { RegistrationGate } from "@/components/auth/registration-gate";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceProvider } from "@/lib/data/provider";
import { StudyProvider } from "@/lib/study/provider";
import { StudyMetricsProvider } from "@/lib/study/hooks";
import { StudyLayer } from "@/components/study/study-layer";
import { FlashcardNotificationsWatcher } from "@/components/flashcards/flashcard-notifications";
import { FlashcardSettingsSync } from "@/components/flashcards/flashcard-settings-sync";
import { ImageLightbox } from "@/components/editor/image-lightbox";
import { LegalLayer } from "@/components/legal/legal-layer";
import { PlanSync } from "@/components/plans/plan-sync";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <HomeHostGate>
      <RegistrationGate>
        <PlanSync />
        <WorkspaceProvider>
          <StudyProvider>
            {/* As métricas do objetivo saem daqui uma vez por mudança nos dados;
                antes cada painel refazia a varredura do histórico inteiro. */}
            <StudyMetricsProvider>
              <FlashcardSettingsSync />
              <FlashcardNotificationsWatcher />
              {/* Overlay global: o editor e os flashcards abrem o mesmo visualizador. */}
              <ImageLightbox />
              <AppShell>{children}</AppShell>
              <StudyLayer />
            </StudyMetricsProvider>
          </StudyProvider>
        </WorkspaceProvider>
      </RegistrationGate>
      <LegalLayer banner={false} />
    </HomeHostGate>
  );
}
