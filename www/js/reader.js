// --- READER ENGINE ---
// File ini mengurus semua logika berat: Parsing PDF, Ekstrak EPUB, In-Book Search, & Gemini AI.

if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';
}

// 1. EVENT LISTENER UNTUK UPLOAD BUKU & PENCARIAN
let inbookSearchTimeout;
document.addEventListener("DOMContentLoaded", () => {
    // Listener Upload File (PDF/EPUB/TXT/MD) - Support Multiple Files
    const fileInput = document.getElementById('doc-upload');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;
            
            const totalFiles = files.length;
            const d = i18n[wikiLang] || i18n['en'];
            
            DOM.load.classList.remove('hidden');
            
            for (let i = 0; i < totalFiles; i++) {
                const file = files[i];
                const originalFilename = file.name; 
                const ext = originalFilename.split('.').pop().toLowerCase(); 
                const bookTitle = originalFilename.replace(/\.[^/.]+$/, "");
                
                // Update UI Loading text dengan info multi-file jika lebih dari 1
                const progressText = totalFiles > 1 ? `${d.loadingDocs} (${i + 1}/${totalFiles})...` : d.loadingDocs;
                DOM.loadTxt.textContent = progressText;
                DOM.loadBar.style.width = '0%'; 
                DOM.loadPct.textContent = '0%';

                try {
                    if (ext === 'pdf') await handlePdf(file, bookTitle);
                    else if (ext === 'epub') await handleEpub(file, bookTitle);
                    else if (ext === 'txt') await handleTxt(file, bookTitle);
                    else if (ext === 'md') await handleMd(file, bookTitle);
                    else throw new Error("Format tidak didukung. Gunakan PDF, EPUB, TXT, atau MD.");
                } catch (err) { 
                    showDialog("Gagal Buka Buku", `${bookTitle} - ${err.message}`, "alert-triangle", [{text: "Tutup", primary: true}]);
                    console.error(err); 
                }
            }
            
            // Cleanup setelah semua file selesai
            setTimeout(() => { 
                DOM.load.classList.add('hidden'); 
                e.target.value = ''; 
            }, 500);
            
            await loadLibrary(); 
            renderLibrary();
        });
    }

    // Modal AI Close Event
    const modalAiOverlay = document.getElementById('ai-modal');
    if(modalAiOverlay) {
        modalAiOverlay.addEventListener('click', (e) => {
            if(e.target === modalAiOverlay) {
                closeAiModal();
            }
        });
    }
});

// 2. PARSER TXT
async function handleTxt(file, title) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const d = i18n[wikiLang] || i18n['en'];
        DOM.loadTxt.textContent = d.formattingText;

        reader.onload = async (e) => {
            try {
                const text = e.target.result;
                // Pecah berdasarkan newline, bersihin baris kosong
                const paragraphs = text.split(/\r?\n/).filter(p => p.trim() !== '');
                const nodes = [];
                
                for (let i = 0; i < paragraphs.length; i++) {
                    const progress = Math.round((i / paragraphs.length) * 100);
                    DOM.loadBar.style.width = `${progress}%`;
                    DOM.loadPct.textContent = `${progress}%`;

                    // Simple heurisitic for Chapters (All caps or starts with Chapter/Bab)
                    const pText = paragraphs[i].trim();
                    let isToc = false;
                    let depth = 1;
                    
                    if (pText.length < 50 && (pText === pText.toUpperCase() || /^(chapter|bab|bagian)\s/i.test(pText))) {
                        isToc = true;
                        nodes.push({ text: pText, html: `<h1 class="text-3xl font-bold mb-4 mt-8">${pText}</h1>`, isToc, depth });
                    } else {
                        nodes.push({ text: pText, html: `<p class="mb-4">${pText}</p>`, isToc: false });
                    }
                    
                    if (i % 500 === 0) await new Promise(r => setTimeout(r, 0));
                }

                if (nodes.length === 0) throw new Error("File TXT kosong.");

                const book = {
                    id: 'book_' + Date.now() + Math.random().toString(16).slice(2),
                    title: title, cover: null,
                    progress: 0, lastReadNode: 0, lastRead: Date.now(),
                    nodes: nodes,
                    bookmarks: []
                };

                await localforage.setItem(book.id, book);
                resolve();
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error("Gagal membaca file TXT."));
        reader.readAsText(file);
    });
}

