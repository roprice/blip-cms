# Blip - specs

> "People think that writing is writing, but actually writing is editing. Otherwise, you're just taking notes."
> - Chris Abani


## Table of Contents

### Purpose 
### Philosophy
### Use cases
### Compatibility
### Role of Github
### Architecture
### User onboarding experience
### Core editing mechanism
### UI states
### UI design
### Licensing and billing
### Current state
### Features
### Roadmap


## Purpose

Blip is a Chrome extension for editing website content in place, directly on the live page.

For **pro users** with GitHub-connected sites, Blip lets you edit your live website and commit changes without ever leaving the page. Pro users can also edit local files (via the File System Access API) and save changes directly to disk.

For **everyone else**, Blip lets you activate designMode on any webpage, make edits, and save a structured before/after diff to the sidebar. These diffs can be copied, shared, or emailed. No GitHub account required. No more screenshots with a red-circle workflows.

Blip exists because the current workflow for making small edits to a static website is absurdly friction-heavy: open VS Code, find the file, find the line, make the edit, save, commit, push, wait for deploy, check the live site. Distrubuting this work among multiple people compounds the friction of this process. This kills flow state and discourages the kind of rapid, iterative refinement that makes websites great.

With Blip, you visit your site, click edit, make your change, click save. Done. Or, if it's not your site, you capture the diff and share it with whoever owns it.

## Philosophy

### Flow state above all else

Blip is designed around one core principle: never break the user's flow. The entire interaction happens on the live site. There is no context switch to a code editor, no terminal, no login/2fa, no separate admin panel. The user stays in the browser, on their site, thinking about their content.

### The vibe-coding counterpart

When Andrej Karpathy coined "vibe coding" in early 2025, the premise was working at the speed of thought. But after deployment, that speed vanishes. The moment you need to fix a typo, update a price, or remove a client's name from a case study, you're back in VS Code staring at markup. Blip is the deterministic counterpart that keeps the vibe-coding promise intact after deployment.

### Locality of behavior

Blip targets HTML-first approaches to website/webapp development because they embody the principle of Locality of Behavior (LoB): the behavior of a unit of code is obvious just by looking at that unit of code. In these architectures, the content lives in the DOM, in the HTML file itself, not abstracted away into components, state trees, or databases. The DOM is the content database. This is what makes direct DOM editing viable. It's also what makes these frameworks ideal for AI-assisted development: the LLM can more efficiently reason about a single file rather than tracing dependencies across dozens of modules.

### Not a traditional CMS

Blip is a new kind of CMS for the vibe coding era. It does not  manage media libraries, content moderation/permissions workflows, taxonomies, or content data structures. It is a micro-CMS focused first and foremost on the most important function of an online business: editing text content. This is based on the premise that editing creates more value than authoring. Thus Blip is optimized for one thing: making quick changes to existing content on a live site with nearly zero friction. 

Blip will  evolve into fulfilling the second most important role of a CMS: quickly authoring and managing new pages, posts, and landing pages. It will also allow limited but essential meta editing, such as SEO meta tags and robots.tx. But it will never be an end-to-end website and content management solution as some CMS's aspire to - and frictionless, fast edit-in-place of live websites will always be the core function.


## Use cases

### Copyediting  and content editing
- Rewrite a headline because a better idea just hit you
- Adjust copy after reading it on the live site (where it reads differently than in a code editor)
- Rewrite CTAs in keeping with a news offering or product launch
- Rewrite blog posts, case studies, or services description in live site, where it reads differently than in a code editor or CMS
- Edit or rewrite profiles on 3rd party platforms, such as LinkedIn, Reddit, PRWeb, etc;  share with an assistant for implementation

### A/B copy testing prep 
- Draft variant conversion copy (eg. headlines/CTAs) directly on the live page to capture options before handing off to a developer or testing tool
- Make timestamped edits to conversion copy saved directly to repo; evaluate later against analytics.
- Swap variant back in, commit, compare periods in analytics

### Emergency hotfix 
- Fix a typo or grammatical error
- Update a price, date, or statistic
- Remove a client's name from a case study that shouldn't be public
- Update a privacy policy clause because another service requires it

### Onboarding and handoff 
- Agency handing a site to a client, walking them through edits live as training ("here's how you'd change this")
- Similar to above but showing multiple content and copy options beyond the saved version

