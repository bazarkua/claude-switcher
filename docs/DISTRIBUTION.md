# Packaging and distribution

`npm run dist` builds for the host platform. macOS targets are Apple Silicon and Intel DMGs. Windows targets the x64 NSIS installer. Outputs are local files in `release/` and are excluded from Git.

## Local development builds

```sh
# macOS
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac

# Windows PowerShell
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
npm run dist:win
```

Build Windows installers on Windows for the most reliable resource editing and signing. The Checks workflow builds an unsigned Windows installer after its Windows tests pass and retains it as a CI artifact for seven days. Cross-compilation can require additional platform tooling. Build and test macOS packages on macOS.

Unsigned development builds have not established publisher identity and are not notarized. On macOS, explicitly allow the downloaded app through the normal Privacy & Security workflow if needed. Do not disable Gatekeeper globally. Windows may show SmartScreen until a properly signed release has reputation.

## Signed public releases

For macOS, provide a Developer ID Application identity through electron-builder's `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables, enable notarization in `electron-builder.yml`, and supply Apple's notarization credentials through a supported environment or keychain flow. Never commit certificates or secrets. Validate and staple the notarized result before publishing.

For Windows, supply an appropriate code-signing identity through your signing provider or electron-builder's certificate settings. Sign the application and installer. Verify on a clean x64 Windows machine, including MSIX Claude detection if that installation is supported.

Before publishing binaries, complete the live two-account checklist for each claimed Claude/OS combination. The initial repository does not represent a signed, fully validated public binary release.

On this Apple Silicon host, cross-compilation prepared the Windows application but the bundled Intel-only NSIS compiler failed with error -86. Use the native Windows CI build rather than installing compatibility software solely for packaging.
