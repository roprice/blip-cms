'use strict';
// DOM text node mapping: dual-track (simple text nodes + mixed-content parents)

const INLINE_TAGS = new Set([
    'a', 'abbr', 'b', 'bdo', 'br', 'cite', 'code', 'dfn', 'em', 'i',
    'kbd', 'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small',
    'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr'
]);

function isMixedContentParent(el) {
    let hasTextChild = false;
    let hasElementChild = false;
    for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) hasTextChild = true;
        if (child.nodeType === Node.ELEMENT_NODE) hasElementChild = true;
        if (hasTextChild && hasElementChild) return true;
    }
    return false;
}

function buildTextNodeMap(liveRoot, sourceString, silent = false) {
    textNodeMap = [];
    parentMap = [];
    const processedParents = new Set();
    const liveTextNodes = getTextNodes(liveRoot);

    for (const liveNode of liveTextNodes) {
        const text = liveNode.textContent;
        if (!text || !text.trim()) continue;
        const parentEl = liveNode.parentElement;

        if (parentEl && isMixedContentParent(parentEl) && !processedParents.has(parentEl)) {
            processedParents.add(parentEl);
            const parentMapping = findParentInSource(parentEl, sourceString);
            if (parentMapping) {
                parentMap.push({
                    liveParent: parentEl,
                    sourceInnerHTML: parentMapping.innerHTML,
                    sourceOffset: parentMapping.offset,
                    sourceLength: parentMapping.length,
                    originalInnerHTML: parentMapping.innerHTML
                });
            }
            mapTextNodesInParent(parentEl, sourceString);
            continue;
        }

        if (parentEl && processedParents.has(parentEl)) continue;

        const offset = findTextInSource(text, liveNode, sourceString);
        if (offset !== -1) {
            textNodeMap.push({
                liveNode,
                sourceOffset: offset,
                sourceLength: text.length,
                originalText: text,
                parentMapped: false
            });
        }
    }

    if (!silent) {
        devLog('Mapped nodes', `${textNodeMap.length} text nodes`, 'success');
        if (parentMap.length > 0) {
            devLog('Mixed parents', `${parentMap.length} parent-level maps`, 'success');
        }
    }
}

function mapTextNodesInParent(parentEl, sourceString) {
    for (const child of parentEl.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
            const offset = findTextInSource(child.textContent, child, sourceString);
            if (offset !== -1) {
                textNodeMap.push({
                    liveNode: child,
                    sourceOffset: offset,
                    sourceLength: child.textContent.length,
                    originalText: child.textContent,
                    parentMapped: true
                });
            }
        }
        if (child.nodeType === Node.ELEMENT_NODE && INLINE_TAGS.has(child.tagName.toLowerCase())) {
            for (const grandchild of child.childNodes) {
                if (grandchild.nodeType === Node.TEXT_NODE && grandchild.textContent.trim()) {
                    const offset = findTextInSource(grandchild.textContent, grandchild, sourceString);
                    if (offset !== -1) {
                        textNodeMap.push({
                            liveNode: grandchild,
                            sourceOffset: offset,
                            sourceLength: grandchild.textContent.length,
                            originalText: grandchild.textContent,
                            parentMapped: true
                        });
                    }
                }
            }
        }
    }
}

function findParentInSource(liveParent, sourceString) {
    const tag = liveParent.tagName.toLowerCase();
    const innerHTML = liveParent.innerHTML;
    const tagRegex = new RegExp(`<${tag}[^>]*>`, 'gi');
    let match;
    const candidates = [];
    while ((match = tagRegex.exec(sourceString)) !== null) {
        candidates.push({ offset: match.index, tagLength: match[0].length });
    }
    if (candidates.length === 0) return null;

    for (const candidate of candidates) {
        const afterOpenTag = candidate.offset + candidate.tagLength;
        const closeIdx = findMatchingCloseTag(sourceString, afterOpenTag, tag);
        if (closeIdx === -1) continue;
        const candidateInnerHTML = sourceString.substring(afterOpenTag, closeIdx);
        const candidateText = candidateInnerHTML.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        const innerText = innerHTML.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        if (candidateText === innerText) {
            return { innerHTML: candidateInnerHTML, offset: afterOpenTag, length: candidateInnerHTML.length };
        }
    }

    let bestMatch = null;
    let bestScore = -1;
    for (const candidate of candidates) {
        const afterOpenTag = candidate.offset + candidate.tagLength;
        const closeIdx = findMatchingCloseTag(sourceString, afterOpenTag, tag);
        if (closeIdx === -1) continue;
        const candidateInnerHTML = sourceString.substring(afterOpenTag, closeIdx);
        const candidateText = candidateInnerHTML.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        const innerText = innerHTML.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        const cWords = new Set(candidateText.split(/\s+/));
        const iWords = new Set(innerText.split(/\s+/));
        const intersection = [...cWords].filter(w => iWords.has(w)).length;
        const union = new Set([...cWords, ...iWords]).size;
        const score = union > 0 ? intersection / union : 0;
        if (score > bestScore) {
            bestScore = score;
            bestMatch = { innerHTML: candidateInnerHTML, offset: afterOpenTag, length: candidateInnerHTML.length };
        }
    }
    return bestScore > 0.5 ? bestMatch : null;
}

function findMatchingCloseTag(source, startFrom, tagName) {
    let depth = 1;
    const openPattern = new RegExp(`<${tagName}[\\s>]`, 'gi');
    const closePattern = new RegExp(`</${tagName}>`, 'gi');
    openPattern.lastIndex = startFrom;
    closePattern.lastIndex = startFrom;
    const events = [];
    let m;
    while ((m = openPattern.exec(source)) !== null) events.push({ pos: m.index, type: 'open' });
    while ((m = closePattern.exec(source)) !== null) events.push({ pos: m.index, type: 'close' });
    events.sort((a, b) => a.pos - b.pos);
    for (const event of events) {
        if (event.type === 'open') depth++;
        if (event.type === 'close') { depth--; if (depth === 0) return event.pos; }
    }
    return -1;
}

function getTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tag = parent.tagName.toLowerCase();
            if (tag === 'script' || tag === 'style' || tag === 'noscript') return NodeFilter.FILTER_REJECT;
            if (parent.closest('#blip-sidebar-frame')) return NodeFilter.FILTER_REJECT;
            if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
}

function findTextInSource(text, liveNode, sourceString) {
    const trimmedText = text.trim();
    if (!trimmedText) return -1;
    const escaped = trimmedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped.replace(/\s+/g, '\\s+'), 'g');
    const matches = [];
    let match;
    while ((match = regex.exec(sourceString)) !== null) {
        matches.push({ offset: match.index, length: match[0].length });
    }
    if (matches.length === 0) return -1;
    if (matches.length === 1) return matches[0].offset;
    const allLiveTextNodes = getTextNodes(document.body);
    let occurrenceIndex = 0;
    for (const node of allLiveTextNodes) {
        if (node === liveNode) break;
        if (node.textContent.trim() === trimmedText) occurrenceIndex++;
    }
    return occurrenceIndex < matches.length ? matches[occurrenceIndex].offset : matches[0].offset;
}