### Collaboration and review 
- Audit a client's site and capture all proposed text changes in one session
- Save a before/after record of edits you want to make to your own site later
- Review a staging site and batch your feedback as structured diffs rather than screenshots

### Localization/translation review 
- editing live pages in a second language to verify translated copy reads naturally in context
- editing non-translated page elements in freemium mode for sharing with developer

### Microcopy editing for product managers
- adjust labels, button text, and informational text in enterprise websites, platforms, and apps
- for technical site editors, adjust dynamic text such as tooltips, warning/error messages, and help text

### SEO editing
- Optimize content topics, depth, interlinkage, and structure
- Edit robots.txt file to control search engine indexability
- Edit llms.txt file or similar to manage indexing by LLM robots
- [upcoming] Edit SEO fields directly via direct DOM editing: manage page title, meta description, opengraph

### Technical and developer use cases 
- Edit .md., .json, .txt, and .xml files that inform live feeds or on-site tool behavior, such as search or calculators
- Edit markdown files that inform "front-end" AI agents

### AI-assisted site management (low-friction computer use)

- Use Blip's structured diffs as instructions for an AI coding assistant to implement copy changes
- Train a computer-use agent to operate Blip directly - proposing edits in Freemium mode or committing them in Pro
- Edit instruction files for DOM-embedded AI agents (chatbots, assistants, calculators) without a redeploy.
- Allow embedded front-end agents to self-improve by editing their own instructions


## Compatibility

### Compatible website types for Blip Freemium

#### Business websites and blogs

Blip Freemium allows stakeholders, clients, or content managers to mock up text changes directly on live company pages regardless of whether they are hosted on closed platforms like Wix, Squarespace, and Shopify, or traditional CMSs like WordPress. Users can instantly capture a structured diff of their live edits to send to the web team for implementation, removing the ambiguity of screenshots and external documents.

#### Social-media platforms

Freemium enables social media managers and marketers to preview how posts, profile bios, or ad copy will appear natively within the UI of major networks like LinkedIn, Facebook, X (Twitter), and YouTube. By editing the live DOM, teams can test character limits and visual flow before officially publishing, capturing the exact text changes for internal approval workflows.

#### Forums, marketplaces and other platforms on the web

For e-commerce managers and community moderators, Blip facilitates in-situ drafting of product descriptions, storefront copy, or pinned posts on major hubs like Amazon, eBay, Etsy, Quora, and Reddit. Users can refine their copy exactly as the customer will see it, utilizing the diff capture to securely update the actual listings or guidelines later.

#### Web applications

Blip serves as a frictionless tool for product managers, UX writers project, managers,, and SaaS founders to edit microcopy, dashboard labels, and onboarding text directly within live web interfaces (such as Salesforce, HubSpot, Notion, Monday.com, or bespoke internal tools or SaaS products). The generated diffs provide engineers with precise, context-aware instructions for updating the application's underlying codebase or localization files.



### Compatible website type for Blip Pro

These share a common trait: content lives directly in Github-managed files, particularly inside an HTML file DOM that is rendered as a flat file. For such properties, edit-in-place without a complex reconciliation layer is viable and simple. Some use cases call for a post-hoc reconciliation process.

#### Vibe coded flat-file websites

Websites built with AI coding assistants (Claude, ChatGPT) or agentic IDE platforms (Bolt.new, Replit, Cursor) frequently output pure, flat-file architectures (HTML, CSS, JS). Users often deploy these directly to GitHub Pages or simple hosting environments. While AI is unparalleled for generating the initial codebase at the speed of thought, making minor post-deployment tweaks (fixing typos, changing prices) via chat prompts introduces massive friction. Blip serves as the deterministic, surgical counterpart to vibe coding—allowing the creator to instantly edit the live, AI-generated HTML and commit it straight back to the repo without breaking flow state. Post-hoc reconciliation not required.

#### WordPress, Drupal, and Django web properties

Web properties built with WordPress, Drupal, or Django - from blogs to enterprise websites to SaaS applications - can be configured to export flat HTML files using tools like Simply Static, Tome, or django-distill. When those files are committed to and managed in a GitHub repository, they become compatible with Blip Pro. Post-hoc reconciliation required.

#### API-based Headless CMS websites

