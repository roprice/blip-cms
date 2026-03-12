# Blip - specs

> "People think that writing is writing, but actually writing is editing. Otherwise, you're just taking notes."
> - Chris Abani

## Purpose

Blip is a Chrome extension that enables true edit-in-place editing for flat-file websites. It lets you edit your live website directly in the browser and commit changes to GitHub without ever leaving the page.

Blip exists because the current workflow for making small edits to a static website is absurdly friction-heavy: open VS Code, find the file, find the line, make the edit, save, commit, push, wait for deploy, check the live site. This kills flow state and discourages the kind of rapid, iterative refinement that makes websites great.

With Blip, you visit your site, click edit, make your change, click save. Done.

## Philosophy

### Flow state above all else

Blip is designed around one core principle: never break the user's flow. The entire interaction happens on the live site. There is no context switch to a code editor, no terminal, no separate admin panel. The user stays in the browser, on their site, thinking about their content.

### The vibe-coding counterpart

When Andrej Karpathy coined "vibe coding" in early 2025, the premise was working at the speed of thought. But after deployment, that speed vanishes. The moment you need to fix a typo, update a price, or remove a client's name from a case study, you're back in VS Code staring at markup. Blip is the deterministic counterpart that keeps the vibe-coding promise intact after deployment.

### Locality of behavior

Blip targets HTML-first frameworks because they embody the principle of Locality of Behavior (LoB): the behavior of a unit of code is obvious just by looking at that unit of code. In these architectures, the content lives in the DOM, in the HTML file itself, not abstracted away into components, state trees, or databases. This is what makes direct DOM editing viable. It's also what makes these frameworks ideal for AI-assisted development: the LLM can reason about a single file rather than tracing dependencies across dozens of modules.

### Not a CMS

Blip is not a content management system. It does not manage posts, pages, media libraries, or taxonomies. It is a micro-editing tool. It is optimized for one thing: making quick changes to existing content on a live site. Adding a new blog post, restructuring your navigation, or uploading images are out of scope. Those are authoring tasks. Blip is for editing.

## Why GitHub

GitHub is central to Blip's architecture. The reasons are:

1. **Source of truth.** The original file on GitHub is the canonical version of the site. Blip fetches it before every edit session. This avoids saving framework-mutated DOM state (Alpine, HTMX, and others modify the DOM at runtime) and preserves the original file's formatting, indentation, and structure.

2. **Version control for free.** Every edit becomes a git commit with a timestamp. The user gets full history, rollback capability, and diffs without Blip having to build any of that.

3. **Deployment pipeline.** Most static sites already deploy from GitHub via Netlify, Vercel, Cloudflare Pages, or GitHub Pages. By committing to GitHub, Blip triggers the existing deploy pipeline automatically. No additional infrastructure needed.

4. **Authentication and permissions.** GitHub OAuth provides identity, access control, and repo permissions out of the box. Blip does not need its own auth system or user database.

5. **No custom backend required.** Blip can operate as a pure client-side Chrome extension that talks directly to GitHub's API. There is no Blip server, no database, no infrastructure to maintain (at least in the alpha/personal-use version).

6. **SHA-based consistency.** GitHub's Contents API uses SHA hashes to ensure atomic commits. Blip always knows exactly which version of the file it's working against, preventing silent overwrites or merge conflicts.

The alternative to GitHub would be building a custom backend that stores file state, manages versions, and handles deployment. That is orders of magnitude more complex and provides less functionality than what GitHub already offers.

## Target platforms

Blip is designed for static, flat-file websites built with HTML-first frameworks and approaches:

- Vanilla HTML/CSS/JS
- jQuery-based sites
- Alpine.js
- Astro
- HTMX

These share a common trait: content lives directly in HTML files in the DOM, not in databases, JSON files, or abstracted component state. This is what makes edit-in-place viable without a complex reconciliation layer.

React, Next.js, Vue, Svelte, and similar component-based frameworks are explicitly out of scope. In those architectures, the rendered DOM is a projection of component state, not the source. Mapping DOM edits back to source files is a fundamentally harder problem.

## Architecture

### Chrome extension structure

