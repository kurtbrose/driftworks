# Publishing gameplay

Run `node tools/package-gameplay.cjs` from the repository root. The dependency-free
packager writes the ignored `output/gameplay-site/` directory. Serve that folder
with `python -m http.server 8000 --directory output/gameplay-site` to review it.

The package retains the flight entry point and all its mission query parameters,
asteroid patrol, and the legacy tactical game. Its home page links to gameplay.
Authoring and review HTML pages are not published. Script profiles and local
resource literals supply dependencies; directory literals retain dynamically
constructed resources. Ship runtime files and portrait runtime directories are
explicitly retained because model/character selection constructs their names.
The asset-version catalog is copied, not interpreted as a dependency list.
Original asset bytes and relative paths are preserved. A 950 MB uncompressed
budget fails packaging before upload if the selected content grows too large.

Pages must use **Settings → Pages → Build and deployment → Source → GitHub Actions**
instead of publishing directly from a branch. `.github/workflows/pages.yml`
packages and uploads only `output/gameplay-site` on pushes to `main`, or through
the workflow's manual Run workflow action. It does not require npm installation
or introduce a browser build step. The separate Check workflow remains independent.

When adding a dynamic resource loader, ensure its directory or runtime files are
included and inspect its requests against the packaged site. Unreferenced files
are intentionally absent, even if they appear in the full asset-version catalog.
