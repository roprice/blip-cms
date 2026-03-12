'use strict';
// HTML validation and LLM repair safety net via Groq

function validateHTML(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const errors = doc.querySelectorAll('parsererror');
    const corruptionPatterns = [
        /[^<]\/(h[1-6]|p|div|span|strong|em|a|ul|ol|li|section|article|header|footer|nav|main|aside)>/i,
        /<(h[1-6]|p|div|span|strong|em)[^>]*>[^<]*<\/(?!\1)[^>]*>/i
    ];
    let hasCorruption = false;
    for (const pattern of corruptionPatterns) {
        if (pattern.test(htmlString)) { hasCorruption = true; break; }
    }
    return { valid: errors.length === 0 && !hasCorruption, errorCount: errors.length, hasCorruption };
}

async function llmRepair(originalSource, corruptedSource, parentChanges) {
    const changedRegions = parentChanges.map(change => ({
        selector: getCssSelector(change.liveParent),
        originalFragment: change.originalInnerHTML,
        newFragment: change.newInnerHTML
    }));

    const systemPrompt = 'You are an automated HTML syntax checker. Fix broken HTML syntax only. Preserve all intended content changes. Output ONLY raw corrected HTML. No explanations or markdown.';
    const userPrompt = `Original HTML fragments and their edited versions are below. Fix ONLY the syntax errors. Preserve ALL intended text content changes.\n\n${changedRegions.map((r, i) =>
        `Fragment ${i + 1} (${r.selector}):\nOriginal: ${r.originalFragment}\nEdited: ${r.newFragment}`
    ).join('\n\n')
        }\n\nOutput ONLY the corrected edited fragments, separated by ---FRAGMENT--- markers. No explanations.`;

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { type: 'LLM_REPAIR', llmConfig: BLIP_CONFIG.llm, systemPrompt, userPrompt },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (!response.success) {
                    reject(new Error(response.error));
                } else {
                    const repairedFragments = response.data.content.split('---FRAGMENT---').map(f => f.trim());
                    let repairedSource = corruptedSource;
                    for (let i = 0; i < parentChanges.length && i < repairedFragments.length; i++) {
                        if (repairedFragments[i]) {
                            repairedSource = repairedSource.replace(parentChanges[i].newInnerHTML, repairedFragments[i]);
                        }
                    }
                    if (response.data.usage) {
                        devLog('LLM tokens', `${response.data.usage.prompt_tokens} in, ${response.data.usage.completion_tokens} out`, '');
                    }
                    resolve(repairedSource);
                }
            }
        );
    });
}