- `manifest.json` - extension configuration, permissions, URL matching
- `content.js` - injected into matched pages; manages the iframe, edit session, design mode, DOM observation, multi-file resolution
- `content.css` - injected into matched pages; iframe positioning and page margin shift
- `config.js` - injected into matched pages; all configuration (GitHub, file resolution, sidebar, LLM, observer settings)
- `background.js` - service worker; handles GitHub API communication (fetch, commit, file listing) and LLM repair calls
- `sidebar.html` - the sidebar UI (loaded inside the injected iframe); contains both collapsed tab widget and expanded sidebar views
- `sidebar.js` - sidebar logic; view toggling, tab state, file list, dev panel

### Sidebar

The sidebar is a single custom-injected iframe on the left side of the browser window. This iframe contains both the collapsed state (a floating tab widget) and the expanded state (the full sidebar panel). The iframe itself changes size between these two states; the internal content toggles which view is visible.

**Single-iframe architecture:**

The iframe is always present in the DOM. When collapsed, it shrinks to the tab widget dimensions (~150px wide, 38px tall) and is transparent, floating over the page content. When expanded, it grows to 300px wide by 100vh and the page body receives a left margin to make room.

This architecture solves a critical problem: `document.designMode = 'on'` on the host page makes all host-page DOM elements part of the editing surface. Controls injected directly into the host page (buttons, tabs) become unclickable during editing. Because the iframe has its own `document` object, `designMode` on the host page does not reach into the iframe, making all controls inside it always clickable.

**Why a custom iframe instead of Chrome's native Side Panel:**

- Chrome's native Side Panel is right-side only. No exceptions.
- A custom iframe gives full design control. The sidebar is Blip's face. It should look and feel like Blip, not like a Chrome utility drawer.
- The iframe boundary isolates Blip's styles from the host page and vice versa. Neither can break the other.
- Enables left-side positioning.
- Communication between the sidebar iframe and the content script uses `window.postMessage`, which is straightforward.

**Layout behavior:** When the sidebar expands, it pushes the page content to the right via a CSS class (`blip-sidebar-open`) on the `<html>` element. This maintains the true WYSIWYG editing experience: the user sees the page at a real (slightly narrower) viewport width, not with a panel covering part of their content. When collapsed, the page occupies full width and the small tab widget floats over it transparently.

**Collapsed tab widget:** When the sidebar is collapsed, a small floating tab appears at the top-left of the page. On hover, it expands to reveal state-specific controls (edit, save, saving..., saved!, retry) and an expand icon that opens the full sidebar. The tab changes background color based on state: light sage green (default), green (editing/saving/saved), red (error). This allows users to edit and save without ever opening the full sidebar.

**Sidebar persistent element:** The expanded sidebar always displays a "close" element (X) in the header, allowing the user to collapse it at any time.

**State persistence:** The sidebar's collapsed/expanded state is persisted to `chrome.storage.local` with a 30-minute expiry. Within that window, navigating between pages preserves the sidebar state. After 30 minutes of inactivity, the sidebar reverts to the default (collapsed).

## User onboarding experience
1. User installs Blip.
2. User "adds a site" by entering a URL and GitHub repo configuration.
3. User visits a configured site and sees the floating tab widget's "edit" button


## Core editing mechanism

1. User visits a configured site.
2. Blip injects the sidebar iframe and fetches the repo file listing from GitHub to resolve which file corresponds to the current URL.
3. Blip prefetches the resolved file's content and SHA from GitHub immediately (before the user clicks Edit).
4. Sidebar appears in collapsed state (floating tab widget).
5. User clicks "Edit" (via the tab widget or the expanded sidebar).
6. Blip uses the prefetched source (or fetches if not yet available). It parses the source with `DOMParser` to create a clean source DOM. **[Dev notification: display parse status and node count.]**
7. Blip walks the live DOM, building a dual-track map: simple text nodes to character offsets, and mixed-content parents to innerHTML regions.
8. Blip attaches a `MutationObserver` watching both `characterData` and `childList` mutations.
9. `document.designMode` is enabled on the page.
10. User edits content directly on the page.
11. User clicks "Save."
12. Blip collects observed mutations and applies targeted replacements: character-offset replacements for simple text nodes, innerHTML comparison for mixed-content parents.
13. If LLM is enabled and structural validation detects corruption, Blip calls Groq for syntax repair.
14. Blip commits the modified file to GitHub via the Contents API using the prefetched SHA.
15. GitHub returns a response containing the new SHA.
16. Blip updates the local SHA immediately, priming the system for the next edit. **[Dev notification: transaction log with timestamps, payload SHA, response status, returned SHA, state confirmation.]**
17. The commit triggers the existing deployment pipeline (Netlify, Vercel, etc.).
18. User sees "Saved" confirmation.
19. UI returns to default state.

