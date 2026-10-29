# Brand assets

The approved mark is `resources/logo-v2.png`: two terracotta switch arrows on a transparent background. It was generated with the built-in image generation tool. The exact prompt is recorded in [the branding study](../design/BRANDING-v2.md).

`resources/icon.png`, `resources/icon.icns`, and `resources/icon.ico` are the corresponding packaged app icons. Regenerate them with `npm run icons`. The monochrome menu-bar symbol is drawn separately so it remains legible at native size.

Circular account avatars use Claude's publicly available favicon, saved as `resources/claude-favicon.ico` from https://claude.ai/favicon.ico. It identifies the service, and does not indicate Anthropic endorsement.

The UI palette uses neutral gray surfaces and terracotta accents. Green tints are excluded from both themes, including menus, dialogs, tabs, and secondary controls. `resources/logo.png` is the earlier visual exploration and is no longer referenced by the app.

Application screenshots in this directory come from the actual Electron UI with disposable unauthenticated profiles. Prototype usage values are sample data and are never bundled into the production renderer.