When a headless CMS outputs static files committed to a git repo, those files are fully compatible with Blip. This includes websites rendered from products such as Strapi, Contentful, Sanity + Astro/Next, and Builder.io. Blip edits the rendered HTML, but the source of truth lives in a remote database. Post-hoc reconciliation required.

#### Git-based Headless CMS websites

 For headless CMSs like Decap CMS (formerly Netlify CMS) or TinaCMS, Blip can edit rendered HTML or directly edit the source .md/.json files via the file navigator. If editing source files directly, no reconciliation needed. If editing rendered HTML without realizing the source is in an adjacent file, reconciliation required.
 
#### No-build, flat-file websites

Some developers and agencies build "no-build" flat file website using basic building blocks of the web:

- Vanilla HTML, CSS, and JS
- Custom web components
- Native HTML data attributes

An emerging array of "no-build" front-end JS frameworks provide interactivity and backend integration while also allowing for a HTML-first, DOM-as-content-database approach. These include:

- Alpine.js https://github.com/alpinejs/alpine
- Mavo (https://github.com/mavoweb/mavo)
- Hyperscript (https://github.com/bigskysoftware/_hyperscript)
- Petite-Vue (https://github.com/vuejs/petite-vue)

Blip complements such solutions natively, allowing for immediate edits and not requiring post-hoc reconcliation.


### Non-compatible website types for Blip Pro

While Blip Freemium is an excellent complement to any of the solutions mentioned below, they are not suitable for Blip Pro.

#### Build-oriented JS frameworks

Like traditional CMS software products, JS frameworks requiring a build step, such as React, Next.js, Vue, Svelte, and similar component-based frameworks are explicitly out of scope for Blip. In those architectures, the rendered DOM is a projection of component state, not the source. Mapping DOM edits back to source files is a fundamentally harder problem that Blip is not focused on solving. 

#### Proprietary CMS platforms 

Blip cannot map edits back to relational databases, as would be necessary for traditional CMS solutions that leave content in database rather than rendering it as static files managed in Git repos. These are largely off-target for Blip, especially  the major popular proprietary CMS tools: Shopify, Wix, Squarespace, Framer, Webflow, etc. 
 

## Why Github

 GitHub is central to Blip's architecture. The reasons are:

 1. **Source of truth.** The original file on GitHub is the canonical version of the site. Blip fetches it before every edit session. This avoids saving framework-mutated DOM state (Alpine, HTMX, and others modify the DOM at runtime) and preserves the original file's formatting, indentation, and structure.

 2. **Version control for free.** Every edit becomes a git commit with a timestamp. The user gets full history, rollback capability, and diffs without Blip having to build any of that.

 3. **Deployment pipeline.** Most static sites already deploy from GitHub via Netlify, Vercel, Cloudflare Pages, or GitHub Pages. By committing to GitHub, Blip triggers the existing deploy pipeline automatically. No additional infrastructure needed.

 4. **Authentication and permissions.** GitHub personal access tokens provide identity, access control, and repo permissions. Blip does not need its own auth system or user database.

 5. **No custom backend required.** Blip operates as a pure client-side Chrome extension that talks directly to GitHub's API. There is no Blip server, no database, no infrastructure to maintain for the core editing flow.

 6. **SHA-based consistency.** GitHub's Contents API uses SHA hashes to ensure atomic commits. Blip always knows exactly which version of the file it's working against, preventing silent overwrites or merge conflicts.


## Blip Architecture



### Chrome extension structure

- `manifest.json` - extension configuration, permissions, URL matching
- `content.js` - injected into matched pages; manages the iframe, edit session, design mode, DOM observation, multi-file resolution, diff strategy routing
- `content.css` - injected into matched pages; iframe positioning and page margin shift
- `config.js` - injected into matched pages; all configuration (file resolution, sidebar, observer settings, membership tiers)
- `edit-history.js` - injected into matched pages; diff formatting and accumulation for the "your edits" textarea
- `text-diff.js` - injected into matched pages; text-diff strategy for plain-text files and fallback for DOM engine misses
- `local-fs.js` - injected into matched pages; File System Access API module for local file editing (Pro feature), including init, grant, and save flows
- `github.js` - injected into matched pages; GitHub API communication via background service worker
- `file-resolver.js` - injected into matched pages; URL-to-file resolution, site config loading from storage
- `mapping.js` - injected into matched pages; dual-track DOM text node mapping (simple text nodes + mixed-content parents)
- `background.js` - service worker; handles GitHub API communication (fetch, commit, file listing)
- `sidebar.html` - the sidebar UI (loaded inside the injected iframe); contains both collapsed tab widget and expanded sidebar views
- `sidebar.js` - sidebar logic; view toggling, tab state, file list navigation, license management, dev panel, edit history display
- `sidebar.css` - sidebar styling; greenhouse glass aesthetic, settings panels, local file UI

### File extension categories

```
files: {
  editableExtensions: ['.html', '.htm', '.shtml'],
  localEditableExtensions: ['.html', '.htm', '.shtml', '.md', '.txt'],
  devExtensions: ['.php', '.asp', '.aspx', '.txt', '.css', '.js', '.json', '.xml', '.svg', '.py', '.ts', '.tsx', '.jsx'],
  excludePatterns: ['template', '.git', '.vscode', '.github', '.blip', '.claude', '.gemini', '.agent', '.antigravity', '.codex', '.copilot', '.cursor', '.ref', 'node_modules', 'dist']
}
```

- `editableExtensions` - shown in file lists and resolved by default for online editing
- `localEditableExtensions` - resolved for local file editing (Pro, file:// pages)
- `devExtensions` - resolved only when developer mode is enabled (future toggle)
- `excludePatterns` - filtered out of repo file listings

### Sidebar

The sidebar is a single custom-injected iframe on the left side of the browser window. This iframe contains both the collapsed state (a floating tab widget) and the expanded state (the full sidebar panel). The iframe itself changes size between these two states; the internal content toggles which view is visible.

**Single-iframe architecture:**

The iframe is always present in the DOM. When collapsed, it shrinks to the tab widget dimensions (~150px wide, 38px tall) and is transparent, floating over the page content. When expanded, it grows to 350px wide by 100vh and the page body receives a left margin to make room.

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

### Freemium (default)
1. User installs Blip.
2. User visits any website. The sidebar appears with Edit, the "your edits" textarea, and a prompt to connect a GitHub repo.
3. User can immediately edit and capture diffs on any site.

### Pro
1. User purchases a license via Stripe and receives a license key by email.
2. User enters the key in the Blip Pro panel in the sidebar and clicks Activate.
3. The extension validates the key against an n8n webhook (`validate-blip-license`).
4. On success, the membership tier is stored in `chrome.storage.local`.
5. User adds a site in Manage Sites by entering a URL and GitHub repo configuration.
6. User visits a configured site. The file list shows with a `sync` icon confirming the connection. Files in the list are clickable for navigation.
7. Saves commit directly to GitHub. The "save to repo" checkbox defaults to checked.

### Pro tiers

- **Founding Member** - one connected site, GitHub commit, local file editing
- **Founding VIP** - unlimited connected sites, all Founding Member features

## Core editing mechanism

### Diff strategy routing

Blip uses two diff strategies, automatically selected at edit-start time based on page structure:

1. **DOM-mapping strategy** - for pages with meaningful HTML structure (multiple elements, rich DOM tree). This is the primary strategy for `.html` and `.htm` files on live sites. Uses dual-track text node mapping with character-offset precision.

2. **Text-diff strategy** - for pages rendered as plain text by the browser (single `<pre>` element wrapping file contents). This is the primary strategy for `.md`, `.txt`, `.json`, `.xml`, and other non-HTML files. Uses line-by-line text comparison with context-aware snippet generation.

The text-diff strategy also serves as a fallback: if the DOM-mapping engine finds zero changes but the mutation observer detected edits, the text-diff strategy is tried automatically. This catches edge cases where `designMode` interactions don't produce mappable mutations.

Detection is automatic: `isPlainTextPage()` checks whether the document body contains a single `<pre>` element (Chrome's default rendering for raw text files). No user configuration needed.

### Pro mode (GitHub-connected sites)

1. User visits a configured site.
2. Blip injects the sidebar iframe and fetches the repo file listing from GitHub to resolve which file corresponds to the current URL.
3. Blip prefetches the resolved file's content and SHA from GitHub immediately (before the user clicks Edit).
4. Sidebar appears in collapsed state (floating tab widget).
5. User clicks "Edit" (via the tab widget or the expanded sidebar).
6. Blip uses the prefetched source (or fetches if not yet available). It parses the source with `DOMParser` to create a clean source DOM.
7. Blip selects the diff strategy based on page structure and snapshots the text content.
8. Blip walks the live DOM, building a dual-track map: simple text nodes to character offsets, and mixed-content parents to innerHTML regions.
9. Blip attaches a `MutationObserver` watching both `characterData` and `childList` mutations.
10. `document.designMode` is enabled on the page.
11. User edits content directly on the page.
12. User clicks "Save."
13. Blip collects observed mutations and applies targeted replacements using the active diff strategy.
14. Blip generates a structured before/after diff entry and appends it to the "your edits" textarea in the sidebar.
15. If the "save to repo" checkbox is checked (default for connected sites), Blip commits the modified file to GitHub via the Contents API using the prefetched SHA.
16. GitHub returns a response containing the new SHA.
17. Blip updates the local SHA immediately, priming the system for the next edit.
18. The commit triggers the existing deployment pipeline (Netlify, Vercel, etc.).
19. User sees "Saved" confirmation.
20. UI returns to default state.

### Freemium mode (any website, no GitHub required)

1. User visits any website (Blip runs on all URLs via `<all_urls>` manifest match).
2. Blip injects the sidebar iframe. No GitHub fetch occurs.
3. User clicks "Edit."
4. Blip captures the live DOM's `outerHTML` as the local baseline for diffing.
5. Blip selects the diff strategy and snapshots the text content.
6. Blip walks the live DOM and builds the same dual-track text node map against the local baseline.
7. `document.designMode` is enabled. User edits content directly.
8. User clicks "Save."
9. Blip generates a structured before/after diff and appends it to the "your edits" textarea.
10. No GitHub commit occurs. The diff is the deliverable.
11. User sees "Saved to Blip" confirmation.
12. User can copy the accumulated diffs via the copy button, or share/email them.

The sidebar shows a prompt encouraging unconnected users to link their site to a GitHub repo for direct saving.

### Local file editing (Pro feature)

Local file editing allows Pro users to edit files opened via `file:///` URLs and save changes directly to disk using the browser's File System Access API.

1. User opens a local file in Chrome (e.g., `file:///Users/rdg/Claude/CLAUDE.md`).
2. Blip detects the `file:///` protocol and checks for a Pro license in `chrome.storage.local`.
3. If Pro, Blip attempts to restore a previously granted `FileSystemDirectoryHandle` from IndexedDB.
4. If no stored handle, the sidebar shows "Local file detected" with a "Grant folder access" button.
5. User clicks the button. Chrome's native directory picker opens. User selects the folder containing the file.
6. Blip stores the `FileSystemDirectoryHandle` in IndexedDB (keyed by directory path). This persists across sessions.
7. Blip parses the filename from the URL, reads the file content via the stored handle, and sets it as `sourceContent`.
8. User clicks Edit. The text-diff strategy activates (for `.md`, `.txt` files) or DOM-mapping (for `.html` files).
9. User edits and clicks Save. Blip writes the modified content back to the local file via `FileSystemFileHandle.createWritable()`.
10. Subsequent files in the same folder require zero permission prompts.

**Why IndexedDB for handle storage:** `chrome.storage.local` cannot hold `FileSystemDirectoryHandle` objects because they are structured-cloneable but not JSON-serializable. IndexedDB handles this natively.

**Folder picker limitation:** Chrome blocks `showDirectoryPicker()` for certain sensitive directories (home root, system folders). Users must select a subfolder, not `~/`.

### Diff strategy: DOM-mapping (primary, for HTML pages)

This is the core technical mechanism for HTML editing. The guiding principle is: **never serialize and replace the entire file from the DOM.**

The browser's DOM serializer does not preserve the original file's formatting. Frameworks like Alpine and HTMX mutate the DOM at runtime. Saving raw `outerHTML` would introduce formatting noise into every commit and could bake in runtime-generated attributes and state.

#### Design principle: deterministic first

Blip's architecture prioritizes speed and predictability. Every edit should be processed deterministically using JavaScript wherever possible. This principle ensures sub-second save times for the vast majority of edits.

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

### Diff strategy: text-diff (for plain-text files and fallback)

For files that the browser renders as plain text (inside a single `<pre>` element), the DOM-mapping strategy is ineffective because there is no meaningful DOM tree to map against. The text-diff strategy handles these cases:

1. At edit-start, `snapshotText()` captures the full text content of the page.
2. On save, `getCurrentText()` reads the current text content.
3. `computeLineDiff()` performs a line-by-line comparison with sync-point detection (up to 50-line lookahead).
4. Changed regions are formatted as before/after snippet pairs with one line of context above, compatible with the same `formatDiffEntry()` output format used by the DOM-mapping strategy.
5. For local files, the new text content is written directly to disk. For online editing, the diff is captured but not committed to GitHub (to preserve HTML structure that may wrap the text).

The text-diff strategy also activates as a fallback when the DOM-mapping engine finds zero changes but the mutation observer detected edits (`hasEdits === true`). This catches edge cases in `designMode` interaction that don't produce mappable mutations.

**Why this approach over alternatives:**

- **XPath:** Can break if frameworks inject wrapper elements at runtime. An XPath that was valid against the source may not match the live DOM, or vice versa.
- **Unified diff:** Operates on lines, not semantic content. Gets confused by duplicate content (e.g., two `<p>` tags with similar text). Line-level diffing can also be thrown off by whitespace differences between source and rendered DOM.
- **Full DOM serialization:** Destroys formatting and captures framework runtime state. Ruled out entirely.
- **Text-node-only mapping (original approach):** Works for simple text edits but fails when `designMode` restructures nodes around inline elements. The dual-track approach retains the speed of text-node mapping for simple cases while handling complex cases at the parent level.

### MutationObserver: configuration and known risks

The MutationObserver watches for both `characterData` (text changes) and `childList` (structural changes) mutations. It is configured with `subtree: true` to capture changes anywhere in the document body.

**User interaction filtering:** Removed. During `designMode`, all characterData mutations are user-initiated. The previous approach of filtering by tracked user interactions caused false negatives ("no changes detected" on valid edits). The `settleDelayMs` (150ms) after enabling designMode is sufficient to filter out browser normalization mutations.

**Known risks and mitigations:**

1. **Framework-initiated mutations.** Alpine, HTMX, and other frameworks react to user interactions. Clicking into a text node could trigger a binding that changes other text on the page.
   - *Mitigation:* The 150ms settle delay filters initial framework reactions. For ongoing framework mutations, the parent-level innerHTML comparison naturally captures only the net change. Future: scope observation to content areas, excluding known dynamic containers.

2. **Browser normalization on designMode activation.** When `designMode` is enabled, the browser may normalize the DOM: collapsing whitespace, wrapping bare text nodes in elements.
   - *Mitigation:* Observer starts after a configurable delay (`settleDelayMs`, default 150ms). Mutations during this window are not captured.

3. **Copy-paste injecting structural HTML.** When a user pastes formatted text, the browser may insert elements with inline styles rather than plain text.
   - *Mitigation:* Paste events are intercepted and forced to plain-text paste via `e.preventDefault()` + manual text node insertion.

4. **Dynamic content generating mutations.** If the page has live clocks, animated counters, HTMX polling, or other dynamic elements, these generate mutations during the edit session.
   - *Mitigation:* Only observe `characterData` mutation type. Additionally, scope observation to the main content area if possible, excluding known dynamic widget containers.

None of these are showstoppers. They are all filterable. But they must be handled to avoid phantom edits appearing in commits.

## UI states

### Default state

The sidebar displays the Blip branding, a single "Edit" button, and a persistent close element. The page is in its normal, non-editable state.

### Editing state

- The "Edit" button changes to display "Editing" (visually distinct, indicating active mode).
- For local files (Pro), a "Saving to [filename]" indicator appears.
- A "Cancel" button appears. Clicking it discards all edits, disables designMode, restores the original DOM state, and returns to the default state.
- A "Save" button appears. Clicking it triggers the diff-and-commit flow.
- `document.designMode = 'on'` is active on the page.

### Save confirmation

After a successful save, the sidebar displays a contextual notification:
- "Saved" for Pro GitHub commits
- "Saved to file" for local file saves
- "Saved to Blip" for freemium diff captures

The UI returns to the default state.

### Error state

If the GitHub commit fails (network error, auth expiry, merge conflict, SHA mismatch), the sidebar displays a clear error message. The user's edits remain in the DOM so nothing is lost. They can retry or copy their changes manually.

For SHA conflicts (409), Blip automatically re-fetches the latest version from GitHub and reports the sync status.

### Local file states

- **Grant access prompt** - shown on `file:///` pages for Pro users without stored folder access. Displays the detected filename and a "Grant folder access" button.
- **Ready** - folder access granted, file loaded. Edit button enabled, "Saving to [filename]" shown during edit.
- **Not Pro** - `file:///` page without a Pro license. Falls through to freemium mode (edit + accumulate diffs, no save to disk).


### Site configuration

- GitHub repo owner, repo name, branch, and personal access token are configured per-site via the Manage Sites form in the sidebar.
- Multiple site-to-repo mappings are supported (VIP tier: unlimited; Member tier: one site).
- Freemium users can save to local files only. They can Pro features in disabled state (Save to repo, Manage/add sites, etc)
- File path is resolved dynamically: Blip fetches the repo's file listing at init, filters to editable extensions, and matches the current URL path to a file. Template files and config directories are excluded via configurable patterns.
- Branch mapping defaults to `main` but can be configured per-site.
- All configuration data is stored in `chrome.storage.local`.




### Dev panel

The dev panel is a diagnostic tool that shows real-time information about the editing session: file resolution, source loading, diff strategy selection, mutation tracking, save transactions, and error details. It is toggled via `chrome.storage.local`:

```js
// Enable
chrome.storage.local.set({ blipDev: true });
// Disable
chrome.storage.local.set({ blipDev: false });
```

The `dev.enabled` flag in `config.js` controls whether dev log messages are sent to the sidebar. Both must be true for the panel to show logs.

## UI design


### Design principles

- Minimal. The sidebar should feel like a tool strip, not an application.
- The edit button is the dominant element in default state. Everything else is secondary.
- In editing state, save and cancel are equally accessible. Neither should require scrolling.
- Dev notifications should be visually distinct from user-facing UI (muted color, smaller font, monospace) so they are clearly diagnostic.
- The sidebar should have its own scroll if content overflows, independent of the page scroll.
- Light, airy green palette. Translucent backgrounds throughout. The aesthetic is unobtrusive and bright, not heavy or dark.


### Sidebar layout

The sidebar is fixed at 350px wide. It is injected as an iframe on the left side of the viewport. When expanded, the page content shifts to the right to accommodate it. When collapsed, only the floating tab widget is visible.

**Default state** (top to bottom):

- Header: Blip logo/wordmark + close element (always visible)
- Primary action: Edit button (large, prominent)
- Notifications area
- Your edits: diff accumulator textarea with copy button (always visible, shows placeholder when empty)
- File list: collapsible site groups with connection status icons (`sync`/`sync_disabled`), active file highlighted with green dot, files clickable for navigation on connected sites
- Settings panels: Manage Sites (collapsible), Blip Pro (collapsible)
- Dev panel (when enabled): diagnostic log

**Editing state** (top to bottom):

- Header: Blip logo/wordmark + close element
- Status indicator: "Editing" label (green accent badge with pulsing dot), inline with Save and Cancel buttons
- Save-to-repo checkbox (shown for connected sites, checked by default) OR prompt to connect (shown for unconnected sites) OR local file indicator (shown for `file:///` pages)
- Notifications area
- Your edits textarea
- File list
- Settings panels
- Dev panel (when enabled)

**After save** (top to bottom):

- Header: Blip logo/wordmark + close element
- Confirmation notification (auto-dismisses after 4 seconds)
- Primary action: Edit button returns
- Your edits textarea (now containing the diff entry from the save)
- File list
- Settings panels
- Dev panel (when enabled)

### Collapsed tab widget

When the sidebar is collapsed, a small floating tab at top-left provides a mini control panel:

- Default: shows "blip". On hover, expands to show "blip [edit] [>>]".
- Editing: green background, stays expanded, shows "blip [cancel] [save] [>>]".
- Saving: green background with pulse animation, shows "blip [saving...] [>>]" with animated ellipsis.
- Saved: green background, shows "blip [saved!] [>>]" for 1.5 seconds, then contracts.
- Error: red background, stays expanded, shows "blip [retry] [>>]".

The tab controls delegate actions to content.js. The expand icon (>>) opens the full sidebar.



## Licensing and billing

- License keys are generated via a Stripe webhook -> n8n workflow -> UUID key generation -> Gmail notification pipeline.
- Users enter their key in the Blip Pro panel and click Activate.
- The extension validates keys against an n8n webhook (`validate-blip-license` at `my.remaphq.com`).
- On success, the membership tier (`foundingMember` or `foundingVIP`) and key are stored in `chrome.storage.local`.
- The sidebar UI adapts to the tier: unlicensed shows buy/activate, Member shows key (masked) + VIP upgrade link, VIP shows an active badge.



## Current status 2026-03-22

Note that this document currently serves as a combined product strategy and specs document.

Everything described in these sections has been built:

- Architecture
- User onboarding experience
- Core editing mechanism
- UI states
- UI design
- Features

Nothing in the Roadmap has been built, except backend (n8n, Stripe) portions of the licensing flow (## Account and configuration)

All use cases (## Use cases) are currently viable except:
`- [upcoming] Edit SEO fields directly via direct DOM editing: manage page title, meta description, opengraph`

## Features

### Freemium features 
- Create copy and content edits to any website or web application 
- Save edits locally, then send them later as a block of text using the redline log's  (copy and paste)
- Edit any number of websites or web applications
- Accumulate edits across multiple sites in one session

### Blip Pro features
- Connect to GitHub repositories
- Instantly see which files in a given repo are suitable for editing by Blip
- Edit and commit files to GitHub directly from the live site
- Edit local files via File System Access API and save to disk
- Edit .md, .txt, .xml, and .json files
- Clickable file navigation in the sidebar (useful for toggling between files with and without a page navigation)
- Dev panels logs let non-technical Pro users report saving issues to devs, to help them optimize for Blip editing
- Edit markdown files used by AI coding assistants (Claude, Cursor, etc.) in a formatted browser view
- Edit configuration files, task lists, or notes that live on your local machine
- Quick edits to local development files without switching to a code editor

## Roadmap

### Near-term (pre-launch)
- Stripe + license key integration (end-to-end flow)
- Grey out "add site" form if no license
- Design enhancements, in sync with existing www.blipcms.com website design refresh
- Manual QA

### Launch
- Chrome Web Store submission prep
- Write permissions justification
- Screenshots (tone strategy: screenshots should show the product in action, with a focus on the user experience. They should be clean, modern, and professional. They should also be consistent with the product's branding.)
- Write listing copy
- Prepare terms and conditions, privacy policy pages
- Secure @blipcms.com email address
- Extract product-strategy.md, and roadmap.md, and let specs.md be more narrowly confined to specs: prune ## Use Cases, Philosophy, and Compatibility sections, and remove ## Roadmap entirely
- Submit to CWS
- Monitor CWS review process
- Address any issues raised by CWS review
- Publish to CWS

### Milestone 1: Post-launch shareability enhancements
- A unique redline log for each site you edit - with its own copy, share, clear and delete controls
- Email button for freemium redline log 
- Email diffs directly from Blip (branded email from a Blip domain)
- Minimalist diffs shared to redline log (minimum viable markup as opposed to Github-standards defaults for diffs)

### Milestone 2: features for marketers and content managers
- Edit file names
- Edit SEO meta tags (title, description) via sidebar form
- Before and after screenshots, downloadable
- Sidebar width resizing (drag handle, currently hardcoded at 350px)

### Milestone 3: features for developers and technical marketers
- Developer mode toggle (shows dev extensions + dev panel)
- Support for non-GitHub hosts (GitLab, Bitbucket)
- Branch selection per site (main, dev, etc)
- Keyboard shortcuts: toggle sidebar, toggle edit/cancel mode, save, and toggle between repo branches
- Source file detection: flag when edited HTML content originates in an adjacent .md, .json, or other source file, with a prompt to edit there instead


## Future considerations
- Collaborative editing (multiple users editing the same site)
- CSS editing support
- Create new pages from templates 
- Edit reusable templates
- Delete files (pages and posts)
- Image replacement via drag-and-drop
- Auto-commit message customization
- Integrations with project/task management tools (share button > Monday.com, Jira, etc)
- Detect source-file built pages, ie for headless CMS products like Tiny CMS
- AI-assisted page creation from templates
- AI-assisted SEO meta tag generation
- WordPress plugin that that translates Blip commits to database