### Diff strategy: dual-track mapping

This is the core technical mechanism of Blip. The guiding principle is: **never serialize and replace the entire file from the DOM.**

The browser's DOM serializer does not preserve the original file's formatting. Frameworks like Alpine and HTMX mutate the DOM at runtime. Saving raw `outerHTML` would introduce formatting noise into every commit and could bake in runtime-generated attributes and state.

#### Design principle: deterministic first, LLM as safety net

Blip's architecture prioritizes speed and predictability. Every edit should be processed deterministically using JavaScript wherever possible. An LLM call (currently Groq/Llama 3.3 70B) exists as a potential safety net for structural corruption that the deterministic path cannot repair. The LLM is never in the critical path for normal edits. This principle ensures sub-second save times for the vast majority of edits, with a ~100-200ms LLM fallback only when structural validation detects corruption.

If future testing reveals scenarios where the LLM consistently produces better results, the architecture supports expanding its role. The principle is not "avoid LLMs" but rather "don't add latency when you don't need to."

The LLM modules is not active at this time. It may be added in the future, or leveraged for ancillary features.

#### Track 1: simple text node mapping (fast path)

For elements that contain only text (no child elements as siblings to text nodes), Blip uses precise character-offset mapping:

1. Fetch the raw source file from GitHub before editing begins.
2. Parse it with `DOMParser` to get a clean source DOM.
3. Walk the live DOM, finding text nodes whose parent contains only text (no element children).
4. Map each text node to its character offset in the raw source string using regex matching with whitespace flexibility.
5. Attach a `MutationObserver` watching for `characterData` mutations.
6. On save, apply targeted string replacements at the mapped character offsets. Surgical find-and-replace at known positions.

This produces clean git diffs that show exactly what the user changed and nothing else.

#### Track 2: parent-level innerHTML mapping (mixed-content path)

For elements that contain both text nodes AND element children (e.g., `<h1>Text <span>styled</span> more text</h1>`), individual text node tracking is unreliable because `designMode` can restructure, merge, split, or destroy text nodes during editing.

Instead, Blip maps at the parent element level:

1. During the tree walk, detect "mixed-content parents" - elements that have at least one text node child and at least one element child (inline or block).
2. Store the parent's complete innerHTML and its character offset/length in the source string.
3. Individual text nodes inside these parents are still tracked by the observer (to detect that a change occurred), but they are flagged as `parentMapped`.
4. On save, compare the parent's current innerHTML against the stored source innerHTML. If different, replace the entire innerHTML region in the source string.
5. The `MutationObserver` also watches `childList` mutations (node creation/deletion) to catch structural changes like the user pressing Cmd+B to bold text, hitting Enter to create line breaks, or accidentally deleting across inline element boundaries.

This approach handles all the inline element edge cases: editing text before/after/across `<span>`, `<strong>`, `<em>`, `<a>`, and other inline elements. It also handles the user creating new inline elements via keyboard shortcuts.

#### LLM safety net (Groq)

After applying all replacements (both tracks), if any parent-level changes were made, Blip runs a quick structural validation:

- Regex patterns check for common corruption (e.g., `text/p>`, mismatched close tags).
- If corruption is detected and the LLM is enabled in config, Blip sends the original and corrupted fragments to Groq (Llama 3.3 70B via background service worker) with instructions to fix syntax only and preserve all content changes.
- The LLM call routes through `background.js` (required for Manifest V3 CORS).
- The dev panel indicates whether LLM repair was used and shows token counts.

The LLM config is disabled by default. To enable: set `llm.enabled: true` and provide a Groq API key in `config.js`.

**Why this approach over alternatives:**

- **XPath:** Can break if frameworks inject wrapper elements at runtime. An XPath that was valid against the source may not match the live DOM, or vice versa.
- **Unified diff:** Operates on lines, not semantic content. Gets confused by duplicate content (e.g., two `<p>` tags with similar text). Line-level diffing can also be thrown off by whitespace differences between source and rendered DOM.
- **Full DOM serialization:** Destroys formatting and captures framework runtime state. Ruled out entirely.
- **Text-node-only mapping (original approach):** Works for simple text edits but fails when `designMode` restructures nodes around inline elements. The dual-track approach retains the speed of text-node mapping for simple cases while handling complex cases at the parent level.

