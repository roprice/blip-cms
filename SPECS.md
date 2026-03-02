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

The sidebar is a custom-injected iframe on the left side of the browser window. It is sized as a percentage of the browser window width.

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

### Diff strategy: dual-track mapping

This is the core technical mechanism of Blip. The guiding principle is: **never serialize and replace the entire file from the DOM.**

The browser's DOM serializer does not preserve the original file's formatting. Frameworks like Alpine and HTMX mutate the DOM at runtime. Saving raw `outerHTML` would introduce formatting noise into every commit and could bake in runtime-generated attributes and state.

#### Design principle: deterministic first, LLM as safety net

Blip's architecture prioritizes speed and predictability. Every edit should be processed deterministically using JavaScript wherever possible. An LLM call (currently Groq/Llama 3.3 70B) exists as a safety net for structural corruption that the deterministic path cannot repair. The LLM is never in the critical path for normal edits. This principle ensures sub-second save times for the vast majority of edits, with a ~100-200ms LLM fallback only when structural validation detects corruption.

If future testing reveals scenarios where the LLM consistently produces better results, the architecture supports expanding its role. The principle is not "avoid LLMs" but rather "don't add latency when you don't need to."

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

The sidebar occupies a percentage width of the browser window (suggested: 15-20% for the alpha, adjustable later). It is injected as an iframe on the left side of the viewport. When open, the page content shifts to the right to accommodate it.

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