// 3. PARSER MARKDOWN (.md)
async function handleMd(file, title) {
    return new Promise((resolve, reject) => {
        if (typeof marked === 'undefined') return reject(new Error("Library Marked.js tidak ditemukan."));
        
        const reader = new FileReader();
        const d = i18n[wikiLang] || i18n['en'];
        DOM.loadTxt.textContent = d.formattingText;

        reader.onload = async (e) => {
            try {
                const text = e.target.result;
                // Konversi MD ke HTML pakai marked
                const rawHtml = marked.parse(text);
                
                // Bikin dummy container buat mem-parse HTML string
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = rawHtml;
                
                const nodes = [];
                const childNodes = Array.from(tempDiv.children);
                
                for (let i = 0; i < childNodes.length; i++) {
                    const el = childNodes[i];
                    const progress = Math.round((i / childNodes.length) * 100);
                    DOM.loadBar.style.width = `${progress}%`;
                    DOM.loadPct.textContent = `${progress}%`;

                    const elText = el.textContent.trim();
                    if (!elText && el.tagName !== 'IMG' && el.tagName !== 'HR') continue;

                    let isToc = false;
                    let depth = 1;
                    let outHtml = el.outerHTML;

                    // Handle Heading buat Daftar Isi
                    if (/^H[1-6]$/.test(el.tagName)) {
                        isToc = true;
                        depth = parseInt(el.tagName.substring(1));
                        // Stylize heading sesuai level
                        if (depth === 1) outHtml = `<h1 class="text-3xl font-bold mb-4 mt-8">${el.innerHTML}</h1>`;
                        else if (depth === 2) outHtml = `<h2 class="text-2xl font-bold mb-3 mt-6">${el.innerHTML}</h2>`;
                        else outHtml = `<h3 class="text-xl font-bold mb-2 mt-4">${el.innerHTML}</h3>`;
                    } 
                    // Handle list
                    else if (el.tagName === 'UL' || el.tagName === 'OL') {
                        const listClass = el.tagName === 'UL' ? 'list-disc pl-5 mb-4 space-y-1' : 'list-decimal pl-5 mb-4 space-y-1';
                        outHtml = `<${el.tagName.toLowerCase()} class="${listClass}">${el.innerHTML}</${el.tagName.toLowerCase()}>`;
                    }
                    // Handle Blockquote
                    else if (el.tagName === 'BLOCKQUOTE') {
                        outHtml = `<blockquote class="border-l-4 border-m3-primary pl-4 py-1 italic opacity-80 mb-4 bg-m3-surfaceVariant rounded-r-lg">${el.innerHTML}</blockquote>`;
                    }
                    // Handle standard paragraph
                    else if (el.tagName === 'P') {
                        outHtml = `<p class="mb-4">${el.innerHTML}</p>`;
                    }

                    nodes.push({ text: elText, html: outHtml, isToc, depth });
                    
                    if (i % 100 === 0) await new Promise(r => setTimeout(r, 0));
                }

                if (nodes.length === 0) throw new Error("File MD kosong atau format salah.");

                const book = {
                    id: 'book_' + Date.now() + Math.random().toString(16).slice(2),
                    title: title, cover: null,
                    progress: 0, lastReadNode: 0, lastRead: Date.now(),
                    nodes: nodes,
                    bookmarks: []
                };

                await localforage.setItem(book.id, book);
                resolve();
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error("Gagal membaca file MD."));
        reader.readAsText(file);
    });
}


// 4. PARSER PDF
async function handlePdf(file, title) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
    const numPages = pdf.numPages;
    let cover = null;
    const nodes = [];
    const d = i18n[wikiLang] || i18n['en'];

    for (let i = 1; i <= numPages; i++) {
        const pct = Math.round((i / numPages) * 100);
        DOM.loadBar.style.width = `${pct}%`;
        DOM.loadPct.textContent = `${pct}%`;

        const page = await pdf.getPage(i);

        if (i === 1) {
            DOM.loadTxt.textContent = d.extractingCover;
            const viewport = page.getViewport({scale: 1});
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width; canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({canvasContext: ctx, viewport: viewport}).promise;
            cover = canvas.toDataURL('image/jpeg', 0.5);
        }

        DOM.loadTxt.textContent = `${d.readingPage} ${i} / ${numPages}...`;
        const textContent = await page.getTextContent();
        let pageText = '';
        let lastY = -1;

        textContent.items.forEach(item => {
            if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) pageText += '\n';
            pageText += item.str;
            lastY = item.transform[5];
        });

        const rawParagraphs = pageText.split('\n');
        let currentP = '';
        
        DOM.loadTxt.textContent = d.formattingText;
        for (let p of rawParagraphs) {
            const clean = p.trim();
            if (!clean) {
                if (currentP) {
                    let isToc = currentP.length < 100 && (currentP === currentP.toUpperCase() || /^([IVXLCDM\d]+(\.|\s)|Bab\s|Chapter\s)/i.test(currentP));
                    nodes.push({ text: currentP, html: `<p>${currentP}</p>`, isToc, depth: 1 });
                    currentP = '';
                }
            } else {
                currentP += (currentP ? ' ' : '') + clean;
            }
        }
        if (currentP) {
            let isToc = currentP.length < 100 && (currentP === currentP.toUpperCase() || /^([IVXLCDM\d]+(\.|\s)|Bab\s|Chapter\s)/i.test(currentP));
            nodes.push({ text: currentP, html: `<p>${currentP}</p>`, isToc, depth: 1 });
        }
    }

    if (nodes.length === 0) throw new Error("Gagal ekstrak teks dari PDF ini.");

    const book = {
        id: 'book_' + Date.now(),
        title: title, cover: cover,
        progress: 0, lastReadNode: 0, lastRead: Date.now(),
        nodes: nodes,
        bookmarks: [] // Inisialisasi properti bookmark untuk fitur Highlight
    };

    await localforage.setItem(book.id, book);
}

