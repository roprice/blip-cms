// Sidebar script - communicates with content script via postMessage

const editBtn = document.getElementById('editBtn');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const closeBtn = document.getElementById('closeBtn');
const defaultState = document.getElementById('defaultState');
const editingState = document.getElementById('editingState');
const notifications = document.getElementById('notifications');
const devLog = document.getElementById('devLog');
const devPanel = document.getElementById('devPanel');
const devToggle = document.getElementById('devToggle');

devToggle.addEventListener('click', () => {
    devPanel.classList.toggle('collapsed');
});

function sendToContent(action, data = {}) {
    window.parent.postMessage({ source: 'blip-sidebar', action, ...data }, '*');
}

editBtn.addEventListener('click', () => {
    sendToContent('startEdit');
});

saveBtn.addEventListener('click', () => {
    sendToContent('save');
});

cancelBtn.addEventListener('click', () => {
    sendToContent('cancel');
});

closeBtn.addEventListener('click', () => {
    sendToContent('closeSidebar');
});

// State transitions
function showEditing() {
    defaultState.classList.add('hidden');
    editingState.classList.remove('hidden');
    clearNotifications();
}

function showDefault() {
    editingState.classList.add('hidden');
    defaultState.classList.remove('hidden');
}

function showNotification(message, type = 'success') {
    const div = document.createElement('div');
    div.className = `notification ${type}`;
    div.textContent = message;
    notifications.appendChild(div);

    if (type === 'success') {
        setTimeout(() => div.remove(), 4000);
    }
}

function clearNotifications() {
    notifications.innerHTML = '';
}

// Dev logging
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

// Listen for messages from content script
window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.source !== 'blip-content') return;

    switch (msg.action) {
        case 'editStarted':
            showEditing();
            break;

        case 'saved':
            showDefault();
            showNotification('Saved');
            break;

        case 'cancelled':
            showDefault();
            break;

        case 'error':
            showNotification(msg.message || 'Something went wrong', 'error');
            break;

        case 'devLog':
            devLogEntry(msg.label, msg.value, msg.status || '', msg.entryId || null);
            break;
    }
});

// Tell the content script we're ready to receive messages
sendToContent('ready');
