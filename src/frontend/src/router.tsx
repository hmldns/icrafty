import {
  useEffect,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
} from "react";

export const ROUTES = {
  repair: "/",
  directory: "/debug",
  camera: "/debug/camera",
  gallery: "/debug/gallery",
  models: "/debug/models",
  chat: "/debug/chat",
  agent: "/debug/agent",
} as const;

const redirects: Readonly<Record<string, string>> = {
  "/camera": ROUTES.camera,
  "/gallery": ROUTES.gallery,
};

const subscribe = (callback: () => void) => {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
};
export function usePathname(): string {
  const pathname = useSyncExternalStore(
    subscribe,
    () => window.location.pathname.replace(/\/$/, "") || "/",
    () => ROUTES.directory,
  );
  const destination = redirects[pathname] ?? pathname;
  useEffect(() => {
    if (pathname === destination) return;
    window.history.replaceState(
      window.history.state,
      "",
      destination + window.location.search + window.location.hash,
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [pathname, destination]);
  return destination;
}
export function Link({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target ||
          props.download
        )
          return;
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        event.preventDefault();
        if (url.pathname !== window.location.pathname) {
          window.history.pushState(null, "", url);
          window.dispatchEvent(new PopStateEvent("popstate"));
          window.scrollTo(0, 0);
        }
      }}
    />
  );
}
