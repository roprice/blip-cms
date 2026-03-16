// Sidebar script
// Manages both collapsed (tab widget) and expanded (full sidebar) views

// -------------------------------------------------------
// Expanded view elements
// -------------------------------------------------------
const editBtn = document.getElementById('editBtn');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const closeBtn = document.getElementById('closeBtn');
const defaultState = document.getElementById('defaultState');
const editingState = document.getElementById('editingState');
const savingState = document.getElementById('savingState');
const fileList = document.getElementById('fileList');
const notifications = document.getElementById('notifications');
const devLog = document.getElementById('devLog');
const devPanel = document.getElementById('devPanel');
const devToggle = document.getElementById('devToggle');
const configPanel = document.getElementById('configPanel');
const configToggle = document.getElementById('configToggle');
const configBody = document.getElementById('configBody');
const addSiteBtn = document.getElementById('addSiteBtn');
const addSiteForm = document.getElementById('addSiteForm');
const siteForm = document.getElementById('siteForm');
const cancelAddSite = document.getElementById('cancelAddSite');
const savedSitesList = document.getElementById('savedSitesList');

// Save-to and edit history elements
const saveToRepo = document.getElementById('saveToRepo');
const saveToCheckbox = document.getElementById('saveToCheckbox');
const saveToSiteName = document.getElementById('saveToSiteName');
const saveToPrompt = document.getElementById('saveToPrompt');
const promptSiteName = document.getElementById('promptSiteName');
const editsTextarea = document.getElementById('editsTextarea');
const copyEditsBtn = document.getElementById('copyEditsBtn');

// Track whether current site has a working repo connection
let siteConnected = false;

// -------------------------------------------------------
// View elements
// -------------------------------------------------------
const collapsedView = document.getElementById('collapsedView');
const expandedView = document.getElementById('expandedView');
const blipTab = document.getElementById('blipTab');



// License panel elements
const licensePanel = document.getElementById('licensePanel');
const unlicensedState = document.getElementById('unlicensedState');
const memberState = document.getElementById('memberState');
const vipState = document.getElementById('vipState');
const licenseActiveBadge = document.getElementById('licenseActiveBadge');
const licenseKeyInput = document.getElementById('licenseKeyInput');
const activateBtn = document.getElementById('activateBtn');
const activateError = document.getElementById('activateError');
const maskedKeyDisplay = document.getElementById('maskedKeyDisplay');

// -------------------------------------------------------
// Communication with content script
// -------------------------------------------------------
function sendToContent(action, data = {}) {
    window.parent.postMessage({ source: 'blip-sidebar', action, ...data }, '*');
}

// -------------------------------------------------------
// Collapsed view: tab widget click handling
// -------------------------------------------------------
blipTab.addEventListener('click', (e) => {
    const action = e.target.dataset?.action;
    if (!action) return;
    if (action === 'expandSidebar') {
        sendToContent('expandSidebar');
        return;
    }
    sendToContent(action);
});

// In sidebar.js
blipTab.addEventListener('mousedown', (e) => {
    // Only initiate drag on the tab-name area, not controls
    if (e.target.dataset?.action) return;

    // Tell the main page to start dragging the iframe
    window.parent.postMessage({
        source: 'blip-sidebar',
        action: 'dragStart',
        offsetY: e.clientY
    }, '*');

    e.preventDefault();
});
// -------------------------------------------------------
// Expanded view: button handlers
// -------------------------------------------------------
editBtn.addEventListener('click', () => {
    editBtn.disabled = true;
    editBtn.textContent = 'Loading...';
    sendToContent('startEdit');
});

saveBtn.addEventListener('click', () => {
    showSaving();
    // Tell content.js whether to commit to GitHub or just capture the diff
    const commitToRepo = siteConnected && saveToCheckbox.checked;
    sendToContent('save', { commitToRepo });
});

cancelBtn.addEventListener('click', () => {
    sendToContent('cancel');
});

closeBtn.addEventListener('click', () => {
    sendToContent('closeSidebar');
});

devToggle.addEventListener('click', () => {
    devPanel.classList.toggle('collapsed');
});

