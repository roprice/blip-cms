// Blip content script
// Injected into matched pages. Manages sidebar, editing, observation, and commit flow.

(function () {
  'use strict';

  // -------------------------------------------------------
  // State
  // -------------------------------------------------------
  let sidebarFrame = null;
  let isEditing = false;
  let sourceContent = null;   // raw file string from GitHub
  let sourceSHA = null;
  let sourceDOM = null;       // DOMParser result of the source
  let textNodeMap = [];       // { liveNode, sourceOffset, sourceLength }
  let observer = null;        // MutationObserver
  let mutations = [];         // recorded characterData mutations
  let userInteractedNodes = new Set(); // nodes the user clicked/focused

  // -------------------------------------------------------
  // Sidebar injection
  // -------------------------------------------------------
  function injectSidebar() {
    if (document.getElementById('blip-sidebar-frame')) return;

    const width = Math.max(
      BLIP_CONFIG.sidebar.minWidthPx,
      Math.min(
        window.innerWidth * (BLIP_CONFIG.sidebar.widthPercent / 100),
        BLIP_CONFIG.sidebar.maxWidthPx
      )
    );

    sidebarFrame = document.createElement('iframe');
    sidebarFrame.id = 'blip-sidebar-frame';
    sidebarFrame.src = chrome.runtime.getURL('sidebar.html');
    sidebarFrame.style.width = width + 'px';

    document.documentElement.style.setProperty('--blip-sidebar-width', width + 'px');
    document.documentElement.classList.add('blip-sidebar-open');
    document.documentElement.appendChild(sidebarFrame);

    window.addEventListener('message', handleSidebarMessage);
  }

  function removeSidebar() {
    if (sidebarFrame) {
      sidebarFrame.remove();
      sidebarFrame = null;
    }
    document.documentElement.classList.remove('blip-sidebar-open');
    document.documentElement.style.removeProperty('--blip-sidebar-width');
    window.removeEventListener('message', handleSidebarMessage);
  }

  // -------------------------------------------------------
  // Sidebar communication
  // -------------------------------------------------------
  function sendToSidebar(action, data = {}) {
    if (!sidebarFrame || !sidebarFrame.contentWindow) return;
    sidebarFrame.contentWindow.postMessage({ source: 'blip-content', action, ...data }, '*');
  }

  function devLog(label, value, status = '', entryId = null) {
    if (!BLIP_CONFIG.dev.enabled) return;
    sendToSidebar('devLog', { label, value, status, entryId });
  }

  function handleSidebarMessage(event) {
    const msg = event.data;
    if (msg.source !== 'blip-sidebar') return;

    switch (msg.action) {
      case 'startEdit':
        startEditSession();
        break;
      case 'save':
        saveEdits();
        break;
      case 'cancel':
        cancelEdits();
        break;
      case 'closeSidebar':
        cancelEdits();
        removeSidebar();
        break;
    }
  }

  // -------------------------------------------------------
  // GitHub communication (via background script)
  // -------------------------------------------------------
  async function fetchFromGitHub() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'GITHUB_FETCH', config: BLIP_CONFIG.github },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error));
          }
        }
      );
    });
  }

  async function commitToGitHub(content, sha) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'GITHUB_COMMIT', config: BLIP_CONFIG.github, content, sha },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error));
          }
        }
      );
    });
  }

  // -------------------------------------------------------
  // Text node mapping
  // -------------------------------------------------------
  function buildTextNodeMap(liveRoot, sourceString, silent = false) {
    textNodeMap = [];
    const liveTextNodes = getTextNodes(liveRoot);

    for (const liveNode of liveTextNodes) {
      const text = liveNode.textContent;
      if (!text || !text.trim()) continue;

      // Find this text content in the source string
      // Use surrounding context (parent tag) to disambiguate
      const offset = findTextInSource(text, liveNode, sourceString);
      if (offset !== -1) {
        textNodeMap.push({
          liveNode,
          sourceOffset: offset,
          sourceLength: text.length,
          originalText: text
        });
      }
    }

    if (!silent) devLog('Mapped nodes', `${textNodeMap.length} text nodes`, 'success');
  }

  function getTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip script, style, and blip's own elements
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'noscript') {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.closest('#blip-sidebar-frame')) {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip whitespace-only nodes
          if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    return nodes;
  }

  function findTextInSource(text, liveNode, sourceString) {
    // Strategy: find the text in the source, using parent tag context to disambiguate.
    // For duplicate text content, we use occurrence order.

    const trimmedText = text.trim();
    if (!trimmedText) return -1;

    // Escape special regex chars
    const escaped = trimmedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Allow flexible whitespace matching between words
    const flexPattern = escaped.replace(/\s+/g, '\\s+');
    const regex = new RegExp(flexPattern, 'g');

    // Collect all matches
    const matches = [];
    let match;
    while ((match = regex.exec(sourceString)) !== null) {
      matches.push({ offset: match.index, length: match[0].length });
    }

    if (matches.length === 0) return -1;
    if (matches.length === 1) return matches[0].offset;

    // Multiple matches: disambiguate by occurrence order.
    // Count how many previous siblings/text nodes with the same content appear before this one.
    const allLiveTextNodes = getTextNodes(document.body);
    let occurrenceIndex = 0;
    for (const node of allLiveTextNodes) {
      if (node === liveNode) break;
      if (node.textContent.trim() === trimmedText) {
        occurrenceIndex++;
      }
    }

    if (occurrenceIndex < matches.length) {
      return matches[occurrenceIndex].offset;
    }

    // Fallback to first match
    return matches[0].offset;
  }

  // -------------------------------------------------------
  // MutationObserver
  // -------------------------------------------------------
  function startObserving() {
    mutations = [];

    observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.type !== 'characterData') continue;

        const target = mutation.target;

        // Only track mutations on nodes the user has interacted with
        if (BLIP_CONFIG.observer.trackOnlyUserInitiated) {
          if (!userInteractedNodes.has(target) && !userInteractedNodes.has(target.parentElement)) {
            continue;
          }
        }

        // Find this node in our map
        const mapping = textNodeMap.find(m => m.liveNode === target);
        if (!mapping) continue;

        // Record the mutation (latest value wins for same node)
        const existing = mutations.find(m => m.liveNode === target);
        const parentTag = target.parentElement ? target.parentElement.tagName.toLowerCase() : '?';
        const preview = target.textContent.length > 30
          ? target.textContent.substring(0, 30) + '…'
          : target.textContent;
        if (existing) {
          existing.newText = target.textContent;
          devLog('Mutation', `<${parentTag}> "${preview}"`, '');
        } else {
          mutations.push({
            liveNode: target,
            originalText: mapping.originalText,
            newText: target.textContent,
            sourceOffset: mapping.sourceOffset,
            sourceLength: mapping.sourceLength
          });
          devLog('Mutation', `<${parentTag}> "${preview}"`, 'success');
        }
      }
    });

    // Start observing after the settle delay
    setTimeout(() => {
      observer.observe(document.body, {
        characterData: true,
        subtree: true
      });
      devLog('Observer', 'active', 'success', 'observer-status');
    }, BLIP_CONFIG.observer.settleDelayMs);
  }

  function stopObserving() {
    if (observer) {
      observer.disconnect();
      observer = null;
      devLog('Observer', 'stopped', '', 'observer-status');
    }
  }

  // -------------------------------------------------------
  // User interaction tracking
  // -------------------------------------------------------
  function trackUserInteractions() {
    document.addEventListener('click', onUserInteract, true);
    document.addEventListener('focus', onUserInteract, true);
    document.addEventListener('keydown', onUserKeydown, true);
  }

  function untrackUserInteractions() {
    document.removeEventListener('click', onUserInteract, true);
    document.removeEventListener('focus', onUserInteract, true);
    document.removeEventListener('keydown', onUserKeydown, true);
    userInteractedNodes.clear();
  }

  function onUserInteract(e) {
    if (e.target && e.target !== sidebarFrame) {
      userInteractedNodes.add(e.target);
      // Also add text node children
      if (e.target.childNodes) {
        for (const child of e.target.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            userInteractedNodes.add(child);
          }
        }
      }
    }
  }

  function onUserKeydown(e) {
    const sel = window.getSelection();
    if (sel && sel.anchorNode) {
      userInteractedNodes.add(sel.anchorNode);
      if (sel.anchorNode.parentElement) {
        userInteractedNodes.add(sel.anchorNode.parentElement);
      }
    }
  }

  // -------------------------------------------------------
  // Paste interception (force plain text)
  // -------------------------------------------------------
  function interceptPaste() {
    document.addEventListener('paste', onPaste, true);
  }

  function uninterceptPaste() {
    document.removeEventListener('paste', onPaste, true);
  }

  function onPaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));

    // Collapse cursor to end of pasted text
    selection.collapseToEnd();
  }

  // -------------------------------------------------------
  // Edit session
  // -------------------------------------------------------
  async function startEditSession() {
    try {
      devLog('Fetch', 'requesting...', '');

      // Step 1: Fetch source from GitHub
      const result = await fetchFromGitHub();
      sourceContent = result.content;
      sourceSHA = result.sha;

      devLog('SHA', result.sha.substring(0, 7), 'success');
      devLog('File size', `${result.size} bytes`, 'success');

      // Step 2: Parse source DOM
      const parser = new DOMParser();
      sourceDOM = parser.parseFromString(sourceContent, 'text/html');

      const nodeCount = sourceDOM.body.querySelectorAll('*').length;
      devLog('Parse', `${nodeCount} elements`, 'success');

      // Step 3: Build text node map
      buildTextNodeMap(document.body, sourceContent);

      // Step 4: Set up interaction tracking and paste interception
      trackUserInteractions();
      interceptPaste();

      // Step 5: Start observing
      startObserving();

      // Step 6: Enable design mode
      document.designMode = 'on';
      document.documentElement.classList.add('blip-editing');
      isEditing = true;

      devLog('Mode', 'designMode ON', 'success', 'edit-mode');
      sendToSidebar('editStarted');

    } catch (err) {
      devLog('Error', err.message, 'error');
      sendToSidebar('error', { message: `Failed to start: ${err.message}` });
    }
  }

  // -------------------------------------------------------
  // Save
  // -------------------------------------------------------
  async function saveEdits() {
    if (!isEditing || !sourceContent) return;

    try {
      // Flush any pending observer records
      if (observer) {
        const pending = observer.takeRecords();
        for (const mutation of pending) {
          if (mutation.type !== 'characterData') continue;
          const target = mutation.target;
          const mapping = textNodeMap.find(m => m.liveNode === target);
          if (!mapping) continue;
          const existing = mutations.find(m => m.liveNode === target);
          if (existing) {
            existing.newText = target.textContent;
          } else {
            mutations.push({
              liveNode: target,
              originalText: mapping.originalText,
              newText: target.textContent,
              sourceOffset: mapping.sourceOffset,
              sourceLength: mapping.sourceLength
            });
          }
        }
      }

      // Filter to only actual changes
      const actualChanges = mutations.filter(m => m.newText !== m.originalText);

      devLog('Changes', `${actualChanges.length} edit${actualChanges.length !== 1 ? 's' : ''}`, 'success');

      if (actualChanges.length === 0) {
        sendToSidebar('error', { message: 'No changes detected' });
        return;
      }

      // Log each changed node as a CSS selector
      for (const change of actualChanges) {
        const selector = getCssSelector(change.liveNode);
        const preview = change.newText.length > 25
          ? change.newText.substring(0, 25) + '…'
          : change.newText;
        devLog('Edited', `${selector}`, 'success');
      }

      // Apply changes to source (reverse offset order to preserve positions)
      let newContent = sourceContent;
      const sorted = actualChanges.sort((a, b) => b.sourceOffset - a.sourceOffset);

      for (const change of sorted) {
        const before = newContent.substring(0, change.sourceOffset);
        const after = newContent.substring(change.sourceOffset + change.sourceLength);
        newContent = before + change.newText + after;
      }

      devLog('Commit', 'pushing...', '', 'commit-status');

      // Commit to GitHub
      const result = await commitToGitHub(newContent, sourceSHA);

      // Update local SHA for subsequent edits
      sourceSHA = result.sha;
      sourceContent = newContent;

      devLog('Commit', result.commitSha.substring(0, 7), 'success', 'commit-status');
      devLog('File SHA', result.sha.substring(0, 7), 'success');

      // Rebuild the map with new content (silently — no duplicate "Mapped nodes" entry)
      buildTextNodeMap(document.body, sourceContent, true);

      // Exit edit mode
      exitEditMode();
      sendToSidebar('saved');

    } catch (err) {
      devLog('Error', err.message, 'error');
      sendToSidebar('error', { message: `Save failed: ${err.message}` });
      // Don't exit edit mode on error - user's changes are still in the DOM
    }
  }

  // -------------------------------------------------------
  // Cancel
  // -------------------------------------------------------
  function cancelEdits() {
    if (!isEditing) return;

    // Restore original text content from our map
    for (const mapping of textNodeMap) {
      if (mapping.liveNode && mapping.liveNode.textContent !== mapping.originalText) {
        mapping.liveNode.textContent = mapping.originalText;
      }
    }

    exitEditMode();
    sendToSidebar('cancelled');
  }

  // -------------------------------------------------------
  // Exit edit mode (shared cleanup)
  // -------------------------------------------------------
  function getCssSelector(node) {
    // Build a CSS-selector-like path for a text node's parent element
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!el) return '?';
    const parts = [];
    let current = el;
    while (current && current !== document.body) {
      let segment = current.tagName.toLowerCase();
      if (current.id) {
        segment += '#' + current.id;
        parts.unshift(segment);
        break; // ID is unique enough
      }
      const siblings = current.parentElement
        ? Array.from(current.parentElement.children).filter(c => c.tagName === current.tagName)
        : [];
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        segment += `:nth-of-type(${idx})`;
      }
      parts.unshift(segment);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  function exitEditMode() {
    document.designMode = 'off';
    document.documentElement.classList.remove('blip-editing');
    isEditing = false;
    devLog('Mode', 'designMode OFF', '', 'edit-mode');
    mutations = [];
    stopObserving();
    untrackUserInteractions();
    uninterceptPaste();
  }

  // -------------------------------------------------------
  // Initialize
  // -------------------------------------------------------
  function init() {
    // Only inject on matching sites
    const currentHost = window.location.hostname.replace('www.', '');
    if (!currentHost.includes(BLIP_CONFIG.site.url)) return;

    injectSidebar();
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
