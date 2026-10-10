import type { ReactNode } from "react";

/** Codicons follow the host's existing icon font and theme. */
export function Icon({ name }: { name: string }) {
  return <span className={"codicon codicon-" + name} aria-hidden="true" />;
}

export function Empty({ icon, children }: { icon: string; children: ReactNode }) {
  return <div className="dr-empty"><Icon name={icon} /><p>{children}</p></div>;
}