configToggle.addEventListener('click', () => {
    configPanel.classList.toggle('collapsed');
});

// -------------------------------------------------------
// Edit history: copy button
// -------------------------------------------------------
copyEditsBtn.addEventListener('click', () => {
    const text = editsTextarea.value;
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
        // Brief visual feedback
        copyEditsBtn.textContent = 'check';
        copyEditsBtn.classList.add('copied');
        setTimeout(() => {
            copyEditsBtn.textContent = 'content_copy';
            copyEditsBtn.classList.remove('copied');
        }, 1500);
    }).catch(() => {
        // Fallback: select the textarea for manual copy
        editsTextarea.select();
    });
});


// -------------------------------------------------------
// Edit history: prepend a diff entry to the textarea
// -------------------------------------------------------
function appendDiffEntry(diffText) {
    const current = editsTextarea.value;

    // Prepend the new text
    if (current) {
        editsTextarea.value = diffText + '\n\n' + current;
    } else {
        editsTextarea.value = diffText;
    }

    // Auto-expand and scroll
    editsTextarea.style.height = 'auto';
    editsTextarea.style.height = Math.min(editsTextarea.scrollHeight, 500) + 'px';
    editsTextarea.scrollTop = 0;

    // Save to local storage
    chrome.storage.local.set({ blipEditHistory: editsTextarea.value });
}

// -------------------------------------------------------
// Collapsible file site groups: delegated click handler
// -------------------------------------------------------
fileList.addEventListener('click', (e) => {
    const header = e.target.closest('.file-site-header');
    if (!header) return;
    const website = header.closest('.file-website');
    if (website) website.classList.toggle('collapsed');
});

// -------------------------------------------------------
// Config: add site form
// -------------------------------------------------------
addSiteBtn.addEventListener('click', () => {
    addSiteForm.classList.remove('hidden');
    addSiteBtn.classList.add('hidden');
});

cancelAddSite.addEventListener('click', () => {
    addSiteForm.classList.add('hidden');
    addSiteBtn.classList.remove('hidden');
    siteForm.reset();
});

siteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const siteUrl = document.getElementById('fieldSiteUrl').value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const owner = document.getElementById('fieldOwner').value.trim();
    const repo = document.getElementById('fieldRepo').value.trim();
    const branch = document.getElementById('fieldBranch').value.trim() || 'main';
    const token = document.getElementById('fieldToken').value.trim();

    if (!siteUrl || !owner || !repo || !token) return;

    const result = await new Promise((resolve) => {
        chrome.storage.local.get(['blipSites'], resolve);
    });

    const sites = result.blipSites || [];
    const existingIndex = sites.findIndex(s => s.siteUrl === siteUrl);
    const newSite = { siteUrl, owner, repo, branch, token };

    if (existingIndex >= 0) {
        sites[existingIndex] = newSite;
    } else {
        sites.push(newSite);
    }

    await new Promise((resolve) => {
        chrome.storage.local.set({ blipSites: sites }, resolve);
    });

    siteForm.reset();
    addSiteForm.classList.add('hidden');
    addSiteBtn.classList.remove('hidden');
    renderSavedSites(sites);
});

async function renderSavedSites(sites) {
    if (!sites) {
        const result = await new Promise((resolve) => {
            chrome.storage.local.get(['blipSites'], resolve);
        });
        sites = result.blipSites || [];
    }

    if (sites.length === 0) {
        savedSitesList.innerHTML = '<p class="config-empty">No sites configured yet.</p>';
        return;
    }

    savedSitesList.innerHTML = sites.map((s, i) => `
    <div class="config-site-item">
      <span class="config-site-url">${escapeHtml(s.siteUrl)}</span>
      <span class="config-site-meta">${escapeHtml(s.owner)}/${escapeHtml(s.repo)} · ${escapeHtml(s.branch)}</span>
      <button class="config-delete-btn" data-index="${i}">Remove</button>
    </div>
  `).join('');

    savedSitesList.querySelectorAll('.config-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const index = parseInt(btn.dataset.index);
            sites.splice(index, 1);
            await new Promise((resolve) => {
                chrome.storage.local.set({ blipSites: sites }, resolve);
            });
            renderSavedSites(sites);
        });
    });
}

