import { Button, Field, SelectField } from "../../components/ui/primitives";
import type { IconName } from "../../components/ui/Icon";
import { ANNOTATION_COLORS } from "./geometry";
import type { Tool } from "./AnnotationCanvas";

const tools: { id: Tool; label: string; icon: IconName }[] = [
  { id: "pen", label: "Pen", icon: "pen" },
  { id: "text", label: "Text", icon: "text" },
  { id: "arrow", label: "Arrow", icon: "arrow" },
  { id: "rectangle", label: "Rectangle", icon: "rectangle" },
];
export function AnnotationToolbar({
  tool,
  setTool,
  color,
  setColor,
  width,
  setWidth,
  text,
  setText,
  fontSize,
  setFontSize,
  disabled,
  canUndo,
  canRedo,
  canClear,
  undo,
  redo,
  clear,
  placeText,
}: {
  tool: Tool;
  setTool: (value: Tool) => void;
  color: string;
  setColor: (value: string) => void;
  width: number;
  setWidth: (value: number) => void;
  text: string;
  setText: (value: string) => void;
  fontSize: number;
  setFontSize: (value: number) => void;
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canClear: boolean;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  placeText: () => void;
}) {
  return (
    <div className="annotation-controls">
      <div className="annotation-toolbar">
        <div role="group" aria-label="Drawing tools" className="tool-group">
          {tools.map((item) => (
            <Button
              key={item.id}
              icon={item.icon}
              variant={tool === item.id ? "primary" : "ghost"}
              aria-pressed={tool === item.id}
              onClick={() => setTool(item.id)}
              disabled={disabled}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <fieldset className="color-picker" disabled={disabled}>
          <legend>Color</legend>
          {ANNOTATION_COLORS.map((item) => (
            <label
              key={item.value}
              className="color-option"
              style={{ "--swatch": item.value } as React.CSSProperties}
              title={item.name}
            >
              <input
                type="radio"
                name="annotation-color"
                aria-label={item.name}
                value={item.value}
                checked={color === item.value}
                onChange={() => setColor(item.value)}
              />
              <span />
            </label>
          ))}
        </fieldset>
        <SelectField
          label="Stroke width"
          value={width}
          onChange={(event) => setWidth(Number(event.target.value))}
          disabled={disabled}
        >
          <option value={3}>Fine · 3 px</option>
          <option value={6}>Medium · 6 px</option>
          <option value={12}>Bold · 12 px</option>
          <option value={24}>Heavy · 24 px</option>
        </SelectField>
        <div className="history-controls">
          <Button
            icon="undo"
            variant="ghost"
            onClick={undo}
            disabled={disabled || !canUndo}
            title="Undo (Ctrl/⌘ Z)"
          >
            Undo
          </Button>
          <Button
            icon="redo"
            variant="ghost"
            onClick={redo}
            disabled={disabled || !canRedo}
            title="Redo (Ctrl/⌘ Shift Z)"
          >
            Redo
          </Button>
          <Button
            variant="ghost"
            onClick={clear}
            disabled={disabled || !canClear}
          >
            Clear marks
          </Button>
        </div>
      </div>
      {tool === "text" && (
        <div className="text-toolbar">
          <Field
            label="Text label"
            value={text}
            maxLength={120}
            placeholder="e.g. 24 mm opening"
            onChange={(event) => setText(event.target.value)}
            disabled={disabled}
          />
          <SelectField
            label="Text size"
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
            disabled={disabled}
          >
            {[16, 24, 40, 64, 96].map((size) => (
              <option key={size} value={size}>
                {size} px
              </option>
            ))}
          </SelectField>
          <Button onClick={placeText} disabled={disabled || !text.trim()}>
            Place text in center
          </Button>
          <p>Click the image to place your label.</p>
        </div>
      )}
    </div>
  );
}
