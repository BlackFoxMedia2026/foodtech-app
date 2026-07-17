"use client";

import { createContext, useContext, useState } from "react";

type SidebarCollapseState = { collapsed: boolean; toggle: () => void };

const SidebarCollapseContext = createContext<SidebarCollapseState>({
  collapsed: false,
  toggle: () => {},
});

/**
 * Owns the sidebar's collapsed/expanded state and exposes it as a CSS custom
 * property (--sidebar-w) on a `display: contents` wrapper — so the app
 * shell's grid column width and the sidebar's own conditional rendering stay
 * in sync without prop-drilling across the layout. Resets on full reload
 * (in-memory only), matching how the nav's own group state already behaves.
 */
export function SidebarCollapseProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="contents" style={{ "--sidebar-w": collapsed ? "96px" : "288px" } as React.CSSProperties}>
      <SidebarCollapseContext.Provider value={{ collapsed, toggle: () => setCollapsed((c) => !c) }}>
        {children}
      </SidebarCollapseContext.Provider>
    </div>
  );
}

export function useSidebarCollapse() {
  return useContext(SidebarCollapseContext);
}