// -------------------------------------------------------
// View toggling
// -------------------------------------------------------
function showCollapsedView() {
    document.body.classList.remove('sidebar-expanded');
    collapsedView.classList.remove('hidden');
    expandedView.classList.add('hidden');
}

function showExpandedView() {
    document.body.classList.add('sidebar-expanded');
    expandedView.classList.remove('hidden');
    collapsedView.classList.add('hidden');

    // Recalculate text area height after the sidebar paints
    setTimeout(() => {
        if (editsTextarea && editsTextarea.value) {
            editsTextarea.style.height = 'auto';
            editsTextarea.style.height = Math.min(editsTextarea.scrollHeight, 500) + 'px';
        }
    }, 50);
}

// -------------------------------------------------------
// Tab state management
// -------------------------------------------------------
let tabContractTimer = null;

function setTabState(state) {
    blipTab.className = 'blip-tab tab-state-' + state;
    if (state === 'saved') {
        if (tabContractTimer) clearTimeout(tabContractTimer);
        tabContractTimer = setTimeout(() => {
            setTabState('default');
            tabContractTimer = null;
        }, 1500);
    }
}

// -------------------------------------------------------
// Expanded view: state transitions
// -------------------------------------------------------
function showEditing() {
    defaultState.classList.add('hidden');
    savingState.classList.add('hidden');
    editingState.classList.remove('hidden');
    saveBtn.disabled = true;
    cancelBtn.disabled = false;
    editBtn.disabled = false;
    editBtn.textContent = 'Edit';
    clearNotifications();

    // Show appropriate save-to section based on connection status
    if (siteConnected) {
        saveToRepo.classList.remove('hidden');
        saveToPrompt.classList.add('hidden');
    } else if (currentSiteUrl) {
        saveToRepo.classList.add('hidden');
        saveToPrompt.classList.remove('hidden');
        promptSiteName.textContent = currentSiteUrl;
    } else {
        saveToRepo.classList.add('hidden');
        saveToPrompt.classList.add('hidden');
    }
}

function showSaving() {
    editingState.classList.add('hidden');
    defaultState.classList.add('hidden');
    savingState.classList.remove('hidden');
}

function showDefault() {
    editingState.classList.add('hidden');
    savingState.classList.add('hidden');
    defaultState.classList.remove('hidden');
    editBtn.disabled = false;
    editBtn.textContent = 'Edit';
    // Hide save-to sections when not editing
    saveToRepo.classList.add('hidden');
    saveToPrompt.classList.add('hidden');
}

function showSyncing(message) {
    savingState.classList.add('hidden');
    editingState.classList.add('hidden');
    defaultState.classList.add('hidden');
    showNotification(message, 'info');
}

// -------------------------------------------------------
// Notifications
// -------------------------------------------------------
function showNotification(message, type = 'success') {
    const div = document.createElement('div');
    div.className = `notification ${type}`;
    div.textContent = message;
    notifications.appendChild(div);
    if (type === 'success') {
        setTimeout(() => div.remove(), 4000);
    }
}

function showErrorWithReload(userMessage) {
    clearNotifications();
    const div = document.createElement('div');
    div.className = 'notification error';
    div.innerHTML = `
    <div style="margin-bottom: 8px;">${escapeHtml(userMessage)}</div>
    <button class="btn-reload" onclick="window.parent.postMessage({source:'blip-sidebar',action:'reloadPage'},'*')">
      Reload page and try again
    </button>
  `;
    notifications.appendChild(div);
}

