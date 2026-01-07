let currentDomain = '';
let currentDomainInfo = '';
let currentDomainOwner = '';
let historyStack = [];
let currentIndex = -1;
let extractedScripts = [];
const loadedScriptHashes = new Set();

// settings
let AVenabled = true;
let AVcheckenabled = true;

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const settings = await window.electronAPI.getSettings();

        AVenabled = settings?.AVenabled ?? true;
        AVcheckenabled = settings?.AVcheckenabled ?? true;

        console.log('AVenabled:', AVenabled, 'AVcheckenabled:', AVcheckenabled);

        if (AVcheckenabled && AVenabled) {
            document.querySelector('input[value="check-enabled"]').checked = true;
        } else if (!AVcheckenabled && AVenabled) {
            document.querySelector('input[value="check-disabled"]').checked = true;
        } else if (AVcheckenabled && !AVenabled) {
            document.querySelector('input[value="no-av"]').checked = true;
        }

    } catch (err) {
        console.error('Failed to load settings, defaulting to true', err);
        AVenabled = true;
        AVcheckenabled = true;
    }
});


const urlInput = document.getElementById('URL');
const iframe = document.getElementById('sandboxed-frame');
iframe.contentWindow.top = null;
const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

// goob:domainsearch
/*
let cachedDomains = null;

async function GOOBdomainsearch() {
    if (cachedDomains) return cachedDomains;

    const response = await fetch('https://dragonie.fun/dns/domains.json');
    if (!response.ok) throw new Error('Failed to fetch domains');

    const data = await response.json();
    cachedDomains = data;
    return data;
}
*/



async function displayContextError(error) {
    const html = await fetch("./abouterror.html").then(r => r.text());

    iframeDoc.open();
    iframeDoc.write(html.replace("{{error}}", error));
    iframeDoc.close();

    updateProgress(1, "Done");
}

function errorLog(error) {
    window.electronAPI.errorNotify(error);
}

function updateProgress(value, task) {
    const bar = document.getElementById("progress-bar");
    const section = document.getElementById("loadingtask");

    bar.style.display = "block";
    section.innerText = task;

    bar.style.width = (value * 100) + "%";

    if (value <= 0 || value >= 1) {
        window.electronAPI.setProgress(-1);
    } else {
        window.electronAPI.setProgress(value);
    }

    if (value === 1) {
        bar.style.display = "none";
    }
}

function scrollstyle(doc) {
    if (!doc.getElementById('custom-scrollbar-style')) {
        const style = doc.createElement('style');
        style.id = 'custom-scrollbar-style';
        style.textContent = `
                ::-webkit-scrollbar {
    width: 14px; 
    height: 14px; 
}

::-webkit-scrollbar-track {
    background: #c7c6c6; 
}

::-webkit-scrollbar-thumb {
    background-color: rgb(194, 193, 193); 
    border: 2px outset gray;
}

::-webkit-scrollbar-thumb:hover {
    background-color: rgb(143, 143, 143);
}

::-webkit-scrollbar-corner {
    background: #c7c6c6;
}`;
        doc.head.appendChild(style);
    }
}

async function AVCHECK(src, domain) {
    try {
        const url = new URL(src);

        if (domain === "goob://") return true;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const response = await fetch(url.href, {
            method: 'HEAD',
            signal: controller.signal
        });

        clearTimeout(timeout);
        if (!response.ok) return false;

        const size = parseInt(response.headers.get('content-length') || '0', 10);
        const maxSize = 50 * 1024 * 1024; // 50 megs
        if (size > maxSize || size === 0) return false;

        const type = (response.headers.get('content-type') || "").toLowerCase();

        const allowedTypes = [
            "audio/",
            "video/",
            "image/",
            "application/ogg",
            "application/mp4"
        ];

        const isAllowed = allowedTypes.some(prefix => type.startsWith(prefix));
        if (!isAllowed) return false;

        return true;
    } catch {
        return false;
    }
}

function ADDHISTORICAL(url) {
    historyStack = historyStack.slice(0, currentIndex + 1);
    historyStack.push(url);
    currentIndex = historyStack.length - 1;
}

