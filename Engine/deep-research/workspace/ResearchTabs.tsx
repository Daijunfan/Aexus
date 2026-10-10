import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

const tabs = [
  { id: "overview", label: "成果总览", icon: "dashboard" },
  { id: "graph", label: "研究地图", icon: "type-hierarchy" },
  { id: "comparison", label: "比较矩阵", icon: "table" },
  { id: "findings", label: "发现", icon: "lightbulb" },
  { id: "sources", label: "来源", icon: "globe" },
  { id: "report", label: "报告", icon: "file-text" },
] as const;

const detailViews: Record<string, string> = {
  timeline: "时间与演变",
  updates: "研究更新",
  board: "成果板",
};

export function ResearchTabs({
  active,
  jobId,
  sourceCount,
  findingCount,
  onChange,
}: {
  active: string;
  jobId: string;
  sourceCount: number;
  findingCount: number;
  onChange: (view: string) => void;
}) {
  const navRef = useRef<HTMLElement>(null);
  const isDetailView = !!detailViews[active];

  useEffect(() => {
    const align = () => {
      const nav = navRef.current;
      const tab = nav?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!nav || !tab) return;
      const container = nav.getBoundingClientRect();
      const selected = tab.getBoundingClientRect();
      nav.scrollLeft += selected.left - container.left - (nav.clientWidth - selected.width) / 2;
    };
    align();
    window.addEventListener("resize", align);
    return () => window.removeEventListener("resize", align);
  }, [active, jobId]);

  return (
    <>
      <nav ref={navRef} className="dr-tabs" role="tablist" aria-label="研究视图">
        {tabs.map((item, index) => {
          const selected = active === item.id || (item.id === "overview" && isDetailView);
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.id)}
              onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
                  : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                onChange(tabs[next].id);
                requestAnimationFrame(() =>
                  navRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus({ preventScroll: true }));
              }}
            >
              <Icon name={item.icon} />
              {item.label}
              {item.id === "sources" && <span>{sourceCount}</span>}
              {item.id === "findings" && <span>{findingCount}</span>}
            </button>
          );
        })}
      </nav>
      {isDetailView && (
        <div className="dr-view-back">
          <button onClick={() => onChange("overview")}>
            <Icon name="arrow-left" /> 返回成果总览
          </button>
          <span>/ {detailViews[active]}</span>
        </div>
      )}
    </>
  );
}
