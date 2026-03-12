'use strict';
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
function formatDiffEntry(url, filename, snippets) {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const d = new Date();
    d.setUTCHours(d.getUTCHours() - 5);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getUTCMonth()];
    const day = d.getUTCDate();
    const year = d.getUTCFullYear();
    let hours = d.getUTCHours();
    const minutes = d.getUTCMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    const publicTimestamp = `${month} ${day} ${year}, ${hours}:${minutes} ${ampm} EST`;

    // Clean the URL: strip http(s):// and trailing slashes/hashes
    const cleanUrl = url.replace(/^https?:\/\//, '').replace(/[\/#]+$/, '');

    let entry = `Blip edit of ${cleanUrl}:\n`;

    for (const snippet of snippets) {
        entry += `\n*Before*\n${snippet.before}\n\n*After*\n${snippet.after}\n`;
    }

    entry += `\n- edited on ${publicTimestamp} -\n`;
    return entry;
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
    while (pos >= 0 && sourceContent[pos] !== '>') pos--;
    if (pos < 0) return null;

    // Walk further back to find '<' that starts this opening tag
    let tagStart = pos;
    while (tagStart >= 0 && sourceContent[tagStart] !== '<') tagStart--;
    if (tagStart < 0) return null;

    // Verify it's an opening tag (not a closing tag)
    const openTagStr = sourceContent.substring(tagStart, pos + 1);
    if (openTagStr.startsWith('</')) return null;

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
        tagEnd: closeIdx + closeStr.length
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
            rep.sourceOffset + rep.sourceLength
        );
        const afterInner = rep.replacement;

        // Try to wrap in enclosing element context
        const enclosing = getEnclosingElement(sourceContent, rep.sourceOffset, rep.sourceLength);

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
