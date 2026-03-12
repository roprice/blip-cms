'use strict';
// File resolution: URL path → repo file, and site config loading from storage

function resolveFilePath(pathname, files) {
    let path = pathname.replace(/^\/+|\/+$/g, '');
    if (!path || path === '') {
        const indexFile = files.find(f => f.name === 'index.html');
        return indexFile ? indexFile.path : null;
    }
    path = path.split('#')[0].split('?')[0];

    const exactMatch = files.find(f => f.path === path || f.name === path);
    if (exactMatch) return exactMatch.path;

    for (const ext of BLIP_CONFIG.files.editableExtensions) {
        const withExt = path + ext;
        const match = files.find(f => f.path === withExt || f.name === withExt);
        if (match) return match.path;
    }

    const lastSegment = path.split('/').pop();
    if (lastSegment !== path) {
        for (const ext of BLIP_CONFIG.files.editableExtensions) {
            const withExt = lastSegment + ext;
            const match = files.find(f => f.name === withExt);
            if (match) return match.path;
        }
    }

    return null;
}

function filterEditableFiles(files) {
    return files.filter(f => {
        const hasEditableExt = BLIP_CONFIG.files.editableExtensions.some(ext =>
            f.name.toLowerCase().endsWith(ext)
        );
        if (!hasEditableExt) return false;
        if (BLIP_CONFIG.files.excludePatterns) {
            const excluded = BLIP_CONFIG.files.excludePatterns.some(pattern =>
                f.name.toLowerCase().includes(pattern.toLowerCase())
            );
            if (excluded) return false;
        }
        return true;
    });
}

async function loadSiteConfig(currentHost) {
    try {
        const result = await new Promise((resolve) => {
            chrome.storage.local.get(['blipSites'], resolve);
        });
        const sites = result.blipSites || [];
        const match = sites.find(s =>
            currentHost.includes(s.siteUrl) || s.siteUrl.includes(currentHost)
        );
        if (match) {
            githubConfig = {
                owner: match.owner,
                repo: match.repo,
                branch: match.branch || 'main',
                token: match.token,
                siteUrl: match.siteUrl
            };
            resolveAndPrefetch();
        } else {
            sendToSidebar('noSiteConfig');
        }
    } catch (err) {
        sendToSidebar('noSiteConfig');
    }
}