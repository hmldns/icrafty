# Workflow tooling

The project's delegated-agent workflow lives in [workflow/](workflow/):

- [Roles and coordination](workflow/ROLES.md)
- [Setup, commands, reporting, and recovery](workflow/README.md)
- [uv launcher](workflow/builders) and [implementation](workflow/tools/builders.py)
- [Integration tests](workflow/tests/)

From the project root:

```bash
./workflow/builders --help
```

The root `./builders` command forwards to the same launcher.
