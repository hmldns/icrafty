import { Icon } from "../components/ui/Icon";
import { Badge } from "../components/ui/primitives";
import { Link, ROUTES } from "../router";

function WorkshopDrawing() {
  return (
    <svg
      className="workshop-drawing"
      viewBox="0 0 440 300"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="1.5">
        <path d="M125 93h144l-12 140H137L125 93Z" />
        <ellipse cx="197" cy="93" rx="72" ry="17" />
        <path d="M268 112h15c55 0 46 80-21 73M270 127h11c30 0 24 42-17 44M148 213h92" />
        <ellipse cx="197" cy="45" rx="76" ry="18" strokeDasharray="5 5" />
        <path d="M197 12v14m0 38v16M112 265h162m-162-5v10m162-10v10M306 92v143m-6-143h12m-12 143h12" />
        <path d="m68 217 30-34 7 7-30 34-10 3 3-10Zm25-29 7 7" />
      </g>
      <g className="drawing-accent" stroke="currentColor" strokeWidth="2">
        <path d="m96 35 28 10m-5-7 5 7-8 2M306 47h42m-6-6 6 6-6 6" />
        <circle cx="195" cy="155" r="23" strokeDasharray="4 4" />
      </g>
      <text x="171" y="285">
        measure twice.
      </text>
      <text x="288" y="35" className="drawing-label">
        a fresh start
      </text>
      <path d="m90 240 13 4m-11 3 10-2" stroke="currentColor" opacity=".4" />
    </svg>
  );
}

export function DirectoryPage() {
  return (
    <div className="directory-page">
      <section className="directory-hero">
        <div>
          <p className="eyebrow">
            The icrafty workshop <span>001</span>
          </p>
          <h1>
            Good things deserve
            <br />
            <em>another go.</em>
          </h1>
          <p className="hero-description">
            Look a little closer. Mark what matters.
            <br />
            Make something work a little better.
          </p>
          <div className="hero-caption">
            <span className="little-rule" />
            Small tools for your next good idea.
          </div>
        </div>
        <WorkshopDrawing />
      </section>
      <section aria-labelledby="tools-title" className="directory-tools">
        <div className="section-heading">
          <h2 id="tools-title">On the workbench</h2>
          <span className="eyebrow">Four places to begin</span>
        </div>
        <div className="directory-grid">
          <Link
            href={ROUTES.camera}
            className="directory-card directory-card--camera"
          >
            <div className="directory-card-top">
              <span className="directory-number">01 / OBSERVE & EXPLAIN</span>
              <Icon name="arrow" />
            </div>
            <div className="directory-card-icon">
              <Icon name="camera" size={38} />
              <span>
                <Icon name="pen" size={20} />
              </span>
            </div>
            <div>
              <h3>Camera & annotation</h3>
              <p>
                Gather a few perspectives. Draw, label, and download an image
                that says what you mean.
              </p>
            </div>
            <div className="directory-card-bottom">
              <span>
                Open the image workspace <Icon name="right" size={16} />
              </span>
              <Badge tone="accent">Ready to use</Badge>
            </div>
          </Link>
          <Link href={ROUTES.gallery} className="directory-card">
            <div className="directory-card-top">
              <span className="directory-number">02 / EXPLORE THE DETAILS</span>
              <Icon name="arrow" />
            </div>
            <div className="gallery-card-samples" aria-hidden="true">
              <span>Aa</span>
              <span />
              <span />
              <span />
            </div>
            <div>
              <h3>The component gallery</h3>
              <p>
                The colors, type, and everyday components that give our workshop
                its character.
              </p>
            </div>
            <div className="directory-card-bottom">
              <span>
                Browse the building blocks <Icon name="right" size={16} />
              </span>
              <Badge>Design system</Badge>
            </div>
          </Link>
          <Link href={ROUTES.models} className="directory-card">
            <div className="directory-card-top">
              <span className="directory-number">03 / INSPECT & EXPLAIN</span>
              <Icon name="arrow" />
            </div>
            <div className="directory-card-icon">
              <Icon name="image" size={38} />
            </div>
            <div>
              <h3>The model gallery</h3>
              <p>
                Turn a part around, look inside, then freeze a view to annotate
                and download.
              </p>
            </div>
            <div className="directory-card-bottom">
              <span>
                Open the 3D workspace <Icon name="right" size={16} />
              </span>
              <Badge>STEP & STL</Badge>
            </div>
          </Link>
          <Link href={ROUTES.chat} className="directory-card">
            <div className="directory-card-top">
              <span className="directory-number">04 / GATHER THE STORY</span>
              <Icon name="arrow" />
            </div>
            <div className="directory-card-icon">
              <Icon name="text" size={38} />
              <span>
                <Icon name="image" size={20} />
              </span>
            </div>
            <div>
              <h3>The chat flow</h3>
              <p>
                Explore a repair’s sample history. Choose image versions and try
                an input with a little more context.
              </p>
            </div>
            <div className="directory-card-bottom">
              <span>
                Try the conversation <Icon name="right" size={16} />
              </span>
              <Badge tone="accent">Local mock</Badge>
            </div>
          </Link>
        </div>
      </section>
      <aside className="directory-note">
        <Icon name="lock" size={18} />
        <p>
          This is a local workshop. Your images and edits stay in this browser.
          Download your work to keep a copy.
        </p>
      </aside>
    </div>
  );
}
