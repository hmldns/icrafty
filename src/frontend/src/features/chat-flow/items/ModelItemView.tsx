import { lazy, Suspense } from "react";
import { defineItemRenderer, type ItemActions } from "../ItemRendererRegistry";
import type { ModelItem } from "../historyTypes";

const InlineModelPreview = lazy(() => import("./InlineModelPreview").then((module) => ({ default: module.InlineModelPreview })));

function ModelItemView({ item, actions }: { item: ModelItem; actions: ItemActions }) {
  return (
    <div className="chat-model-item">
      <p className="chat-item-intro">{item.caption}</p>
      <Suspense fallback={<p className="chat-item-intro" role="status">Opening the 3D view…</p>}>
        <InlineModelPreview model={item.model} onSnapshot={(snapshot) => actions.snapshot(item, snapshot)} />
      </Suspense>
    </div>
  );
}

export const modelItemEntry = defineItemRenderer(
  { type: "model", label: "3D model", icon: "grid", variant: "interaction", initiallyExpanded: true },
  (item, actions) => <ModelItemView item={item} actions={actions} />,
);
