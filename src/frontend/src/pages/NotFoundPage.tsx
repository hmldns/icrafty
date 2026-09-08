import { EmptyState } from "../components/ui/primitives";
import { Link } from "../router";

export function NotFoundPage() {
  return (
    <div className="not-found">
      <p className="eyebrow">404 / A loose end</p>
      <h1>This page isn’t on the workbench.</h1>
      <EmptyState
        icon="fit"
        title="Let’s find your way back."
        action={
          <Link href="/" className="button button--primary">
            Back to the workshop
          </Link>
        }
      >
        Your images are still in the camera workspace.
      </EmptyState>
    </div>
  );
}
