import { useEffect, useRef } from "react";
import { Icon } from "./components/ui/Icon";
import { Link, usePathname } from "./router";
import { DirectoryPage } from "./pages/DirectoryPage";
import { CameraPage } from "./pages/CameraPage";
import { GalleryPage } from "./pages/GalleryPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export function App() {
  const path = usePathname();
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    document.title = `Crafty · ${path === "/" ? "The workshop" : path === "/camera" ? "Camera & annotation" : path === "/gallery" ? "Component gallery" : "Page not found"}`;
    main.current?.focus({ preventScroll: true });
  }, [path]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="brand" href="/" aria-label="Crafty home">
            <span className="brand-mark" aria-hidden="true">
              c
            </span>
            crafty<span className="brand-period">.</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/" aria-current={path === "/" ? "page" : undefined}>
              Workshop
            </Link>
            <Link
              href="/camera"
              aria-current={path === "/camera" ? "page" : undefined}
            >
              Camera & annotate
            </Link>
            <Link
              href="/gallery"
              aria-current={path === "/gallery" ? "page" : undefined}
            >
              UI gallery
            </Link>
          </nav>
          <span className="header-note">
            <span />
            Made for making
          </span>
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1} className="main-content">
        {path === "/" ? (
          <DirectoryPage />
        ) : path === "/camera" ? (
          <CameraPage />
        ) : path === "/gallery" ? (
          <GalleryPage />
        ) : (
          <NotFoundPage />
        )}
      </main>
      <footer className="site-footer">
        <span>
          Crafty <span className="footer-divider">/</span> A little ingenuity
          goes a long way.
        </span>
        <span>
          <Icon name="lock" size={14} /> Local browser workspace
        </span>
      </footer>
    </div>
  );
}
