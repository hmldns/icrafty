import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CameraWidget, type CameraPhase } from "../camera/CameraWidget";
import type { CameraItem, HistoryItem } from "./historyTypes";
import type { ItemActions } from "./ItemRendererRegistry";

const CameraContext = createContext<{
  activeId: string | null;
  phase: CameraPhase;
  open: (item: CameraItem) => void;
} | null>(null);

export const useChatCamera = () => useContext(CameraContext);

/** Camera ownership belongs to the conversation, independently of a card's disclosure. */
export function ChatCamera({ items, actions, expanded, children }: {
  items: readonly HistoryItem[];
  actions: ItemActions;
  expanded: Record<string, boolean>;
  children: ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [phase, setPhase] = useState<CameraPhase>("off");
  const active = items.find((item): item is CameraItem => item.id === activeId && item.type === "camera");
  const cardCollapsed = !!activeId && expanded[activeId] === false;
  useEffect(() => { if (cardCollapsed) setCompact(true); }, [cardCollapsed]);
  useEffect(() => { if (activeId && !active) setActiveId(null); }, [activeId, active]);
  return <CameraContext.Provider value={{ activeId, phase, open: item => { setActiveId(item.id); setCompact(false); } }}>
    {children}
    {active && <CameraWidget key={active.id} compact={compact} onCompactChange={setCompact} onPhaseChange={setPhase}
      onClose={() => setActiveId(null)} onCapture={source => actions.capture(active, source)} />}
  </CameraContext.Provider>;
}
