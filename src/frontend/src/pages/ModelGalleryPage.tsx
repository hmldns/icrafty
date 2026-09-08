import { ModelGallery } from "../features/models/ModelGallery";

export function ModelGalleryPage() {
  return (
    <div className="model-page">
      <header className="page-intro">
        <div>
          <p className="eyebrow">03 / Inspect & explain</p>
          <h1>Another perspective.</h1>
          <p>
            Explore a model. Section the view. Freeze it and mark what matters.
          </p>
        </div>
      </header>
      <ModelGallery />
    </div>
  );
}