// 5. PARSER EPUB
async function handleEpub(file, title) {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const d = i18n[wikiLang] || i18n['en'];

    DOM.loadTxt.textContent = d.extractingEpub;
    DOM.loadBar.style.width = '10%'; DOM.loadPct.textContent = '10%';

    let containerFile = zip.file("META-INF/container.xml");
    if (!containerFile) throw new Error("Format EPUB tidak valid (container.xml hilang).");
    const containerXml = await containerFile.async("string");
    const containerDom = new DOMParser().parseFromString(containerXml, "text/xml");
    const opfPath = containerDom.querySelector("rootfile").getAttribute("full-path");

    const opfFile = zip.file(opfPath);
    if (!opfFile) throw new Error("OPF file hilang.");
    const opfXml = await opfFile.async("string");
    const opfDom = new DOMParser().parseFromString(opfXml, "text/xml");
    const basePath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);

    DOM.loadTxt.textContent = d.analyzingStructure;
    DOM.loadBar.style.width = '20%'; DOM.loadPct.textContent = '20%';

    const manifest = {};
    opfDom.querySelectorAll("manifest > item").forEach(item => {
        manifest[item.getAttribute("id")] = item.getAttribute("href");
    });

    let cover = null;
    const coverMeta = opfDom.querySelector("meta[name='cover']");
    if (coverMeta) {
        const coverId = coverMeta.getAttribute("content");
        if (manifest[coverId]) {
            const coverFile = zip.file(basePath + manifest[coverId]);
            if (coverFile) {
                const coverBlob = await coverFile.async("blob");
                cover = await new Promise(res => { const r = new FileReader(); r.onload=e=>res(e.target.result); r.readAsDataURL(coverBlob); });
            }
        }
    }

    const tocHref = manifest['ncx'] || manifest['toc.ncx'];
    const tocMap = {};
    if (tocHref) {
        const tocFile = zip.file(basePath + tocHref);
        if (tocFile) {
            const tocXml = await tocFile.async("string");
            const tocDom = new DOMParser().parseFromString(tocXml, "text/xml");
            tocDom.querySelectorAll("navPoint").forEach(np => {
                const text = np.querySelector("text").textContent.trim();
                let src = np.querySelector("content").getAttribute("src");
                src = src.split('#')[0]; // buang anchor hash
                tocMap[src] = text;
            });
        }
    }

    const spineList = [];
    opfDom.querySelectorAll("spine > itemref").forEach(ref => {
        spineList.push(manifest[ref.getAttribute("idref")]);
    });

    const nodes = [];
    const totalChapters = spineList.length;

    for (let i = 0; i < totalChapters; i++) {
        const href = spineList[i];
        if (!href) continue;

        const pct = 20 + Math.round((i / totalChapters) * 80);
        DOM.loadBar.style.width = `${pct}%`;
        DOM.loadPct.textContent = `${pct}%`;
        DOM.loadTxt.textContent = `${d.extractingChapter} ${i+1}/${totalChapters}...`;

        const htmlFile = zip.file(basePath + href);
        if (!htmlFile) continue;

        const htmlText = await htmlFile.async("string");
        const doc = new DOMParser().parseFromString(htmlText, "text/html");

        const isTocStr = tocMap[href] || (doc.title ? doc.title.trim() : `Bab ${i+1}`);
        const tempNodes = [];

        // Ekstrak Body element
        const body = doc.body;
        if (!body) continue;

        // Flatten semua text node / block element
        // Simplifikasi: Ambil semua tag paragraf, heading, list
        const elements = body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, div');
        let currentP = '';

        Array.from(elements).forEach(el => {
            // Hindari div pembungkus yang isinya element block lain, agar tidak duplikat text
            if (el.tagName === 'DIV' && el.querySelector('p, h1, h2, div')) return;

            const text = el.textContent.trim().replace(/\s+/g, ' ');
            if (!text) return;

            // Jika dia Heading (H1-H6), tandai sebagai item sub-TOC
            if (/^H[1-6]$/.test(el.tagName)) {
                if (currentP) { tempNodes.push({ text: currentP, html: `<p>${currentP}</p>`, isToc: false }); currentP = ''; }
                const depth = parseInt(el.tagName.substring(1));
                tempNodes.push({ text: text, html: `<h1 class="text-2xl font-bold mb-4 mt-6 opacity-90">${text}</h1>`, isToc: true, depth: depth });
            } else {
                currentP += (currentP ? ' ' : '') + text;
                if (currentP.length > 300) { // Potong paragraf terlalu panjang untuk performa vDOM list
                     tempNodes.push({ text: currentP, html: `<p>${currentP}</p>`, isToc: false });
                     currentP = '';
                }
            }
        });
        
        if (currentP) tempNodes.push({ text: currentP, html: `<p>${currentP}</p>`, isToc: false });

        // Tandai node pertama dari file ini sebagai TOC Utama (dari NCX) jika ada
        if (tempNodes.length > 0) {
            tempNodes[0].isToc = true;
            tempNodes[0].text = isTocStr;
            tempNodes[0].depth = 1;
        }

        nodes.push(...tempNodes);
    }

    if (nodes.length === 0) throw new Error("Gagal mengekstrak konten EPUB.");

    const book = {
        id: 'book_' + Date.now(),
        title: title || "Untitled Book", cover: cover,
        progress: 0, lastReadNode: 0, lastRead: Date.now(),
        nodes: nodes,
        bookmarks: [] // Inisialisasi properti bookmark untuk fitur Highlight
    };

    await localforage.setItem(book.id, book);
}