function clearNotifications() {
    notifications.innerHTML = '';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// -------------------------------------------------------
// File list: collapsible site groups with connection icons
// -------------------------------------------------------
let currentSiteUrl = null;

// Store all known sites and their file lists for multi-site display
let knownSites = {};

function updateFileList(resolvedFile, editableFiles, siteUrl, connected) {
    if (!fileList || !editableFiles) return;
    if (siteUrl) currentSiteUrl = siteUrl;

    // Track connection status for the save-to checkbox
    if (connected !== undefined) siteConnected = connected;

    // Update save-to site name
    if (siteConnected && currentSiteUrl) {
        saveToSiteName.textContent = currentSiteUrl;
    }

    // Store this site's file list
    if (siteUrl) {
        knownSites[siteUrl] = {
            files: editableFiles,
            resolvedFile: resolvedFile,
            connected: connected !== false
        };
    }

    // Render all known sites
    renderAllSites();

    // Enable/disable edit button based on resolved file
    if (!resolvedFile) {
        editBtn.disabled = true;
    } else {
        editBtn.disabled = false;
    }
}

function renderAllSites() {
    let html = '';

    for (const [siteUrl, siteData] of Object.entries(knownSites)) {
        const sorted = [...siteData.files].sort((a, b) => a.localeCompare(b));
        const isConnected = siteData.connected;
        const connectionClass = isConnected ? 'connected' : 'disconnected';
        const connectionIcon = isConnected ? 'sync' : 'sync_disabled';

        // Chevron SVG for collapse toggle
        const chevron = `<span class="site-toggle">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" 
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="2,3 5,7 8,3"/>
            </svg>
        </span>`;

        html += `<div class="file-website ${connectionClass}">`;
        html += `<div class="file-site-header">
            ${escapeHtml(siteUrl)}
            <span class="connection-status"><span class="material-symbols-outlined">${connectionIcon}</span></span>
            ${chevron}
        </div>`;
        html += `<div class="file-items">`;

        for (const fileName of sorted) {
            const isActive = fileName === siteData.resolvedFile;
            html += `<div class="file-item ${isActive ? 'active' : ''}">
                <span class="file-dot"></span>
                <span class="file-name">${escapeHtml(fileName)}</span>
            </div>`;
        }

        html += `</div></div>`;
    }

    fileList.innerHTML = html;
}

// -------------------------------------------------------
// Dev logging
// -------------------------------------------------------
function devLogEntry(label, value, status = '', entryId = null) {
    if (entryId) {
        const existing = devLog.querySelector(`[data-entry-id="${entryId}"]`);
        if (existing) {
            existing.innerHTML = `<span class="label">${label}:</span> <span class="value ${status}">${value}</span>`;
            devLog.scrollTop = devLog.scrollHeight;
            return;
        }
    }
    const entry = document.createElement('div');
    entry.className = 'entry';
    if (entryId) entry.dataset.entryId = entryId;
    entry.innerHTML = `<span class="label">${label}:</span> <span class="value ${status}">${value}</span>`;
    devLog.appendChild(entry);
    devLog.scrollTop = devLog.scrollHeight;
}

function devLogSeparator() {
    const entry = document.createElement('div');
    entry.className = 'entry separator';
    entry.innerHTML = '<hr style="border: none; border-top: 1px solid rgba(0,0,0,0.06); margin: 4px 0;">';
    devLog.appendChild(entry);
    devLog.scrollTop = devLog.scrollHeight;
}

// -------------------------------------------------------
// Message handler: receive from content script
// -------------------------------------------------------
window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.source !== 'blip-content') return;

    switch (msg.action) {
        case 'collapse':
            showCollapsedView();
            break;
        case 'expand':
            showExpandedView();
            break;
        case 'tabState':
            setTabState(msg.state);
            break;
        case 'editStarted':
            showEditing();
            break;
        case 'editsDetected':
            saveBtn.disabled = false;
            break;
        case 'saved':
            showDefault();
            showNotification('Saved');
            break;
        case 'cancelled':
            showDefault();
            break;
        case 'noChanges':
            showEditing();
            showNotification('Nothing to save yet. Make some edits first.', 'info');
            break;
        case 'syncError':
            showSyncing(msg.userMessage || 'Re-syncing...');
            break;
        case 'recovered':
            showDefault();
            showNotification('Synced. Your edits were not saved, but you can try again.', 'error');
            break;
        case 'recoveryFailed':
            showDefault();
            showErrorWithReload(msg.userMessage || 'Could not sync. Please reload the page.');
            break;
        case 'error':
            showEditing();
            if (msg.recoverable) {
                showNotification(msg.userMessage || 'Something went wrong', 'error');
            } else {
                showErrorWithReload(msg.userMessage || 'Something went wrong. Try reloading the page.');
            }
            break;
        case 'fileInfo':
            // connected flag: true if repo is reachable and file resolved
            updateFileList(msg.resolvedFile, msg.editableFiles, msg.siteUrl, msg.connected);
            break;
        case 'noSiteConfig':
            editBtn.disabled = true;
            siteConnected = false;
            currentSiteUrl = window.location ? window.location.hostname : null;
            fileList.innerHTML = '<p class="file-list-hint">Connect a GitHub repo in Settings to enable saving.</p>';
            configPanel.classList.remove('collapsed');
            break;
        case 'diffEntry':
            // Append formatted diff text to the edits textarea
            appendDiffEntry(msg.diffText);
            break;
        case 'devLog':
            devLogEntry(msg.label, msg.value, msg.status || '', msg.entryId || null);
            break;
        case 'devSeparator':
            devLogSeparator();
            break;
    }
});



