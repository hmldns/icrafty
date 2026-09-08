import { useEffect, useRef, type ReactNode } from "react";

export function WorkspaceHelp({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent | FocusEvent) => {
      const element = disclosure.current;
      if (element?.open && !element.contains(event.target as Node))
        element.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      const element = disclosure.current;
      if (event.key === "Escape" && element?.open) {
        element.open = false;
        element.querySelector("summary")?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details ref={disclosure} className={`workspace-help ${className}`}>
      <summary>{label}</summary>
      <div className="workspace-help-content">{children}</div>
    </details>
  );
}

/** Compact title and optional help for pages whose main content is a working surface. */
export function WorkspaceHeader({
  title,
  context,
  children,
}: {
  title: string;
  context?: ReactNode;
  children: ReactNode;
}) {
  return (
    <header className="workspace-header">
      <h1>{title}</h1>
      {context && <span className="workspace-context">{context}</span>}
      <WorkspaceHelp label="About this workspace">{children}</WorkspaceHelp>
    </header>
  );
}
