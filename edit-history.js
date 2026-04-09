"use strict";
// Edit history: diff formatting and accumulation
// Formats before/after snippets into a readable diff string
// and manages the running list of edits in the sidebar textarea.

// -------------------------------------------------------
// Diff entry formatting
// -------------------------------------------------------

/**
 * Format a complete diff entry for one save operation.
 * May contain multiple before/after pairs if multiple edits were saved at once.
 *
 * @param {string} url - full page URL
 * @param {string} filename - resolved file name (e.g. "index.html")
 * @param {Array<{before: string, after: string}>} snippets - before/after pairs
 * @returns {string} formatted diff text
 */

/**
 * Word-level inline diff. Returns { beforeHtml, afterHtml } with
 * changed words wrapped in <mark> tags.
 */
function inlineDiff(beforeStr, afterStr) {
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Split on whitespace but also separate HTML tags from adjacent text
  const tokenize = (s) => s.match(/<[^>]+>|[^\s<]+|\s+/g) || [];
  const beforeWords = tokenize(beforeStr);
  const afterWords = tokenize(afterStr);

  // Simple LCS-based word diff
  const m = beforeWords.length;
  const n = afterWords.length;

  // Build LCS table
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (beforeWords[i - 1] === afterWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find which words are common
  const beforeFlags = new Array(m).fill(false); // true = changed
  const afterFlags = new Array(n).fill(false);
  let i = m,
    j = n;
  while (i > 0 && j > 0) {
    if (beforeWords[i - 1] === afterWords[j - 1]) {
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      beforeFlags[i - 1] = true;
      i--;
    } else {
      afterFlags[j - 1] = true;
      j--;
    }
  }
  while (i > 0) {
    beforeFlags[i - 1] = true;
    i--;
  }
  while (j > 0) {
    afterFlags[j - 1] = true;
    j--;
  }

  // Build HTML with highlights
  let beforeHtml = "";
  for (let k = 0; k < m; k++) {
    if (beforeFlags[k]) {
      beforeHtml += "<mark>" + esc(beforeWords[k]) + "</mark>";
    } else {
      beforeHtml += esc(beforeWords[k]);
    }
  }

  let afterHtml = "";
  for (let k = 0; k < n; k++) {
    if (afterFlags[k]) {
      afterHtml += "<mark>" + esc(afterWords[k]) + "</mark>";
    } else {
      afterHtml += esc(afterWords[k]);
    }
  }
  // Merge consecutive <mark> tags (including whitespace-only marks between them)
  const merge = (html) => html.replace(/<\/mark>(\s*)<mark>/g, "$1");
  beforeHtml = merge(beforeHtml);
  afterHtml = merge(afterHtml);

  return { beforeHtml, afterHtml };
}

function formatDiffEntry(url, filename, snippets) {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() - 5);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  let hours = d.getUTCHours();
  const minutes = d.getUTCMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  const publicTimestamp = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
  const cleanUrl = url.replace(/^https?:\/\//, "").replace(/[\/#]+$/, "");

  // Helper to escape HTML in user content
  function esc(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  let snippetHtml = "";
  for (const snippet of snippets) {
    const { beforeHtml, afterHtml } = inlineDiff(snippet.before, snippet.after);
    snippetHtml += `<span class="diff-after">${afterHtml}</span>`;
    snippetHtml += `<span class="diff-before">${beforeHtml}</span>`;
  }

  return `<div class="diff-entry">
        <div class="diff-header">${esc(cleanUrl)}</div>
        <div class="diff-filename">${esc(filename)}</div>
        ${snippetHtml}
        <div class="diff-timestamp">${esc(publicTimestamp)}</div>
    </div>`;
}

// -------------------------------------------------------
// Source context extraction
// -------------------------------------------------------

/**
 * Given a character offset into sourceContent that points to an innerHTML region,
 * find the enclosing element's full outerHTML in the source string.
 *
 * @param {string} sourceContent - the raw source file
 * @param {number} innerOffset - start of the inner content in sourceContent
 * @param {number} innerLength - length of the inner content
 * @returns {object|null} {fullBefore, tagStart, tagEnd} or null
 */
function getEnclosingElement(sourceContent, innerOffset, innerLength) {
  // Walk backwards from innerOffset to find '>' that ends the opening tag
  let pos = innerOffset - 1;
  while (pos >= 0 && sourceContent[pos] !== ">") pos--;
  if (pos < 0) return null;

  // Walk further back to find '<' that starts this opening tag
  let tagStart = pos;
  while (tagStart >= 0 && sourceContent[tagStart] !== "<") tagStart--;
  if (tagStart < 0) return null;

  // Verify it's an opening tag (not a closing tag)
  const openTagStr = sourceContent.substring(tagStart, pos + 1);
  if (openTagStr.startsWith("</")) return null;

  // Extract the tag name
  const tagMatch = openTagStr.match(/<(\w+)/);
  if (!tagMatch) return null;
  const tagName = tagMatch[1];

  // Find the matching closing tag after the inner content
  const closeStr = `</${tagName}>`;
  const closeIdx = sourceContent.indexOf(closeStr, innerOffset + innerLength);
  if (closeIdx === -1) return null;

  return {
    fullBefore: sourceContent.substring(tagStart, closeIdx + closeStr.length),
    openTag: openTagStr,
    tagName: tagName,
    tagStart: tagStart,
    tagEnd: closeIdx + closeStr.length,
  };
}

/**
 * Build before/after snippet pairs from the allReplacements array.
 * Each snippet includes enclosing element context when possible.
 *
 * @param {string} sourceContent - original source file content
 * @param {Array} allReplacements - sorted replacements from saveEdits()
 * @returns {Array<{before: string, after: string}>}
 */
function buildDiffSnippets(sourceContent, allReplacements) {
  const snippets = [];

  // allReplacements is sorted descending by offset for the replacement loop;
  // reverse to show diffs in document order
  const ordered = [...allReplacements].reverse();

  for (const rep of ordered) {
    const beforeInner = sourceContent.substring(
      rep.sourceOffset,
      rep.sourceOffset + rep.sourceLength,
    );
    const afterInner = rep.replacement;

    // Try to wrap in enclosing element context
    const enclosing = getEnclosingElement(
      sourceContent,
      rep.sourceOffset,
      rep.sourceLength,
    );

    if (enclosing) {
      const beforeSnippet = enclosing.fullBefore;
      // Reconstruct "after" by splicing the replacement into the enclosing element
      const relOffset = rep.sourceOffset - enclosing.tagStart;
      const afterSnippet =
        enclosing.fullBefore.substring(0, relOffset) +
        afterInner +
        enclosing.fullBefore.substring(relOffset + rep.sourceLength);
      snippets.push({ before: beforeSnippet, after: afterSnippet });
    } else {
      // Fallback: show raw before/after without tag context
      snippets.push({ before: beforeInner, after: afterInner });
    }
  }

  return snippets;
}
