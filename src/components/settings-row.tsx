import type { ReactNode } from "react";

export interface SettingsRowProps {
  /** Icona lucide (o JSX equivalente) renderizzata nel quadrato arrotondato navy. */
  icon: ReactNode;
  /** Titolo della riga (es. nome impostazione). */
  title: string;
  /** Descrizione facoltativa sotto al titolo. */
  subtitle?: string;
  /** Control posizionato a destra (Switch, Input, Button, link, etc.). */
  control: ReactNode;
}

/**
 * Riga generica per pagine settings: icona a sinistra (quadrato arrotondato
 * 36px, tinta navy 6%) + title (+ subtitle opzionale) al centro + control a
 * destra. Estratto da client.settings.tsx — l'API è completamente generica
 * così altre route settings (es. trainer/notifications future) possono riusare.
 */
export function SettingsRow({ icon, title, subtitle, control }: SettingsRowProps) {
  return (
    <div className="flex items-center gap-3.5 px-5 py-4">
      <span className="size-9 rounded-[10px] bg-aura-primary/6 text-aura-primary grid place-items-center shrink-0">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-on-surface">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-outline">{subtitle}</p>}
      </div>
      {control}
    </div>
  );
}

/**
 * Linea sottile di separazione fra SettingsRow consecutive nello stesso
 * gruppo, a tutta larghezza come nel prototipo.
 */
export function SettingsDivider() {
  return <div className="h-px bg-[#f1f5f9]" />;
}
