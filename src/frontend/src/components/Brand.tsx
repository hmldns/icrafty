import { Link, ROUTES } from "../router";

export function Brand() {
  return <Link className="brand" href={ROUTES.repair} aria-label="icrafty home">
    <span className="brand-mark" aria-hidden="true">c</span>
    icrafty<span className="brand-period">.</span>
  </Link>;
}
