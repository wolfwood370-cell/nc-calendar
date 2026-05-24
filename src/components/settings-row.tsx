import type { ReactNode } from "react";

export interface SettingsRowProps {
  /** Icona lucide (o JSX equivalente) renderizzata nel cerchio primary container. */
  icon: ReactNode;
  /** Titolo della riga (es. nome impostazione). */
  title: string;
  /** Descrizione facoltativa sotto al titolo. */
  subtitle?: string;
  /** Control posizionato a destra (Switch, Input, Button, link, etc.). */
  control: ReactNode;
}

/**
 * Riga generica per pagine settings: icon a sinistra (cerchio primary) +
 * title (+ subtitle opzionale) al centro + control a destra. Estratto da
 * client.settings.tsx — l'API è completamente generica così altre route
 * settings (es. trainer/notifications future) possono riusare.
 */
export function SettingsRow({ icon, title, subtitle, control }: SettingsRowProps) {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <span className="size-10 rounded-full bg-primary-container/10 text-primary-container grid place-items-center">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium text-on-surface">{title}</p>
        {subtitle && <p className="text-sm text-on-surface-variant">{subtitle}</p>}
      </div>
      {control}
    </div>
  );
}

/**
 * Linea sottile di separazione fra SettingsRow consecutive nello stesso
 * gruppo. Margine x-5 per allinearsi al padding delle row.
 */
export function SettingsDivider() {
  return <div className="h-px bg-outline-variant/40 mx-5" />;
}
