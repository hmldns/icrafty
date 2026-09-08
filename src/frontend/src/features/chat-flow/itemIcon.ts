import type { IconName } from "../../components/ui/Icon";
import type { HistoryItem } from "./historyTypes";

/** Item identity stays visible while a separate spinner communicates activity. */
export function itemIcon(item: HistoryItem, fallback: IconName): IconName {
  if (item.type === "thought") return "thought";
  if (item.type === "measurements") return "ruler";
  if (item.type === "model" || item.type === "cad") return "cube";
  if (item.type !== "tool") return fallback;
  const name = `${item.tool.name} ${item.tool.title}`.toLowerCase();
  if (/permission|guardian|approval/.test(name)) return "shield";
  if (/measurement|dimension|guide/.test(name)) return "ruler";
  if (/image.*generat|imagegen/.test(name)) return "sparkles";
  if (/list.*image|image.*list/.test(name)) return "images";
  if (/image|photo/.test(name)) return "image";
  if (/camera|capture/.test(name)) return "camera";
  if (/cad|model|geometry|step/.test(name)) return "cube";
  if (/read|file/.test(name)) return "file";
  if (/exec|command|terminal|shell/.test(name)) return "terminal";
  return "tool";
}
