# CAD acceptance fixtures

This directory reserves the deterministic corpus; fixtures are not implemented
yet. Follow M-CAD-21–27 in the [module contract](../../docs/M-CAD.md).

Each family should contain immutable input source/files, a request, independently
derived expected values with tolerances, required views, and deliberately bad
cases. Keep generated reports and images under ignored `runs/`. Commit only
small curated evidence when it serves a regression or documented review.

Progress from cylinders, sleeves, and caps to bolt/nut bodies, explicit mating
threads and custom nuts, then selected complex shapes. Label synthetic dimensions
as fixtures; do not substitute them for the user's measured object.