// AV checker
async function AVinspection(doc, domain) {
    const mediaElements = doc.querySelectorAll('audio, video');
    for (const media of mediaElements) {
        const sources = media.querySelectorAll('source');

        for (const source of sources) {
            if (AVenabled) {
                if (!(await AVCHECK(source.src, domain))) {
                    source.remove();
                    console.warn('Source denied:', source.src);
                }
            } else {
                console.warn('AV is disabled, so source was removed:', source.src);
                source.remove();
            }
        }

        if (AVenabled) {
            if (media.src && !(await AVCHECK(media.src))) {
                media.remove();
                console.warn('Media denied:', media.src);
            }

            if (!media.querySelectorAll('source').length && !media.src) {
                media.remove();
            }
        } else {
            console.warn('AV is disabled, so media was removed:', media.src);
            media.remove();
        }
    }
    const images = doc.querySelectorAll('img');
    for (const img of images) {
        if (AVenabled) {
            if (!(await AVCHECK(img.src, domain))) {
                img.remove();
                console.warn('Image denied:', img.src);
            }
        } else {
            img.remove();
            console.warn('AV is disabled, so image was removed:', img.src);
        }
    }
}

async function DOMAINRENDERER(url, addToHistory = true) {
    try {
        currentDomainInfo = '';
        extractedScripts = [];
        loadedScriptHashes.clear();
        updateProgress(0.05, "Searching");

        if (url.length > 300) {
            url = url.slice(0, 300);
            urlInput.value = url;
            errorLog('URL is too long so it was cut down, this might cause the page to miss some information');
        }

        currentDomain = url;
        document.getElementById('domainico').textContent = "dns";
        document.getElementById('domainico').style.color = "black";

        const cleanURL = url.split('?')[0];
        const dnsResult = await window.electronAPI.fetchDNS(cleanURL);

        const domainData = dnsResult.domain ? dnsResult.domain : dnsResult;
        const domainOwnerData = dnsResult.owner ? dnsResult.owner : dnsResult;

        if (dnsResult.type === 'notfound') {
            ADDHISTORICAL(url);
            displayContextError(`The domain ${dnsResult.domain} was not found`)
            return;
        }

        if (dnsResult.type === 'error') {
            updateProgress(1, "DNS result error");
            ADDHISTORICAL(url);
            errorLog("DNS error: " + dnsResult.message);
            return;
        }

        if (!domainData.address || typeof domainData.address !== "string") {
            ADDHISTORICAL(url);
            throw new Error("Domain not found in this DNS server");
        }

        updateProgress(0.25, "DNS OK");

        currentDomainInfo = domainData;
        currentDomainOwner = domainOwnerData;

        function paramaters(url) {
            const u = new URL(url.replace(/^goob:\/\//, 'http://dummy'));
            const params = {};
            u.searchParams.forEach((v, k) => {
                params[k] = v;
            });
            return params;
        }

        const params = paramaters(url);

        const paramString = new URLSearchParams(params).toString();
        const fetchURL = domainData.address + (paramString ? '?' + paramString + '&' : '?') + 't=' + Date.now();

        const response = await fetch(fetchURL + `?t=${Date.now()}`)
            .catch(err => {
                ADDHISTORICAL(url);
                errorLog(`Response error: ${err.message}`);
                throw err;
            });

        if (!response.ok) {
            ADDHISTORICAL(url);
            displayContextError(`The external service provider responded with: ${response.status}`)
            return;
        }

        const dnsProvider = await window.electronAPI.getCurrentDNS();
        if (dnsResult.verified === true && dnsProvider === "https://dragonie.fun/dns/dns.php") {
            document.getElementById('domainico').textContent = "priority";
            document.getElementById('domainico').style.color = "green";
        } else if (dnsResult.verified === true) {
            document.getElementById('domainico').textContent = "priority";
            document.getElementById('domainico').style.color = "orange";
        } else {
            document.getElementById('domainico').textContent = "dns";
            document.getElementById('domainico').style.color = "black";
        }

        let html = await response.text();

        updateProgress(0.55, "Collecting data");

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // page titles
        const pageTitle = doc.querySelector('title')?.textContent || "Untitled Document";
        document.getElementById('page-title').textContent = pageTitle + " - GoobScape";
        document.title = pageTitle + " - GoobScape";

        if (AVcheckenabled) {
            updateProgress(0.6, "Checking AV");
            await AVinspection(doc, url);
        }

        doc.querySelectorAll("script").forEach(script => {
            extractedScripts.push(script.textContent);
            script.remove();
        });
        loadedScriptHashes.clear();
        updateProgress(0.63, "Reading scripts");

        if (AVcheckenabled) {
            html = DOMPurify.sanitize(doc.documentElement.outerHTML, {
                ALLOWED_TAGS: [
                    'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img',
                    'br', 'strong', 'em', 'b', 'i', 'u', 'table', 'tr', 'td', 'th', 'thead', 'tbody',
                    'tfoot', 'style', 'audio', 'video', 'source', 'form', 'input', 'hr', 'button'
                ],
                ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'style', 'controls', 'autoplay',
                    'loop', 'muted', 'type', 'action', 'name', 'id', 'class', 'placeholder', 'value', 'colspan'],
                ALLOW_UNKNOWN_PROTOCOLS: true,
                FORCE_BODY: true,
                FORBID_ATTR: ['on*'],
                FORBID_TAGS: ['iframe', 'object', 'embed']
            });
        }

        updateProgress(0.75, "Checking saved data");

        const freshVault = JSON.parse(localStorage.getItem('goob_vault') || {});
        const cleanDomain = currentDomain.split('?')[0].replace(/\/$/, "");
    
        const token = freshVault[cleanDomain];
    
        if (token) {
            iframe.contentWindow.GOOB_AUTH = {
                token,
                domain: cleanDomain
            };
            console.log("ADDED ga");
        } else {
            iframe.contentWindow.GOOB_AUTH = null;
            console.log("CLEARED ga");
        }
    
        iframe.contentWindow.postMessage({ type: 'GOOB_SYNC' }, '*');

        updateProgress(0.8, "Rendering");

        // render!!
        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();
        scrollstyle(iframeDoc);
        //console.log(html);

        // CUSTOM GOOB SUPPORTED THINGS

        // readd scripts for js allowed
        extractedScripts.forEach(code => {
            if (/cdn-cgi\/challenge-platform/.test(code)) return;

            const hash = code.trim();
            if (loadedScriptHashes.has(hash)) return;

            const script = iframeDoc.createElement("script");
            script.textContent = `(function() { ${code} })();`;
            iframeDoc.body.appendChild(script);

            loadedScriptHashes.add(hash);
        });

        // allow goob links ONLY
        iframeDoc.addEventListener('click', (e) => {
            const a = e.target.closest('a'); // find the nearest <a> element
            if (!a) return;

            const href = a.getAttribute('href');
            if (!href) return;

            if (href.startsWith('goob://')) {
                e.preventDefault();
                DOMAINRENDERER(href);
                urlInput.value = href;
            } else {
                e.preventDefault();
                // alert('External links are blocked in this browser.');
                //a.style.color = "red";
            }
        });

        iframeDoc.querySelectorAll('[data-goob-auth]').forEach(element => {
            element.onclick = async (e) => {
                e.preventDefault();

                const authUrl = element.getAttribute('data-goob-auth');
                console.log("Opening auth for:", authUrl);

                const token = await window.electronAPI.openLoginPopup(authUrl, currentDomain);

                if (token) {
                    const cleanDomain = currentDomain.split('?')[0];

                    let allTokens = JSON.parse(localStorage.getItem('goob_vault') || '{}');
                    allTokens[cleanDomain] = token;
                    localStorage.setItem('goob_vault', JSON.stringify(allTokens));

                    iframe.contentWindow.postMessage({
                        type: 'AUTH_SUCCESS',
                        token: token,
                        domain: cleanDomain
                    }, '*');

                    //window.electronAPI.information("Login successful!");
                }
            };
        });

        // form support

        iframeDoc.querySelectorAll('form').forEach(form => {
            form.addEventListener('submit', (e) => {
                e.preventDefault();

                const formData = new FormData(form);
                const params = new URLSearchParams(formData);

                let url = form.getAttribute('action') || 'goob://';
                if (!url.startsWith('goob://')) {
                    console.warn('Blocked form submit to external URL:', url);
                    //alert('Form submission blocked: only goob:// URLs are allowed.');
                    return;
                }
                url = url.includes('?') ? url + '&' + params.toString() : url + '?' + params.toString();

                currentDomain = url;
                urlInput.value = url;

                historyStack = historyStack.slice(0, currentIndex + 1);
                historyStack.push(url);
                currentIndex = historyStack.length - 1;

                const display = iframeDoc.querySelector('#param-display');
                if (display) {
                    display.innerHTML = '';
                    for (const [key, value] of formData.entries()) {
                        const div = iframeDoc.createElement('div');
                        div.textContent = `${key}: ${value}`;
                        display.appendChild(div);
                    }
                }

                displayparams();
                //DOMAINRENDERER(url, true);
            });
        });

        // paramaters
        function displayparams() {
            const display = iframeDoc.querySelector('#param-display');
            if (!display) return;

            display.innerHTML = '';

            try {
                const url = new URL(currentDomain.replace(/^goob:\/\//, 'http://dummy'));
                url.searchParams.forEach((value, key) => {
                    const div = iframeDoc.createElement('div');
                    div.textContent = `${key}: ${value}`;
                    display.appendChild(div);
                });
            } catch (err) {
                console.error('Failed to parse URL params:', err);
            }
        }

        displayparams();


        // GOOB DOMAIN SEARCH
        /*
        iframeDoc.querySelectorAll('form[type="goob:domainsearch"]').forEach(form => {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                const query = form.querySelector('input[name="q"]')?.value.trim().toLowerCase();
                if (!query) return;

                try {
                    const data = await GOOBdomainsearch();
                    const domainEntries = Object.entries(data);

                    const results = domainEntries.filter(([domain, info]) =>
                        domain.toLowerCase().includes(query) ||
                        (info.description && info.description.toLowerCase().includes(query))
                    );

                    const resultContainer = iframeDoc.querySelector('#goob\\:domainresults');
                    if (!resultContainer) return;

                    resultContainer.innerHTML = '';

                    if (results.length === 0) {
                        resultContainer.textContent = 'No results found.';
                    } else {
                        results.forEach(([domain, info]) => {
                            const link = iframeDoc.createElement('a');

                            link.href = `goob://${domain}`;

                            link.textContent = info.description
                                ? `${domain} — ${info.description}`
                                : domain;

                            link.style.display = 'block';
                            link.style.color = 'blue';
                            link.style.cursor = 'pointer';

                            link.addEventListener('click', e => {
                                e.preventDefault();
                                urlInput.value = `goob://${domain}`;
                                currentDomain = `goob://${domain}`;
                                DOMAINRENDERER(`goob://${domain}`);
                            });

                            resultContainer.appendChild(link);
                        });
                    }

                } catch (err) {
                    console.error(err);
                }
            });
        });
    */


        const paramsd = new URL(url.replace(/^goob:\/\//, 'http://dummy')).searchParams;

        iframe.onload = () => {
            iframe.contentWindow.GOOB_PARAM = { q: paramsd.get('q') };
            if (typeof iframe.contentWindow.onGoobParamsReady === 'function') {
                iframe.contentWindow.onGoobParamsReady();
            }
        };

        if (addToHistory) {
            historyStack = historyStack.slice(0, currentIndex + 1);
            historyStack.push(url);
            currentIndex = historyStack.length - 1;
        }

        updateProgress(1, "Done");

        urlInput.focus();
        urlInput.setSelectionRange(urlInput.value.length, urlInput.value.length);
    } catch (err) {
        updateProgress(1);

        if (addToHistory) {
            historyStack = historyStack.slice(0, currentIndex + 1);
            historyStack.push(url);
            currentIndex = historyStack.length - 1;
        }

        displayContextError(`Domain / DNS ${err}`)
        return;
        //errorLog(`Domain error! ${err}`);
        //console.error(err);
        return;
    }
}


document.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    let url = document.getElementById('URL').value.trim();

    /*
    if (url === "goob://") {
        // ignore
    } else if (!/^goob:\/\/[a-z0-9.-?=]+\/?$/i.test(url)) {
        errorLog('Format denied for URL');
        return;
    }
        */

    if (url.length > 300) {
        url = url.slice(0, 300);
        urlInput.value = url;
    }

    if (!url.startsWith('goob://')) {
        url = 'goob://' + url;
        urlInput.value = url;
    }

    currentDomain = url;
    DOMAINRENDERER(url);
});


document.getElementById('refresh').addEventListener('click', () => {
    if (currentIndex < 0) return;
    DOMAINRENDERER(historyStack[currentIndex], false);
});

document.getElementById('back').addEventListener('click', () => {
    if (currentIndex > 0) {
        currentIndex--;
        DOMAINRENDERER(historyStack[currentIndex], false);
        urlInput.value = historyStack[currentIndex];
    }
});

document.getElementById('forward').addEventListener('click', () => {
    if (currentIndex < historyStack.length - 1) {
        currentIndex++;
        DOMAINRENDERER(historyStack[currentIndex], false);
        urlInput.value = historyStack[currentIndex];
    }
});

document.getElementById('home').addEventListener('click', () => {
    const localURL = 'goob://';
    currentDomain = localURL;
    DOMAINRENDERER(localURL);
    urlInput.value = localURL;
});

window.addEventListener('DOMContentLoaded', () => {
    const localURL = 'goob://';
    currentDomain = localURL;
    DOMAINRENDERER(localURL);
    urlInput.value = localURL;
});

// custom window

document.getElementById('page-title').textContent = "GoobScape";
const domaindeets = document.getElementById('domaindeets');

function safe(value) {
    if (value == null) return "?";
    const s = String(value).trim();
    return s.length === 0 ? "?" : s.slice(0, 300);
}

domaindeets.addEventListener('click', () => {
    const infoString =
        `
DOMAIN:
DNS verified: ${safe(currentDomainInfo.verified)}
Address: ${safe(currentDomainInfo.address)}
Title: ${safe(currentDomainInfo.title)}
Description: ${safe(currentDomainInfo.description)}\n
OWNERSHIP:
Owner: ${safe(currentDomainOwner.username)}`;

currentDomainOwner
    window.electronAPI.domainDetails(currentDomain, infoString);
});


document.getElementById('URL').addEventListener('input', function () {
    //this.value = this.value.replace(/[^A-Za-z0-9+?=.\/:-]/g, '');
    if (this.value.length > 300) {
        this.value = this.value.slice(0, 300);
    }
});

const settingsBtn = document.getElementById("settings");
const settingsWindow = document.getElementById("settings-window");
const closeSettings = document.getElementById("close-settings");

settingsBtn.addEventListener("click", () => {
    settingsWindow.style.display = "flex";
});

closeSettings.addEventListener("click", () => {
    settingsWindow.style.display = "none";
});

window.addEventListener('DOMContentLoaded', async () => {
    const dnsInput = document.getElementById('dns-input');
    if (!dnsInput) return;

    const currentDNS = await window.electronAPI.getCurrentDNS();
    dnsInput.value = currentDNS;

    const saveBtn = document.getElementById('save-dns');
    const status = document.getElementById('dns-status');

    saveBtn.addEventListener('click', async () => {
        const newUrl = dnsInput.value.trim();
        const result = await window.electronAPI.updateDNS(newUrl);

        if (result.success) {
            status.textContent = "DNS updated!";
        } else {
            status.textContent = result.message;
        }

        setTimeout(() => {
            status.textContent = "";
        }, 2000);
    });
});

document.getElementById('delete-history').addEventListener('click', () => {
    historyStack = [];
    currentIndex = -1;

    localStorage.removeItem('goob_vault');

    window.electronAPI.information("Browsing data was cleared successfully");

    if (currentDomain) {
        DOMAINRENDERER(currentDomain, false);
    }
});

const historyWindow = document.getElementById("history-window");
const closeHistory = document.getElementById("close-history");
const historylog = document.getElementById("historylog");

document.getElementById('display-history').addEventListener('click', () => {
    historyWindow.style.display = "flex";
    historylog.innerHTML = "";

    if (Array.isArray(historyStack) && historyStack.length > 0) {
        historylog.innerHTML = "";

        const currentVault = JSON.parse(localStorage.getItem('goob_vault') || '{}');

        const ul = document.createElement("ul");

        historyStack.forEach(item => {
            const li = document.createElement("li");
            li.textContent = item;
            ul.appendChild(li);

            const cleanUrl = item.split('?')[0].replace(/\/$/, "");
            if (currentVault[cleanUrl]) {
                const notice = document.createElement("div");
                notice.textContent = "Has login data";
                notice.style.fontSize = "12px";
                notice.style.color = "green";
                notice.style.marginLeft = "10px";
                li.appendChild(notice);
            }

        });

        historylog.appendChild(ul);

    } else {
        historylog.innerHTML = "<p>Nothing here</p>";
    }
});

closeHistory.addEventListener("click", () => {
    historyWindow.style.display = "none";
});

const saveAvButton = document.getElementById('save-av');

saveAvButton.addEventListener('click', () => {
    const selectedOption = document.querySelector('input[name="avsetting"]:checked').value;

    if (selectedOption === 'check-enabled') {
        AVcheckenabled = true;
        AVenabled = true;
    } else if (selectedOption === 'check-disabled') {
        AVcheckenabled = false;
        AVenabled = true;
    } else if (selectedOption === 'no-av') {
        AVcheckenabled = true;
        AVenabled = false;
    }

    //console.log('AVcheckenabled:', AVcheckenabled, 'AVenabled:', AVenabled);
    window.electronAPI.updateAVSettings({ AVcheckenabled, AVenabled });
    window.electronAPI.information("Security settings updated successfully\nRefresh to apply to this page");
});

window.addEventListener('message', (event) => {
    if (event.data.type === 'GOOB_SYNC') {
        checkSavedSession();
    }
});

window.addEventListener('message', (event) => {
    if (event.data.type === 'GOOB_LOGOUT') {
        const cleanDomain = currentDomain.split('?')[0];

        let allTokens = JSON.parse(localStorage.getItem('goob_vault') || '{}');

        if (allTokens[cleanDomain]) {
            delete allTokens[cleanDomain];
            localStorage.setItem('goob_vault', JSON.stringify(allTokens));

            console.log(`Successfully cleared session for: ${cleanDomain}`);

            DOMAINRENDERER(currentDomain, false);
            //window.electronAPI.information("Logged out successfully");
        }
    }
});


// get av setting current