### MutationObserver: configuration and known risks

The MutationObserver watches for both `characterData` (text changes) and `childList` (structural changes) mutations. It is configured with `subtree: true` to capture changes anywhere in the document body.

**User interaction filtering:** Removed. During `designMode`, all characterData mutations are user-initiated. The previous approach of filtering by tracked user interactions caused false negatives (T1.3.A: "no changes detected" on valid edits). The `settleDelayMs` (150ms) after enabling designMode is sufficient to filter out browser normalization mutations.

**Known risks and mitigations:**

1. **Framework-initiated mutations.** Alpine, HTMX, and other frameworks react to user interactions. Clicking into a text node could trigger a binding that changes other text on the page.
   - *Mitigation:* The 150ms settle delay filters initial framework reactions. For ongoing framework mutations, the parent-level innerHTML comparison naturally captures only the net change (including framework mutations, which are minimal for text-only edits). Future: scope observation to content areas, excluding known dynamic containers.

2. **Browser normalization on designMode activation.** When `designMode` is enabled, the browser may normalize the DOM: collapsing whitespace, wrapping bare text nodes in elements.
   - *Mitigation:* Observer starts after a configurable delay (`settleDelayMs`, default 150ms). Mutations during this window are not captured.

3. **Copy-paste injecting structural HTML.** When a user pastes formatted text, the browser may insert elements with inline styles rather than plain text. This is a structural mutation, not a `characterData` mutation.
   - *Mitigation:* Intercept paste events and force plain-text paste (`e.preventDefault()` + `document.execCommand('insertText', false, plainText)` or equivalent).

4. **Dynamic content generating mutations.** If the page has live clocks, animated counters, HTMX polling, or other dynamic elements, these generate mutations during the edit session.
   - *Mitigation:* Only observe `characterData` mutation type. Additionally, scope observation to the main content area if possible, excluding known dynamic widget containers.

None of these are showstoppers. They are all filterable. But they must be handled to avoid phantom edits appearing in commits.

## UI states

### Default state

The sidebar displays the Blip branding, a single "Edit" button, and a persistent close element. The page is in its normal, non-editable state.

### Editing state

- The "Edit" button changes to display "Editing" (visually distinct, indicating active mode).
- A "Cancel" button appears. Clicking it discards all edits, disables designMode, restores the original DOM state, and returns to the default state.
- A "Save" button appears. Clicking it triggers the diff-and-commit flow.
- `document.designMode = 'on'` is active on the page.

### Save confirmation

After a successful commit, the sidebar displays a "Saved" notification. The UI returns to the default state.

### Error state

If the GitHub commit fails (network error, auth expiry, merge conflict, SHA mismatch), the sidebar displays a clear error message. The user's edits remain in the DOM so nothing is lost. They can retry or copy their changes manually.

### Dev notifications (alpha only)

During the alpha version, the sidebar displays diagnostic information for development and debugging purposes:

- On source fetch: SHA, file size, and fetch status
- On DOM parse: parse status and node count
- On save: new SHA returned from GitHub, confirming the round-trip
- On error: full error details from the GitHub API response

These notifications are behind a dev-mode flag so they can be easily removed or hidden in the production version.

## UI design

### Sidebar layout

The sidebar is fixed at 300px wide. It is injected as an iframe on the left side of the viewport. When expanded, the page content shifts to the right to accommodate it. When collapsed, only the floating tab widget is visible.

**Default state** (top to bottom):

- Header: Blip logo/wordmark + close element (always visible)
- Primary action: Edit button (large, prominent)
- Notifications area
- File list: all editable files, active file highlighted with green dot, others muted
- Dev info area (alpha only): SHA, parse status, diagnostic details

**Editing state** (top to bottom):

- Header: Blip logo/wordmark + close element
- Status indicator: "Editing" label (green accent badge with pulsing dot)
- Action buttons: Save button, Cancel button
- Notifications area
- File list
- Dev info area (alpha only): mutation count, tracked changes summary

**After save** (top to bottom):

