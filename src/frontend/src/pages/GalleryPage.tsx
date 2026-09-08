import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  LoadingState,
  Notice,
  SelectField,
} from "../components/ui/primitives";
import { Dialog } from "../components/ui/Dialog";
import { Tabs } from "../components/ui/Tabs";

export function GalleryPage() {
  const [tab, setTab] = useState<"original" | "marked">("original");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [selected, setSelected] = useState("pen");
  return (
    <div className="gallery-page">
      <header className="page-intro">
        <div>
          <p className="eyebrow">02 / The details make the difference</p>
          <h1>Made of small, good things.</h1>
          <p>The same components you’ll find throughout the Crafty workshop.</p>
        </div>
        <Badge>Component gallery</Badge>
      </header>
      <div className="gallery-grid">
        <Card className="gallery-section gallery-section--wide">
          <div className="gallery-label">01 — Foundation</div>
          <div className="foundation-grid">
            <div>
              <p className="eyebrow">Typography</p>
              <h2 className="type-sample">A useful kind of beautiful.</h2>
              <p>Warm surfaces, clear words, and room to think.</p>
              <p className="small">
                System sans for everyday tasks. A little serif for character.
              </p>
              <code>24 mm · 1,600 × 1,200 px</code>
            </div>
            <div>
              <p className="eyebrow">Color & material</p>
              <div className="token-swatches">
                {[
                  { name: "Workshop", css: "surface", hex: "#f7f5ef" },
                  { name: "Paper", css: "paper", hex: "#fffefa" },
                  { name: "Ink", css: "ink", hex: "#252923" },
                  { name: "Vermilion", css: "accent", hex: "#bc402a" },
                ].map((token) => (
                  <div key={token.css}>
                    <span
                      className={`token-swatch token-swatch--${token.css}`}
                    />
                    <strong>{token.name}</strong>
                    <code>{token.hex}</code>
                  </div>
                ))}
              </div>
              <div className="spacing-sample">
                <span />4 <span />8 <span />
                16 <span />
                24 <span />
                32 <span />
                48
              </div>
              <p className="small">
                A 4 px spacing scale · soft corners · crisp borders
              </p>
            </div>
          </div>
        </Card>
        <Card className="gallery-section">
          <div className="gallery-label">02 — Actions</div>
          <h2>Buttons with a purpose</h2>
          <div className="gallery-examples">
            <Button
              variant="primary"
              icon="download"
              onClick={() => setDialogOpen(true)}
            >
              Primary action
            </Button>
            <Button icon="plus" onClick={() => setDialogOpen(true)}>
              Secondary
            </Button>
            <Button variant="ghost" onClick={() => setDialogOpen(true)}>
              Quiet action
            </Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={() => setDialogOpen(true)}
            >
              Delete
            </Button>
            <Button variant="primary" disabled>
              Primary disabled
            </Button>
            <Button disabled>Secondary disabled</Button>
            <Button variant="ghost" disabled>
              Ghost disabled
            </Button>
            <Button variant="danger" disabled>
              Danger disabled
            </Button>
            <Button size="small" icon="check">
              Compact
            </Button>
          </div>
          <p className="small">
            Visible focus, comfortable targets, explicit disabled states.
          </p>
        </Card>
        <Card className="gallery-section">
          <div className="gallery-label">03 — Inputs</div>
          <h2>A place for the details</h2>
          <div className="gallery-fields">
            <Field
              label="Image name"
              placeholder="A closer look at the handle"
              hint="A useful name makes things easier to find."
            />
            <Field
              label="Image URL example"
              defaultValue="not-an-image"
              error="Use a direct HTTP or HTTPS image URL."
            />
            <Field
              label="Read-only source"
              defaultValue="Original image preserved"
              disabled
            />
            <SelectField
              label="Drawing tool"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="pen">Freehand pen</option>
              <option value="text">Text label</option>
              <option value="arrow">Arrow</option>
            </SelectField>
          </div>
        </Card>
        <Card className="gallery-section">
          <div className="gallery-label">04 — Selection & labels</div>
          <h2>A little orientation</h2>
          <Tabs
            label="Image version example"
            value={tab}
            onChange={setTab}
            options={[
              {
                value: "original",
                label: "Original image",
                content: (
                  <p>
                    Your source stays intact. Add marks to an editable draft.
                  </p>
                ),
              },
              {
                value: "marked",
                label: "Annotated draft",
                content: (
                  <p>Editable marks, ready for another round of feedback.</p>
                ),
              },
            ]}
          />
          <div className="gallery-examples">
            <Badge>Original</Badge>
            <Badge tone="accent">3 marks</Badge>
            <Badge tone="success">Saved locally</Badge>
          </div>
          <fieldset className="selection-example">
            <legend>Example selection</legend>
            <label>
              <input type="radio" name="example-view" defaultChecked /> Fit
              image
            </label>
            <label>
              <input type="radio" name="example-view" /> Actual size
            </label>
          </fieldset>
        </Card>
        <Card className="gallery-section">
          <div className="gallery-label">05 — Feedback</div>
          <h2>Know where things stand</h2>
          <div className="gallery-states">
            <Notice tone="success" title="Revision saved">
              Your original and editable marks are preserved.
            </Notice>
            <Notice tone="error" title="Image could not be read">
              Try a PNG, JPEG or WebP file up to 12 MB.
            </Notice>
            <Notice>Images and edits are stored in this browser.</Notice>
            <LoadingState>Preparing your image…</LoadingState>
          </div>
        </Card>
        <Card className="gallery-section">
          <div className="gallery-label">06 — Empty spaces</div>
          <EmptyState
            title="Room for a new perspective"
            action={
              <Button icon="plus" onClick={() => setDialogOpen(true)}>
                Add an image
              </Button>
            }
          >
            A helpful starting point, with one clear next step.
          </EmptyState>
        </Card>
        <Card className="gallery-section">
          <div className="gallery-label">07 — A moment of focus</div>
          <h2>Dialogs that stay out of the way</h2>
          <p>
            A native modal keeps keyboard focus inside, supports Escape, and
            returns focus when it closes.
          </p>
          <Button icon="grid" onClick={() => setDialogOpen(true)}>
            Open example dialog
          </Button>
          {confirmed && (
            <Notice tone="success">
              Example confirmed. You’re back in the gallery.
            </Notice>
          )}
        </Card>
      </div>
      {dialogOpen && (
        <Dialog
          title="A little room to focus"
          description="This is the same dialog used for image annotation and deletion."
          onClose={() => setDialogOpen(false)}
        >
          <div className="dialog-body">
            <Field label="Example label" placeholder="24 mm opening" />
            <p className="small">
              Try Tab to move between controls, or Escape to close.
            </p>
            <div className="dialog-actions">
              <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirmed(true);
                  setDialogOpen(false);
                }}
              >
                Confirm example
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
