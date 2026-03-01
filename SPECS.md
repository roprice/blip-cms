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
- `content.js` - injected into matched pages; manages the sidebar, edit button, design mode, DOM observation
- `background.js` - handles GitHub OAuth flow and API communication
- `sidebar.html` / `sidebar.css` - the sidebar UI (loaded inside the injected iframe)

### Sidebar

The sidebar is a custom-injected iframe on the left side of the browser window. It is sized at a fixed default width (configurable in `config.js`) and can be drag-resized by the user via a handle on its left edge.

**Why a custom iframe instead of Chrome's native Side Panel:**

- Chrome's native Side Panel is right-side only. No exceptions.
- A custom iframe gives full design control. The sidebar is Blip's face. It should look and feel like Blip, not like a Chrome utility drawer.
- The iframe boundary isolates Blip's styles from the host page and vice versa. Neither can break the other.
- Enables left-side positioning.
- Communication between the sidebar iframe and the content script uses `window.postMessage`, which is straightforward.

**Layout behavior:** When the sidebar opens, it pushes the page content to the right. This maintains the true WYSIWYG editing experience: the user sees the page at a real (slightly narrower) viewport width, not with a panel covering part of their content.

**Why a sidebar at all:**

- **Clean editing canvas.** No floating controls or overlays on the page itself. The site content area remains unobstructed for true in-place editing.
- **Sense of solidity.** The sidebar provides a persistent, grounded interface that makes the tool feel reliable and intentional, not like a fragile overlay.
- **Configuration hub.** All account setup, repo mapping, and extension settings live in the sidebar. The user never navigates to a separate options page or external app. If Chrome's default extension options page is opened, it redirects to the sidebar.
- **Future real estate.** As Blip evolves, the sidebar provides room for additional features (repo mapping UI, edit history, multi-file support) without cluttering the editing experience.

**Sidebar persistent element:** The sidebar always displays a "close" element (e.g., an X or collapse arrow) in every state, allowing the user to dismiss the sidebar at any time.

### Core editing mechanism

1. User visits a configured site.
2. Sidebar appears with the edit button and a persistent close element.
3. User clicks "Edit."
4. Blip fetches the current source file from GitHub via the Contents API, receiving both the file content and its SHA. **[Dev notification: display the SHA and file size in the sidebar to confirm successful fetch.]**
5. Blip parses the fetched source with `DOMParser` to create a clean source DOM. **[Dev notification: display parse status and node count in the sidebar.]**
6. Blip walks the live DOM and the parsed source DOM in parallel, building a map of live text nodes to character offsets in the raw source string.
7. Blip attaches a `MutationObserver` to the page, configured to watch `characterData` mutations.
8. `document.designMode` is enabled on the page.
9. User edits content directly on the page.
10. User clicks "Save."
11. Blip collects the list of observed text mutations and their mapped character offsets in the source.
12. Blip applies targeted string replacements at the mapped positions in the raw source file, preserving all formatting, indentation, and framework-specific markup.
13. Blip commits the modified file to GitHub via the Contents API using the previously fetched SHA.
14. GitHub returns a response containing the new SHA.
15. Blip stores the new SHA locally for subsequent edits (no need to re-fetch until the next session). **[Dev notification: display the new SHA in the sidebar to confirm successful commit and round-trip.]**
16. The commit triggers the existing deployment pipeline (Netlify, Vercel, etc.).
17. User sees "Saved" confirmation in the sidebar.
18. UI returns to default state.

### Diff strategy: MutationObserver + parallel tree mapping

This is the core technical mechanism of Blip. The guiding principle is: **never serialize and replace the entire file from the DOM.**

The browser's DOM serializer does not preserve the original file's formatting. Frameworks like Alpine and HTMX mutate the DOM at runtime. Saving raw `outerHTML` would introduce formatting noise into every commit and could bake in runtime-generated attributes and state.

**How it works:**

1. Fetch the raw source file from GitHub before editing begins.
2. Parse it with `DOMParser` to get a clean source DOM.
3. Walk the live DOM and parsed source DOM in parallel, building a map: each live text node to its character offset in the raw source string.
4. Attach a `MutationObserver` watching for `characterData` mutations only.
5. When the user clicks save, the observer has recorded exactly which text nodes changed and what they changed to.
6. Apply targeted string replacements at the mapped character offsets in the raw source string. Not re-serializing anything. Surgical find-and-replace at known positions.
7. Commit the minimally modified file.

This ensures clean git diffs that show exactly what the user changed and nothing else.

**Why this approach over alternatives:**

- **XPath:** Can break if frameworks inject wrapper elements at runtime. An XPath that was valid against the source may not match the live DOM, or vice versa.
- **Unified diff:** Operates on lines, not semantic content. Gets confused by duplicate content (e.g., two `<p>` tags with similar text). Line-level diffing can also be thrown off by whitespace differences between source and rendered DOM.
- **Full DOM serialization:** Destroys formatting and captures framework runtime state. Ruled out entirely.

### MutationObserver: known risks and mitigations

