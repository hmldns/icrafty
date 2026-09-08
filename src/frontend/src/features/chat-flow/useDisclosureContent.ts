import { useLayoutEffect, useRef, useState } from "react";

/** Keep resource-bearing children alive through exit, including a reversed transition. */
export function useDisclosureContent(expanded: boolean) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [keepContent, setKeepContent] = useState(expanded);
  useLayoutEffect(() => {
    if (expanded) { setKeepContent(true); return; }
    // Reading animations flushes the new collapsed style. Reduced motion has no
    // transition, so it releases content immediately instead of waiting on a timer.
    const animations = bodyRef.current?.getAnimations() ?? [];
    if (!animations.length) { setKeepContent(false); return; }
    let cancelled = false;
    void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (!cancelled) setKeepContent(false);
    });
    return () => { cancelled = true; };
  }, [expanded]);
  return { bodyRef, renderContent: expanded || keepContent };
}