- Header: Blip logo/wordmark + close element
- Confirmation: "Saved" notification (auto-dismisses after 4 seconds)
- Primary action: Edit button returns
- File list
- Dev info area (alpha only): transaction log with new SHA

### Collapsed tab widget

When the sidebar is collapsed, a small floating tab at top-left provides a mini control panel:

- Default: shows "blip". On hover, expands to show "blip [edit] [>>]".
- Editing: green background, stays expanded, shows "blip [save] [>>]".
- Saving: green background with pulse animation, shows "blip [saving...] [>>]" with animated ellipsis.
- Saved: green background, shows "blip [saved!] [>>]" for 1.5 seconds, then contracts.
- Error: red background, stays expanded, shows "blip [retry] [>>]".

The tab controls delegate actions to content.js. The expand icon (>>) opens the full sidebar.

### Design principles

- Minimal. The sidebar should feel like a tool strip, not an application.
- The edit button is the dominant element in default state. Everything else is secondary.
- In editing state, save and cancel are equally accessible. Neither should require scrolling.
- Dev notifications should be visually distinct from user-facing UI (muted color, smaller font, monospace) so they are clearly diagnostic.
- The sidebar should have its own scroll if content overflows, independent of the page scroll.
- Light, airy green palette: `#eef3ed` background, `#16a34a` accent. Translucent backgrounds throughout. The aesthetic is unobtrusive and bright, not heavy or dark.

## Account and configuration

### Alpha version

For the alpha/personal-use version:

- GitHub repo owner, repo name, branch, and personal access token are hardcoded in a single configuration object (`config.js`).
- File path is resolved dynamically: Blip fetches the repo's file listing at init, filters to editable extensions (`.html`, `.php`), and matches the current URL path to a file. Template files are excluded via configurable patterns.
- Authentication uses a GitHub personal access token.
- The hardcoded values are isolated in a single config module to make future expansion straightforward.

### Future version

The sidebar will include a configuration panel where users can:

- Authenticate to GitHub via OAuth (using `chrome.identity` API for the flow)
- Map site URLs to GitHub repos, branches, and file paths (e.g., `remaphq.com` -> `user/remaphq.com/main/index.html`)
- Manage multiple site-to-repo mappings
- View and manage saved credentials

All configuration data is stored in `chrome.storage.sync` (syncs across the user's devices) or `chrome.storage.local`. No external web app is required for configuration. The extension is self-contained.

### Billing (future)

Billing can be handled without a web app using the following pattern:

1. User clicks "Upgrade" in the sidebar.
2. Blip opens a Stripe Checkout or Payment Link in a new browser tab.
3. After payment, Stripe redirects to a success URL (can be a static page or a `chrome-extension://` URL).
4. A lightweight serverless function (Cloudflare Worker or Vercel function, approximately 50 lines of code) handles Stripe webhooks to validate payment status.
5. The extension checks subscription status and stores it in `chrome.storage`.

This pattern is well-established among Chrome extensions. No full web application is required for billing.

## Use cases

Blip is for quick, reactive edits:

- Fix a typo or grammatical error
- Update a price, date, or statistic
- Rewrite a headline because a better idea just hit you
- Remove a client's name from a case study that shouldn't be public
- Update a privacy policy clause because another service requires it
- Adjust copy after reading it on the live site (where it reads differently than in a code editor)
- Fix something urgently from anywhere you have a browser
- Any edit driven by urgency, inspiration, or real-world context that would lose momentum if routed through a code editor

Blip is not for:

- Writing new blog posts or long-form content
- Adding new pages or sections
- Restructuring navigation or layout
- Uploading or managing images
- Any task that requires creating new HTML elements or modifying site structure

## Future considerations (out of scope for alpha)

- CSS editing support
- Mobile editing (bookmarklet or PWA approach, since Chrome extensions don't run on mobile)
- Visual diff preview before committing
- Edit history panel in the sidebar
- Collaborative editing (multiple users editing the same site)
- Support for non-GitHub hosts (GitLab, Bitbucket)
- Image replacement via drag-and-drop
- Branch selection (edit on a staging branch, merge later)
- Auto-commit message customization
- Keyboard shortcuts (Ctrl+S to save, Esc to cancel)
- Sidebar width resizing (drag handle, currently hardcoded at 300px)
- AI-assisted page creation from templates