The MutationObserver is a critical piece of Blip's architecture. The following risks must be anticipated and handled in code:

1. **Framework-initiated mutations.** Alpine, HTMX, and other frameworks react to user interactions. Clicking into a text node could trigger a binding that changes other text on the page. These would be captured as "user edits" when they are not.
   - *Mitigation:* Only track mutations inside elements the user has actually clicked, focused on, or typed into. Filter by whether the mutation was preceded by an input-related event.

2. **Browser normalization on designMode activation.** When `designMode` is enabled, the browser may normalize the DOM: collapsing whitespace, wrapping bare text nodes in `<span>` or `<div>` elements. These register as mutations even though the user did nothing.
   - *Mitigation:* Ignore mutations that fire in the first ~100ms after enabling designMode. Begin observing only after the DOM has settled.

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

During the alpha version, the sidebar displays diagnostic information in a collapsible dev panel at the bottom of the sidebar (occupying 50% of sidebar height by default, with a chevron toggle to collapse/expand).

**Displayed on source fetch:** SHA, file size, and fetch status.

**Displayed on DOM parse:** element count and mapped text node count.

**In-place updates:** Dev log entries tagged with an `entryId` (Mode, Observer, Commit) update themselves in place rather than appending new lines. This prevents stale entries:

- **Mode** updates from "designMode ON" to "designMode OFF" when editing ends.
- **Observer** updates from "active" to "stopped" when the observer disconnects.
- **Commit** updates from "pushing..." to the actual commit SHA on success.

**Silent mutation recording:** The MutationObserver records mutations silently during editing — no per-keystroke log entries. Mutations are only surfaced at save time.

**On save, displayed per edited node:**

- `Edited:` followed by a CSS-selector-like path to the edited element (e.g., `section#hero > h1`, `div > p:nth-of-type(2)`). The selector walks up the DOM, anchoring at an `id` if found, adding `:nth-of-type(n)` disambiguation for sibling elements of the same tag.
- `→:` followed by the full new text content of the node (text wraps within the panel, never clipped).

**SHA labels:**

- **Commit:** displays the git commit SHA (the one visible in GitHub's commit history).
- **File SHA:** displays the blob SHA returned by the Contents API (used internally for the next PUT request). These are different objects — the commit SHA is what appears on the repo's commits page.

These notifications are behind a dev-mode flag so they can be easily removed or hidden in the production version.

## UI design

### Sidebar layout

The sidebar has a fixed default width (set via `sidebar.defaultWidthPx` in `config.js`, default: 300px). It is injected as an iframe on the left side of the viewport. When open, the page content shifts to the right to accommodate it.

**Drag to resize:** A 6px-wide invisible handle is positioned at the left edge of the sidebar iframe. On hover it highlights (blue accent). The user can drag it to resize the sidebar between 180px and 600px. The resize updates the iframe width and the `--blip-sidebar-width` CSS custom property live.

**Default state** (top to bottom):

- Header: Blip logo/wordmark + close element (always visible)
- Primary action: Edit button (large, prominent)
- Dev info area (alpha only): SHA, parse status, diagnostic details
- Footer area: Settings/config link (future use)

**Editing state** (top to bottom):

- Header: Blip logo/wordmark + close element
- Status indicator: "Editing" label (visually distinct, e.g., colored accent or badge)
- Action buttons: Save button, Cancel button
- Dev info area (alpha only): mutation count, tracked changes summary

**After save** (top to bottom):

- Header: Blip logo/wordmark + close element
- Confirmation: "Saved" notification (auto-dismisses or persists until next action)
- Primary action: Edit button returns
- Dev info area (alpha only): new SHA, commit confirmation

### Design principles for the sidebar

- Minimal. The sidebar should feel like a tool strip, not an application.
- The edit button is the dominant element in default state. Everything else is secondary.
- In editing state, save and cancel are equally accessible. Neither should require scrolling.
- Dev notifications should be visually distinct from user-facing UI (muted color, smaller font, monospace) so they are clearly diagnostic.
- The dev panel occupies the bottom ~50% of the sidebar height and is independently scrollable.
- The dev panel has a collapse/expand toggle (chevron) in its header. When collapsed, only the "DEV" label and chevron are visible.
- The sidebar should have its own scroll if content overflows, independent of the page scroll.

## Account and configuration

### Alpha version

For the alpha/personal-use version:

- GitHub repo, branch, and file path are hardcoded in a single configuration object.
- Authentication uses a GitHub personal access token stored in `chrome.storage.local`.
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

- Multi-file support (CSS edits, multiple HTML pages)
- Mobile editing (bookmarklet or PWA approach, since Chrome extensions don't run on mobile)
- Visual diff preview before committing
- Edit history panel in the sidebar
- Collaborative editing (multiple users editing the same site)
- Support for non-GitHub hosts (GitLab, Bitbucket)
- Image replacement via drag-and-drop
- Branch selection (edit on a staging branch, merge later)
- Auto-commit message customization
- Keyboard shortcuts (Ctrl+S to save, Esc to cancel)