// -------------------------------------------------------
// License panel: set UI state based on stored membership
// -------------------------------------------------------
function setLicenseState(membership, licenseKey) {
    // Hide all states first
    unlicensedState.classList.add('hidden');
    memberState.classList.add('hidden');
    vipState.classList.add('hidden');

    if (membership && membership.foundingVIP) {
        // VIP: collapsed panel, just show the active badge
        licenseActiveBadge.classList.remove('hidden');
        vipState.classList.remove('hidden');
        configPanel.style.display = 'flex';

    } else if (membership && membership.foundingMember) {
        // Member: show key (masked), upgrade button
        licenseActiveBadge.classList.remove('hidden');
        memberState.classList.remove('hidden');
        if (licenseKey) {
            // Show first 8 chars then mask the rest
            maskedKeyDisplay.textContent = licenseKey.substring(0, 8) + '••••••••••••••••••••';
        }
        configPanel.style.display = 'flex';

    } else {
        // Unlicensed: show buy + activate
        unlicensedState.classList.remove('hidden');
    }
}


// -------------------------------------------------------
// License activation
// -------------------------------------------------------
activateBtn.addEventListener('click', async () => {
    const key = licenseKeyInput.value.trim();
    if (!key) return;

    activateBtn.disabled = true;
    activateBtn.textContent = 'Checking...';
    activateError.classList.add('hidden');

    try {
        const res = await fetch('https://my.remaphq.com/webhook/validate-blip-license', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key })
        });
        const data = await res.json();

        if (data.valid) {
            // Write tier and key to storage
            const membership = { [data.tier]: true };
            chrome.storage.local.set({ blipMembership: membership, blipLicenseKey: key });
            setLicenseState(membership, key);
        } else {
            activateError.classList.remove('hidden');
        }
    } catch (err) {
        activateError.textContent = 'Could not connect. Check your internet and try again.';
        activateError.classList.remove('hidden');
    }

    activateBtn.disabled = false;
    activateBtn.textContent = 'Activate';
});



// Init: load saved sites into config panel
renderSavedSites();

// Load persisted edit history
chrome.storage.local.get(['blipEditHistory'], (result) => {
    if (result.blipEditHistory) {
        editsTextarea.value = result.blipEditHistory;

        // Wait a tick for the DOM to paint before calculating scrollHeight
        setTimeout(() => {
            editsTextarea.style.height = 'auto';
            editsTextarea.style.height = Math.min(editsTextarea.scrollHeight, 500) + 'px';
            editsTextarea.scrollTop = 0;
        }, 50);
    }
});


const clearHistoryBtn = document.getElementById('clear-history-btn');
if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
        editsTextarea.value = '';
        editsTextarea.style.height = 'auto';
        chrome.storage.local.remove('blipEditHistory');
    });
}


// Load license state on init
chrome.storage.local.get(['blipMembership', 'blipLicenseKey'], (result) => {
    setLicenseState(result.blipMembership || null, result.blipLicenseKey || null);
});

document.getElementById('licenseToggle').addEventListener('click', () => {
    document.getElementById('licensePanel').classList.toggle('collapsed');
});

// Tell the content script we're ready
sendToContent('ready');


