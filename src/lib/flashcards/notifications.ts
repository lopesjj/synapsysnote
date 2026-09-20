export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

export const FLASHCARD_NOTIFICATION_TAG = "synapsys-flashcards-due";

export function notificationPermission(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as NotificationPermissionState;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission as NotificationPermissionState;
  try {
    return (await Notification.requestPermission()) as NotificationPermissionState;
  } catch {
    return notificationPermission();
  }
}

/**
 * Dispara a notificação do sistema. Retorna false quando o navegador não a
 * entregou — sem permissão, sem suporte, ou porque o construtor `Notification`
 * é proibido no contexto atual (Android/Chrome exige um service worker).
 * Quem chama usa o retorno para decidir se ainda precisa avisar dentro do app.
 */
export function showFlashcardNotification(options: {
  title: string;
  body: string;
  onClick?: () => void;
}): boolean {
  if (notificationPermission() !== "granted") return false;
  try {
    const notification = new Notification(options.title, {
      body: options.body,
      icon: "/icon.png",
      tag: FLASHCARD_NOTIFICATION_TAG,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
      options.onClick?.();
    };
    return true;
  } catch {
    return false;
  }
}

/**
 * Marcador do lembrete já entregue. Inclui o horário configurado, e não só a
 * data: sem isso, mudar o horário depois do primeiro disparo deixava o lembrete
 * travado até a meia-noite seguinte.
 */
export function reminderSlot(notificationTime: string, at: Date = new Date()): string {
  const date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(
    at.getDate()
  ).padStart(2, "0")}`;
  return `${date}T${notificationTime}`;
}

/** Minutos desde a meia-noite para um horário "HH:MM"; -1 quando inválido. */
export function minutesFromTime(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
  if (!match) return -1;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return -1;
  return hours * 60 + minutes;
}
