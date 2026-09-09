import { lazy, Suspense } from "react";
import { defineItemRenderer, type ItemActions } from "../ItemRendererRegistry";
import type { ModelItem } from "../historyTypes";

const InlineModelPreview = lazy(() => import("./InlineModelPreview").then((module) => ({ default: module.InlineModelPreview })));

function ModelItemView({ item, actions }: { item: ModelItem; actions: ItemActions }) {
  return (
    <div className="chat-model-item" data-artifact-id={item.model.id}>
      <div className="cad-downloads">
        <p className="chat-item-intro">{item.caption}</p>
        <a className="button button--small" href={item.model.url} download={item.model.name}>Download {item.model.format.toUpperCase()}</a>
      </div>
      <Suspense fallback={<p className="chat-item-intro" role="status">Opening the 3D view…</p>}>
        <InlineModelPreview model={item.model} onSnapshot={(snapshot) => actions.snapshot(item, snapshot)} />
      </Suspense>
    </div>
  );
}

export const modelItemEntry = defineItemRenderer(
  { type: "model", label: "3D model", icon: "cube", variant: "interaction", initiallyExpanded: true },
  (item, actions) => <ModelItemView item={item} actions={actions} />,
);
