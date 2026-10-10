import { useRef, type Dispatch, type SetStateAction } from "react";
import type { SourceSelection } from "../ui";

type ReturnPosition = {
  section: string;
  outer: number;
  main: number;
  window: number;
};

/** Cross-view positioning stays in the workbench, independently of the source reader. */
export function useResearchLocation(
  setTab: Dispatch<SetStateAction<string>>,
  setSource: Dispatch<SetStateAction<SourceSelection | null>>,
) {
  const reportReturn = useRef<ReturnPosition | null>(null);

  const navigateToSource = (id: string, locator?: string) => {
    setSource({ id, locator });
    setTab("sources");
  };
  const openSource = (id: string, locator?: string) => {
    reportReturn.current = null;
    navigateToSource(id, locator);
  };
  const openReportSource = (id: string, section: string, locator?: string) => {
    reportReturn.current = {
      section,
      outer: document.querySelector<HTMLElement>(".engine-surface")?.scrollTop ?? 0,
      main: document.querySelector<HTMLElement>(".dr-main")?.scrollTop ?? 0,
      window: window.scrollY,
    };
    navigateToSource(id, locator);
  };
  const returnToReport = () => {
    const place = reportReturn.current;
    if (!place) return;
    setTab("report");
    requestAnimationFrame(() => {
      const outer = document.querySelector<HTMLElement>(".engine-surface");
      const main = document.querySelector<HTMLElement>(".dr-main");
      if (outer) outer.scrollTop = place.outer;
      if (main) main.scrollTop = place.main;
      window.scrollTo(0, place.window);
      document.getElementById(place.section)?.focus({ preventScroll: true });
    });
  };
  return { reportReturn, openSource, openReportSource, returnToReport };
}