// 6. KAMUS & GEMINI AI
window.saveGeminiModel = function() {
    const val = document.getElementById('gemini-model-select').value;
    localStorage.setItem('gemini_model', val);
};

window.saveGeminiKey = function() {
    const key = document.getElementById('gemini-api-key').value.trim();
    const d = i18n[wikiLang] || i18n['en'];
    if (key) {
        localStorage.setItem('gemini_api_key', key);
        showDialog("Tersimpan", d.keySaved, "check-circle", [{text: d.btnClose, primary: true}]);
    } else {
        localStorage.removeItem('gemini_api_key');
    }
};

window.lookupDictionary = async function() {
    const term = currentSelection.text;
    if (!term) return;

    // Bersihin seleksi UI native dan menu
    window.getSelection().removeAllRanges();
    document.getElementById('selection-menu').classList.add('hidden');
    
    // Siapin state bahasa saat ini
    let currentLang = wikiLang; 
    let wikiUrlLang = currentLang === 'es' ? 'es' : currentLang === 'id' ? 'id' : 'en';

    document.getElementById('ai-term').textContent = term;
    
    // UI Resets
    const wikiCard = document.getElementById('wiki-card');
    const wikiLoad = document.getElementById('wiki-loading');
    const wikiCont = document.getElementById('wiki-content');
    const geminiCard = document.getElementById('gemini-card');
    const geminiLoad = document.getElementById('gemini-loading');
    const geminiCont = document.getElementById('gemini-content');

    wikiLoad.classList.remove('hidden');
    wikiCont.classList.add('hidden');
    wikiCont.innerHTML = '';
    
    geminiCard.classList.add('hidden');
    if (geminiLoad) geminiLoad.classList.remove('hidden');
    if (geminiCont) geminiCont.classList.add('hidden');
    
    openModal('ai-modal', 'ai-sheet', true);

    // Wikipedia Fetch
    try {
        const res = await fetch(`https://${wikiUrlLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        
        wikiLoad.classList.add('hidden');
        wikiCont.innerHTML = `
            <p class="text-sm leading-relaxed font-medium text-m3-onSurface mb-2">${data.extract}</p>
            <a href="${data.content_urls.desktop.page}" target="_blank" class="text-[10px] font-bold uppercase tracking-wider text-m3-primary hover:underline">Baca selengkapnya &rarr;</a>
        `;
        wikiCont.classList.remove('hidden');
    } catch (e) {
        wikiLoad.classList.add('hidden');
        const d = i18n[wikiLang] || i18n['en'];
        wikiCont.innerHTML = `<p class="text-sm opacity-50 font-bold italic">${d.searchNotFound}</p>`;
        wikiCont.classList.remove('hidden');
    }

    // Gemini Fetch
    const apiKey = localStorage.getItem('gemini_api_key');
    if (apiKey && geminiCard) {
        geminiCard.classList.remove('hidden');
        const modelName = localStorage.getItem('gemini_model') || 'gemini-2.5-flash-lite';
        
        // Sesuaikan Prompt berdasarkan bahasa
        let promptText = "";
        if (currentLang === 'id') {
            promptText = `Jelaskan secara singkat, jelas, padat, dan mudah dipahami apa itu "${term}" dalam konteks umum. Maksimal 3 kalimat. Bahasa Indonesia.`;
        } else if (currentLang === 'es') {
            promptText = `Explica brevemente, claramente y de forma concisa qué es "${term}" en un contexto general. Máximo 3 oraciones. En español.`;
        } else {
            promptText = `Explain briefly, clearly, and concisely what "${term}" is in a general context. Maximum 3 sentences. In English.`;
        }

        fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        })
        .then(r => { if (!r.ok) throw new Error(`API Error: ${r.status}`); return r.json(); })
        .then(data => {
            if (geminiLoading) geminiLoading.classList.add('hidden');
            if (!geminiContent) return;
            const rawText = data.candidates[0].content.parts[0].text;
            const formatted = rawText
                .replace(/\*\*(.*?)\*\*/g, '<strong class="text-m3-primary font-bold">$1</strong>')
                .replace(/\*(.*?)\*/g, '<em class="italic opacity-90">$1</em>')
                .replace(/\n\n/g, '<br><br>')
                .replace(/\n/g, '<br>');
            geminiContent.innerHTML = formatted;
            geminiContent.classList.remove('hidden');
        })
        .catch((err) => {
            if (geminiLoading) geminiLoading.classList.add('hidden');
            if (geminiContent) {
                geminiContent.innerHTML = `<div class="text-red-500 text-sm font-bold">Error: ${err.message}</div>`;
                geminiContent.classList.remove('hidden');
            }
        });
    }
};

window.closeAiModal = function(isFromHistory = false) {
    if (!isFromHistory) { history.back(); return; }
    const m = document.getElementById('ai-modal');
    const s = document.getElementById('ai-sheet');
    
    if (s.classList.contains('translate-y-0')) {
        s.style.transform = 'translateY(100%)';
    } else {
        s.classList.remove('translate-y-0');
        s.classList.add('translate-y-full');
    }
    
    m.classList.add('opacity-0');
    setTimeout(() => { m.classList.add('hidden'); }, 300);
};
