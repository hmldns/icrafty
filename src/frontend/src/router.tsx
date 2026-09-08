import { useSyncExternalStore, type AnchorHTMLAttributes } from "react";

const subscribe = (callback: () => void) => {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
};
export function usePathname(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname.replace(/\/$/, "") || "/",
    () => "/",
  );
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
