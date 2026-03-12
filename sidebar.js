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

// -------------------------------------------------------
// View elements
// -------------------------------------------------------
const collapsedView = document.getElementById('collapsedView');
const expandedView = document.getElementById('expandedView');
const blipTab = document.getElementById('blipTab');

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
    // All other actions delegate directly to content.js
    sendToContent(action);
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
    sendToContent('save');
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
}

// -------------------------------------------------------
// Tab state management
// -------------------------------------------------------
let tabContractTimer = null;

function setTabState(state) {
    // Remove all state classes
    blipTab.className = 'blip-tab tab-state-' + state;

    // Auto-contract after "saved" state
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
// File list
// -------------------------------------------------------
function updateFileList(resolvedFile, editableFiles) {
    if (!fileList || !editableFiles) return;

    const sorted = [...editableFiles].sort((a, b) => a.localeCompare(b));

    fileList.innerHTML = sorted.map(fileName => {
        const isActive = fileName === resolvedFile;
        return `<div class="file-item ${isActive ? 'active' : ''}">
            <span class="file-dot"></span>
            <span class="file-name">${escapeHtml(fileName)}</span>
        </div>`;
    }).join('');

    if (!resolvedFile) {
        editBtn.disabled = true;
    } else {
        editBtn.disabled = false;
    }
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
        // View toggling
        case 'collapse':
            showCollapsedView();
            break;

        case 'expand':
            showExpandedView();
            break;

        // Tab state (from content.js state transitions)
        case 'tabState':
            setTabState(msg.state);
            break;

        // Editing flow
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

        // Error handling
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

        // File info
        case 'fileInfo':
            updateFileList(msg.resolvedFile, msg.editableFiles);
            break;

        // Dev logging
        case 'devLog':
            devLogEntry(msg.label, msg.value, msg.status || '', msg.entryId || null);
            break;

        case 'devSeparator':
            devLogSeparator();
            break;
    }
});

// Tell the content script we're ready
sendToContent('ready');
