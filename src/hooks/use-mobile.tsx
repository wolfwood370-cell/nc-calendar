import * as React from "react";

const MOBILE_BREAKPOINT = 768;
// Matches the Tailwind `xl` breakpoint (1280px). Anything below this is
// considered "no side panel room" and the trainer calendar should surface
// the focus-client panel as a Sheet rather than a sticky aside.
const XL_BREAKPOINT = 1280;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

export function useIsBelowXl() {
  const [below, setBelow] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${XL_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setBelow(window.innerWidth < XL_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setBelow(window.innerWidth < XL_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!below;
}
