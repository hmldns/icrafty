import { lazy, Suspense, useEffect, useRef } from "react";
import { Icon } from "./components/ui/Icon";
import { Link, ROUTES, usePathname } from "./router";
import { DirectoryPage } from "./pages/DirectoryPage";
import { CameraPage } from "./pages/CameraPage";
import { GalleryPage } from "./pages/GalleryPage";
import { ChatDebugPage } from "./pages/ChatDebugPage";
import { AgentDebugPage } from "./pages/AgentDebugPage";
import { NotFoundPage } from "./pages/NotFoundPage";
const ModelGalleryPage = lazy(() =>
  import("./pages/ModelGalleryPage").then((module) => ({
    default: module.ModelGalleryPage,
  })),
);

export function App() {
  const path = usePathname();
  const workspace = [ROUTES.camera, ROUTES.models, ROUTES.chat].some(
    (route) => route === path,
  );
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const pageTitle =
      path === ROUTES.directory
        ? "The workshop"
        : path === ROUTES.camera
          ? "Camera & annotation"
          : path === ROUTES.gallery
            ? "Component gallery"
            : path === ROUTES.models
              ? "Model gallery"
              : path === ROUTES.chat
                ? "Chat flow mock"
                : path === ROUTES.agent ? "Live agent chat" : "Page not found";
    document.title = `icrafty · ${pageTitle}`;
    main.current?.focus({ preventScroll: true });
  }, [path]);
  return (
    <div className={`app-shell${workspace ? " app-shell--workspace" : ""}${path === ROUTES.agent ? " app-shell--agent" : ""}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <Link
            className="brand"
            href={ROUTES.directory}
            aria-label="icrafty home"
          >
            <span className="brand-mark" aria-hidden="true">
              c
            </span>
            icrafty<span className="brand-period">.</span>
          </Link>
          <nav aria-label="Main navigation" className="debug-navigation">
            <Link
              href={ROUTES.directory}
              aria-current={path === ROUTES.directory ? "page" : undefined}
            >
              Workshop
            </Link>
            <Link
              href={ROUTES.camera}
              aria-current={path === ROUTES.camera ? "page" : undefined}
            >
              Camera & annotate
            </Link>
            <Link
              href={ROUTES.gallery}
              aria-current={path === ROUTES.gallery ? "page" : undefined}
            >
              UI gallery
            </Link>
            <Link
              href={ROUTES.models}
              aria-current={path === ROUTES.models ? "page" : undefined}
            >
              Models
            </Link>
            <Link
              href={ROUTES.chat}
              aria-current={path === ROUTES.chat ? "page" : undefined}
            >
              Chat
            </Link>
            <Link href={ROUTES.agent} aria-current={path === ROUTES.agent ? "page" : undefined}>Live chat</Link>
          </nav>
          <span className="header-note">
            <span />
            Made for making
          </span>
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1} className="main-content">
        {path === ROUTES.directory ? (
          <DirectoryPage />
        ) : path === ROUTES.camera ? (
          <CameraPage />
        ) : path === ROUTES.gallery ? (
          <GalleryPage />
        ) : path === ROUTES.models ? (
          <Suspense fallback={<p role="status">Opening the model gallery…</p>}>
            <ModelGalleryPage />
          </Suspense>
        ) : path === ROUTES.chat ? (
          <ChatDebugPage />
        ) : path === ROUTES.agent ? (
          <AgentDebugPage />
        ) : (
          <NotFoundPage />
        )}
      </main>
      <footer className="site-footer">
        <span>
          icrafty <span className="footer-divider">/</span> A little ingenuity
          goes a long way.
        </span>
        <span>
          <Icon name="lock" size={14} /> {path === ROUTES.agent ? "Saved locally · connected to Codex" : "Local workshop"}
        </span>
      </footer>
    </div>
  );
}
