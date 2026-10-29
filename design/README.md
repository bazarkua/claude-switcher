# Interface prototype

Serve this directory with `python3 -m http.server 4177 --bind 127.0.0.1 --directory design`, then open `http://127.0.0.1:4177/claude-switcher-prototype.html`.

Study 04 uses independent HTML, CSS, and JavaScript. Changes here have not been integrated into the Electron renderer. Prototype controls show both example usage and an unavailable state. All percentages, plans, and reset times are explicitly sample data. No account API, credentials, or local profiles are accessed.

The circular account avatars use Claude's public favicon, obtained from https://claude.ai/favicon.ico on October 28, 2026. It identifies the third-party service. Claude Switcher is unofficial and not affiliated with Anthropic. The application mark is the separately generated `logo-v2.png`.

Checked interactively in the in-app browser: account selection, profile menu, add dialog and focus, light and dark appearance, and unavailable usage. The prototype includes hover/press feedback, animated selection and progress, loading feedback, tooltips, and a moving background. Reduced-motion preferences disable transitions and moving backgrounds.
