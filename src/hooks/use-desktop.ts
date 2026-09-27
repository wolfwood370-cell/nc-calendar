import { useEffect, useState } from "react";

const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * true da md in su; undefined finché non si è misurato (primo render e
 * server). Serve alle route che montano una sola versione, telefono o
 * desktop (Profilo cliente, Tipologie). useIsMobile non basta: al primo
 * render dice false, cioè desktop, anche sul telefono.
 */
export function useDesktop(): boolean | undefined {
  const [wide, setWide] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setWide(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return wide;
}
