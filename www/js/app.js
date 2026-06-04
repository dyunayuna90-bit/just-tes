// --- APP LOGIC (NATIVE OPTIMIZED) ---
// Mengurus interaksi UI, Tema, Render Library, Fitur In-Book Bookmark, & Lazy Loading Book.

// 1. GLOBAL STATE & DOM REFERENCES
let library = []; 
let activeBookId = null; 
let observer = null; 
let activePanel = null;
let activeOptsId = null; 
let currentSelection = { text: "", nodeIdx: -1, startOff: 0, endOff: 0 }; 
let isBatchDeleteMode = false;
let selectedForDelete = [];
let activeNoteColor = 'yellow';
let editingAnnotId = null;

let isDark = localStorage.getItem('theme') !== 'light'; 
let currentThemeKey = localStorage.getItem('m3-key') || 'orchid';
let isAmoled = localStorage.getItem('amoled') === 'true';
let wikiLang = localStorage.getItem('wiki_lang') || 'id';

const DOM = {};

document.addEventListener("DOMContentLoaded", () => {
    // Inisialisasi DOM Elements
    Object.assign(DOM, {
        libView: document.getElementById('library-view'), 
        readView: document.getElementById('reader-view'),
        mainHeader: document.getElementById('main-header'),
        grid: document.getElementById('book-grid'), 
        empty: document.getElementById('empty-state'),
        topSection: document.getElementById('continue-reading-section'), 
        topSlider: document.getElementById('top-books-slider'),
        load: document.getElementById('loading-state'), 
        loadTxt: document.getElementById('loading-text'), 
        loadBar: document.getElementById('loading-bar'), 
        loadPct: document.getElementById('loading-percent'),
        inner: document.getElementById('reader-inner'), 
        content: document.getElementById('reader-content'),
        title: document.getElementById('reader-title'), 
        tocPanel: document.getElementById('toc-panel'), 
        tocList: document.getElementById('toc-list'),
        overlay: document.getElementById('side-panel-overlay'),
        readProg: document.getElementById('reading-progress-bar'),
        progTxt: document.getElementById('reader-progress-text'),
        settingsPanel: document.getElementById('settings-panel'),
        bookmarkPanel: document.getElementById('bookmark-panel'),
        bookmarkList: document.getElementById('bookmark-list'),
        searchRes: document.getElementById('search-results-panel'),
        searchInput: document.getElementById('inbook-search-input'),
        pinnedSection: document.getElementById('pinned-books-section'),
        pinnedGrid: document.getElementById('pinned-book-grid'),
        colHeading: document.getElementById('collection-heading')
    });

    applyThemeGlobal(currentThemeKey, isDark);
    applyI18n();
    loadLibrary();
    setupIntersectionObserver();

    // Setup Event Listeners UI
    document.getElementById('btn-back').onclick = () => { history.back(); };
    document.getElementById('btn-toc').onclick = () => togglePanel(DOM.tocPanel, 'toc', 'btn-toc');
    document.getElementById('btn-settings').onclick = () => togglePanel(DOM.settingsPanel, 'settings', 'btn-settings');
    
    document.getElementById('doc-upload').addEventListener('change', () => { window.scrollTo({top: 0, behavior: 'smooth'}); });
    
    // Pencarian Library
    const libSearch = document.getElementById('global-search');
    const searchArea = document.getElementById('search-area');
    const searchIcon = document.getElementById('search-icon-lib');
    if(libSearch && searchArea) {
        libSearch.addEventListener('focus', () => { 
            searchArea.classList.add('search-active'); 
            searchIcon.classList.remove('opacity-70');
            searchIcon.classList.add('text-m3-primary');
        });
        libSearch.addEventListener('blur', () => { 
            if(!libSearch.value) { 
                searchArea.classList.remove('search-active'); 
                searchIcon.classList.add('opacity-70');
                searchIcon.classList.remove('text-m3-primary');
            } 
        });
        libSearch.addEventListener('input', (e) => { renderLibrary(e.target.value.toLowerCase()); });
    }

    // Scroll Logic Header
    const libScroll = document.getElementById('library-content-scroll');
    if (libScroll && DOM.mainHeader) {
        libScroll.addEventListener('scroll', () => {
            if (libScroll.scrollTop > 20) DOM.mainHeader.classList.add('shadow-[0_8px_30px_rgba(0,0,0,0.05)]');
            else DOM.mainHeader.classList.remove('shadow-[0_8px_30px_rgba(0,0,0,0.05)]');
        });
    }

    // Text Selection Event for Native Feel Reader
    DOM.content.addEventListener('selectionchange', handleTextSelection);
    document.addEventListener('selectionchange', handleTextSelection);
    
    // Konfigurasi Typo Default (Reader)
    applyTypoSettings();
    
    // Load config dari LocalStorage
    setTimeout(() => {
        const apiKey = localStorage.getItem('gemini_api_key') || '';
        const model = localStorage.getItem('gemini_model') || 'gemini-2.5-flash';
        if(document.getElementById('gemini-api-key')) document.getElementById('gemini-api-key').value = apiKey;
        if(document.getElementById('gemini-model-select')) document.getElementById('gemini-model-select').value = model;
        
        // Pengecekan versi PWA otomatis
        const lastVer = localStorage.getItem('baca_last_version');
        if(!lastVer || lastVer !== window.APP_VERSION) {
            localStorage.setItem('baca_last_version', window.APP_VERSION);
            if(lastVer) showDialog("Aplikasi Diperbarui!", `Baca. telah diperbarui ke versi ${window.APP_VERSION}. Nikmati fitur terbaru dan peningkatan performa.`, "check-circle", [{text: "Tutup", primary: true}]);
        }
    }, 500);

    // Initial Back Key Setup
    window.history.replaceState({page: 'library'}, '');
    window.addEventListener('popstate', handleHardwareBack);
});


// 2. LIBRARY & RENDER MANAGEMENT
async function loadLibrary() {
    try {
        const data = await localforage.getItem('pdf_epub_master');
        if (data) {
            library = data.map(b => ({
                ...b, progressPct: b.progressPct || 0,
                annotations: b.annotations || [],
                shape: b.shape || 'square',
                isPinned: b.isPinned || false,
                hasSeparateContent: b.hasSeparateContent || false // Tandai kalau butuh lazy load
            }));
        } else {
            library = [];
        }
        renderLibrary();
    } catch (e) {
        console.error("Gagal memuat library:", e);
        library = [];
    }
}

function renderLibrary(searchQuery = "") {
    DOM.grid.innerHTML = ''; DOM.topSlider.innerHTML = ''; DOM.pinnedGrid.innerHTML = '';
    const d = typeof i18n !== 'undefined' ? (i18n[wikiLang] || i18n['id']) : {};
    
    document.getElementById('library-count').textContent = `${library.length} ${d.books || 'Buku'}`;
    
    if (library.length === 0) { 
        DOM.empty.classList.remove('hidden'); 
        DOM.topSection.classList.add('hidden'); 
        DOM.colHeading.classList.add('hidden');
        DOM.pinnedSection.classList.add('hidden');
        if(window.lucide) window.lucide.createIcons();
        return; 
    }
    
    DOM.empty.classList.add('hidden');
    let hasRecent = false;
    let hasPinned = false;
    let hasRegular = false;
    
    // Sort logic
    const filteredLib = library.filter(b => b.title.toLowerCase().includes(searchQuery));
    const sortedLib = [...filteredLib].sort((a, b) => b.progressPct - a.progressPct);

    sortedLib.forEach(book => {
        if (!searchQuery && book.progressPct > 0 && book.progressPct < 100 && !book.isPinned) {
            DOM.topSlider.appendChild(createBookCard(book, true));
            hasRecent = true;
        } else if (book.isPinned) {
            DOM.pinnedGrid.appendChild(createBookCard(book));
            hasPinned = true;
        } else {
            DOM.grid.appendChild(createBookCard(book));
            hasRegular = true;
        }
    });

    DOM.topSection.classList.toggle('hidden', !hasRecent || !!searchQuery);
    DOM.pinnedSection.classList.toggle('hidden', !hasPinned);
    DOM.colHeading.classList.toggle('hidden', !hasRegular && (hasRecent || hasPinned));
    
    if(window.lucide) window.lucide.createIcons();
}

function createBookCard(book, isSlider = false) {
    const card = document.createElement('div');
    const bType = book.type.toUpperCase();
    
    let shapeClass = "aspect-[2/3] rounded-[20px]";
    if (book.shape === 'default') shapeClass = "aspect-auto h-48 rounded-[20px]";
    else if (book.shape === 'rounded') shapeClass = "aspect-[2/3] rounded-full";
    
    if (isSlider) {
        card.className = "flex-none w-36 snap-start card-morph cursor-pointer relative group isolate";
        
        let cvr = `<div class="${shapeClass} w-full bg-m3-surfaceVariant flex items-center justify-center mb-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden transition-shadow group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.2)]">`;
        if(book.coverBase64) cvr += `<img src="${book.coverBase64}" class="w-full h-full object-cover">`;
        else cvr += `<span class="text-m3-onSurfaceVariant/40 font-bold tracking-widest text-lg">${bType}</span>`;
        cvr += `</div>`;
        
        card.innerHTML = `
            ${cvr}
            <div class="px-1">
                <h3 class="font-bold text-sm truncate text-m3-onBg mb-1">${book.title}</h3>
                <div class="flex items-center gap-2">
                    <div class="flex-1 h-1.5 bg-m3-surfaceVariant rounded-full overflow-hidden">
                        <div class="h-full bg-m3-primary rounded-full" style="width: ${book.progressPct}%"></div>
                    </div>
                    <span class="text-[10px] font-bold text-m3-onSurfaceVariant/80 w-6 text-right">${book.progressPct}%</span>
                </div>
            </div>
        `;
    } else {
        card.className = "card-morph cursor-pointer relative group isolate flex flex-col items-center select-none";
        card.setAttribute('data-id', book.id);
        
        let cvr = `<div class="${shapeClass} w-full bg-m3-surfaceVariant flex items-center justify-center mb-3 shadow-md overflow-hidden relative pointer-events-none transition-shadow group-hover:shadow-lg">`;
        if(book.coverBase64) cvr += `<img src="${book.coverBase64}" class="w-full h-full object-cover">`;
        else cvr += `<span class="text-m3-onSurfaceVariant/40 font-bold tracking-widest text-sm">${bType}</span>`;
        
        cvr += `<div class="absolute top-2 right-2 flex gap-1 pointer-events-auto">`;
        if (book.isPinned) {
            cvr += `<div class="w-6 h-6 rounded-full bg-m3-primary/90 backdrop-blur-sm flex items-center justify-center text-m3-onPrimary shadow-sm"><i data-lucide="pin" class="w-3 h-3 fill-current"></i></div>`;
        }
        cvr += `<button onclick="event.stopPropagation(); openBookOptions('${book.id}')" class="w-6 h-6 rounded-full bg-m3-surfaceVariant/90 backdrop-blur-sm flex items-center justify-center text-m3-onSurfaceVariant btn-morph shadow-sm"><i data-lucide="more-vertical" class="w-3 h-3 pointer-events-none"></i></button>`;
        cvr += `</div></div>`;
        
        card.innerHTML = `
            ${cvr}
            <div class="w-full px-1 pointer-events-none">
                <h3 class="font-bold text-[11px] leading-tight text-m3-onBg line-clamp-2 text-center">${book.title}</h3>
            </div>
            <div class="absolute inset-0 bg-m3-primary/20 rounded-[20px] opacity-0 transition-opacity pointer-events-none border-2 border-m3-primary" id="sel-${book.id}"></div>
        `;
    }

    card.onclick = () => {
        if(isBatchDeleteMode) toggleSelectBook(book.id);
        else openBook(book.id);
    };
    
    let pressTimer;
    card.addEventListener('touchstart', (e) => {
        if(!isBatchDeleteMode && !isSlider) { pressTimer = setTimeout(() => { event.preventDefault(); openBookOptions(book.id); }, 600); }
    }, {passive: false});
    card.addEventListener('touchend', () => { clearTimeout(pressTimer); });
    card.addEventListener('touchmove', () => { clearTimeout(pressTimer); });
    card.addEventListener('contextmenu', (e) => { 
        if(!isSlider) { e.preventDefault(); openBookOptions(book.id); }
    });

    return card;
}


// 3. BOOK OPTIONS & BATCH MODE
function openBookOptions(id) {
    activeOptsId = id;
    const book = library.find(b => b.id === id);
    if(!book) return;
    
    document.getElementById('opt-title').textContent = book.title;
    
    const pinBtn = document.getElementById('str-opt-pin');
    const pinIcon = document.getElementById('icon-opt-pin');
    if (book.isPinned) {
        pinBtn.textContent = typeof i18n !== 'undefined' ? (i18n[wikiLang]?.optUnpin || "Lepas Sematan") : "Lepas Sematan";
        pinIcon.setAttribute('data-lucide', 'pin-off');
    } else {
        pinBtn.textContent = typeof i18n !== 'undefined' ? (i18n[wikiLang]?.optPin || "Sematkan Buku") : "Sematkan Buku";
        pinIcon.setAttribute('data-lucide', 'pin');
    }
    if(window.lucide) window.lucide.createIcons();

    pushAppHistory('b-opt-modal');
    openModalRaw('b-opt-modal', 'b-opt-sheet');
}

window.togglePinBook = async function() {
    const idx = library.findIndex(b => b.id === activeOptsId);
    if(idx > -1) {
        library[idx].isPinned = !library[idx].isPinned;
        await localforage.setItem('pdf_epub_master', library);
        renderLibrary();
    }
    history.back();
}

window.triggerEditView = function() {
    history.back();
    setTimeout(() => {
        const book = library.find(b => b.id === activeOptsId);
        if(!book) return;
        document.getElementById('edit-book-id').value = book.id;
        document.getElementById('edit-book-title').value = book.title;
        selectShape(book.shape || 'square');
        document.getElementById('edit-book-cover').value = ""; // Reset file input
        pushAppHistory('edit-modal');
        openModalRaw('edit-modal', 'edit-sheet');
    }, 350);
}

window.selectShape = function(shape) {
    document.getElementById('edit-book-shape').value = shape;
    ['default', 'rounded', 'square'].forEach(s => {
        const btn = document.getElementById(`shape-${s}`);
        if(s === shape) {
            btn.classList.add('bg-m3-primary', 'text-m3-onPrimary');
            btn.classList.remove('bg-m3-surfaceVariant', 'text-m3-onSurfaceVariant');
        } else {
            btn.classList.remove('bg-m3-primary', 'text-m3-onPrimary');
            btn.classList.add('bg-m3-surfaceVariant', 'text-m3-onSurfaceVariant');
        }
    });
}

window.saveBookEdit = async function() {
    const id = document.getElementById('edit-book-id').value;
    const title = document.getElementById('edit-book-title').value;
    const shape = document.getElementById('edit-book-shape').value;
    const fileInput = document.getElementById('edit-book-cover');
    
    const idx = library.findIndex(b => b.id === id);
    if(idx > -1) {
        library[idx].title = title;
        library[idx].shape = shape;
        
        if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.onload = async (e) => {
                const b64 = e.target.result;
                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
                    try {
                        const fs = window.Capacitor.Plugins.Filesystem;
                        const base64Str = b64.split(',')[1];
                        const filename = `custom_cover_${id}_${Date.now()}.jpeg`;
                        await fs.writeFile({ path: filename, data: base64Str, directory: 'DATA' });
                        const stat = await fs.getUri({ directory: 'DATA', path: filename });
                        library[idx].coverBase64 = window.Capacitor.convertFileSrc(stat.uri);
                    } catch (err) {
                        library[idx].coverBase64 = b64;
                    }
                } else {
                    library[idx].coverBase64 = b64;
                }
                finishEdit();
            };
            reader.readAsDataURL(file);
        } else {
            finishEdit();
        }
    }
    
    async function finishEdit() {
        await localforage.setItem('pdf_epub_master', library);
        renderLibrary();
        history.back();
    }
}

window.triggerDeleteView = function() {
    history.back();
    setTimeout(() => {
        showDialog("Hapus Buku?", "Aksi ini tidak bisa dibatalkan.", "trash-2", [
            { text: "Batal" },
            { text: "Hapus", danger: true, action: async () => {
                const book = library.find(b => b.id === activeOptsId);
                library = library.filter(b => b.id !== activeOptsId);
                if (book && book.hasSeparateContent) {
                    await localforage.removeItem(`book_content_${activeOptsId}`);
                }
                await localforage.setItem('pdf_epub_master', library);
                renderLibrary();
            }}
        ]);
    }, 350);
}

// --- BATCH DELETE LOGIC ---
window.triggerSelectMode = function() {
    history.back();
    setTimeout(() => {
        isBatchDeleteMode = true;
        selectedForDelete = [activeOptsId];
        document.getElementById('fab-container').classList.add('translate-y-32');
        document.getElementById('batch-delete-bar').classList.remove('translate-y-32');
        updateBatchUI();
    }, 350);
}

window.toggleSelectBook = function(id) {
    if(selectedForDelete.includes(id)) selectedForDelete = selectedForDelete.filter(i => i !== id);
    else selectedForDelete.push(id);
    updateBatchUI();
}

function updateBatchUI() {
    document.querySelectorAll('[id^="sel-"]').forEach(el => el.classList.remove('opacity-100'));
    selectedForDelete.forEach(id => {
        const el = document.getElementById(`sel-${id}`);
        if(el) el.classList.add('opacity-100');
    });
    const d = typeof i18n !== 'undefined' ? (i18n[wikiLang] || i18n['id']) : {};
    document.getElementById('batch-delete-count').textContent = `${selectedForDelete.length} ${d.selected || 'Terpilih'}`;
}

window.toggleBatchDelete = function() {
    isBatchDeleteMode = false;
    selectedForDelete = [];
    document.querySelectorAll('[id^="sel-"]').forEach(el => el.classList.remove('opacity-100'));
    document.getElementById('fab-container').classList.remove('translate-y-32');
    document.getElementById('batch-delete-bar').classList.add('translate-y-32');
}

window.executeBatchDelete = function() {
    if(selectedForDelete.length === 0) return;
    showDialog("Hapus Buku Terpilih?", `Yakin hapus ${selectedForDelete.length} buku?`, "trash-2", [
        { text: "Batal" },
        { text: "Hapus", danger: true, action: async () => {
            for (let id of selectedForDelete) {
                const book = library.find(b => b.id === id);
                if (book && book.hasSeparateContent) await localforage.removeItem(`book_content_${id}`);
            }
            library = library.filter(b => !selectedForDelete.includes(b.id));
            await localforage.setItem('pdf_epub_master', library);
            toggleBatchDelete();
            renderLibrary();
        }}
    ]);
}

// 4. READER ENGINE & OPTIMIZED LAZY LOAD
window.currentBookNodes = null; // Menyimpan cache node mentah saat buku terbuka

async function openBook(id) {
    const book = library.find(b => b.id === id); 
    if (!book) return;
    activeBookId = id; 
    
    // UI Transisi Masuk
    DOM.title.textContent = book.title; 
    DOM.inner.innerHTML = ''; DOM.tocList.innerHTML = ''; 
    DOM.readView.classList.remove('translate-y-full'); 
    DOM.libView.classList.add('-translate-y-20', 'opacity-0');
    
    document.getElementById('reader-floating-header').classList.remove('opacity-0', '-translate-y-full');
    
    const loadingOverlay = document.getElementById('reader-loading-overlay');
    loadingOverlay.classList.remove('hidden');
    
    requestAnimationFrame(() => { loadingOverlay.classList.remove('opacity-0'); });

    // LAZY LOAD Teks (Perbaikan Phase 5)
    setTimeout(async () => {
        let nodesToRender = book.nodes; 
        
        if (book.hasSeparateContent) {
            try {
                nodesToRender = await localforage.getItem(`book_content_${book.id}`);
            } catch (e) {
                console.error("Gagal load isi buku:", e);
                nodesToRender = null;
            }
        }
        
        if (!nodesToRender || nodesToRender.length === 0) {
            showDialog("Error", "Gagal memuat isi buku. File mungkin rusak/terhapus.", "alert-triangle", [{text:"Tutup", primary:true, action: () => history.back()}]);
            loadingOverlay.classList.add('opacity-0');
            setTimeout(() => loadingOverlay.classList.add('hidden'), 300);
            return;
        }

        window.currentBookNodes = nodesToRender; // Cache ke global memory saat dibaca

        // Render Fragment (Minimalisir Reflow DOM)
        const fragment = document.createDocumentFragment(); 
        const annots = book.annotations || [];
        
        nodesToRender.forEach((node, idx) => {
            const el = document.createElement(node.tag === 'img' ? 'div' : node.tag);
            el.id = `node-${idx}`;
            
            if (node.tag === 'img') {
                el.className = 'w-full flex justify-center my-6';
                const img = document.createElement('img'); 
                img.src = node.src; 
                img.className = 'max-w-full rounded-2xl shadow-sm max-h-[60vh] object-contain bg-m3-surfaceVariant';
                img.loading = "lazy";
                el.appendChild(img);
            } else {
                const nodeAnnots = annots.filter(a => a.nodeIdx === idx);
                el.innerHTML = renderNodeText(node.text, nodeAnnots);
                
                if (node.tag === 'h1' || node.tag === 'h2') {
                    const tocItem = document.createElement('button');
                    tocItem.className = `text-left p-3 hover:bg-m3-surface rounded-2xl transition-colors font-bold ${node.tag==='h1'?'text-m3-primary text-sm':'text-m3-onSurfaceVariant text-xs pl-6'}`;
                    tocItem.textContent = node.text;
                    tocItem.onclick = () => { el.scrollIntoView({behavior: 'smooth'}); closeAllPanels(); };
                    DOM.tocList.appendChild(tocItem);
                }
            }
            fragment.appendChild(el);
        });
        
        DOM.inner.appendChild(fragment);

        loadingOverlay.classList.add('opacity-0');
        setTimeout(() => { loadingOverlay.classList.add('hidden'); }, 300);
        
        renderBookmarkList();
        
        // Pulihkan Posisi Baca
        if (book.lastReadId) { 
            const target = document.getElementById(book.lastReadId); 
            if(target) setTimeout(() => { target.scrollIntoView({behavior: 'auto', block: 'center'}); }, 100); 
        } else {
            DOM.content.scrollTop = 0;
        }
        
        // Aktifkan Observer Progress
        setTimeout(() => {
            const obsOpts = { root: DOM.content, rootMargin: '0px', threshold: 0.1 };
            observer = new IntersectionObserver((entries) => {
                let firstVisible = entries.find(e => e.isIntersecting);
                if (firstVisible) {
                    const idParts = firstVisible.target.id.split('-');
                    if(idParts.length !== 2) return;
                    const idx = parseInt(idParts[1]);
                    
                    book.lastReadId = firstVisible.target.id;
                    book.progressPct = Math.round((idx / nodesToRender.length) * 100);
                    
                    DOM.readProg.style.width = `${book.progressPct}%`;
                    DOM.progTxt.textContent = `${book.progressPct}%`;
                    
                    clearTimeout(window.saveProgTimeout);
                    window.saveProgTimeout = setTimeout(() => { localforage.setItem('pdf_epub_master', library); }, 2000);
                }
            }, obsOpts);
            
            document.querySelectorAll('#reader-inner > *').forEach(el => observer.observe(el));
        }, 500);

        pushAppHistory('reader');
    }, 400); // Jeda buat animasi loading smooth
}

window.closeReader = async function() {
    if (observer) observer.disconnect(); 
    activeBookId = null; 
    window.currentBookNodes = null; // Bersihkan memori RAM
    DOM.searchInput.value = ''; DOM.searchRes.classList.add('hidden');
    DOM.readView.classList.add('translate-y-full'); 
    DOM.libView.classList.remove('-translate-y-20', 'opacity-0');
    renderLibrary(document.getElementById('global-search') ? document.getElementById('global-search').value.toLowerCase() : "");
}


// 5. ANNOTATION & BOOKMARK ENGINE
window.renderNodeText = function(text, nodeAnnots) {
    if (!nodeAnnots || nodeAnnots.length === 0) return text;
    
    nodeAnnots.sort((a, b) => a.start - b.start);
    let html = ""; let lastIdx = 0;
    
    nodeAnnots.forEach(ann => {
        if (ann.start >= lastIdx) {
            html += text.substring(lastIdx, ann.start);
            html += `<mark class="cursor-pointer transition-opacity hover:opacity-80 hl-${ann.color}" data-annot-id="${ann.id}" onclick="event.preventDefault(); window.editAnnotation('${ann.id}')">${text.substring(ann.start, ann.end)}</mark>`;
            lastIdx = ann.end;
        }
    });
    html += text.substring(lastIdx);
    return html;
}

window.handleTextSelection = function() {
    const sel = window.getSelection();
    const menu = document.getElementById('selection-menu');
    
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !activeBookId) {
        hideSelectionMenu(); return;
    }
    
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const nodeEl = container.nodeType === 3 ? container.parentNode.closest('[id^="node-"]') : container.closest('[id^="node-"]');
    
    if (!nodeEl || !DOM.inner.contains(nodeEl)) { hideSelectionMenu(); return; }
    
    const nodeIdx = parseInt(nodeEl.id.split('-')[1]);
    const rect = range.getBoundingClientRect();
    
    if (rect.width === 0 || rect.height === 0) { hideSelectionMenu(); return; }
    
    // Kalkulasi Offset Super Akurat
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(nodeEl);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    let startOff = preSelectionRange.toString().length;
    let text = sel.toString();
    let endOff = startOff + text.length;

    currentSelection = { text, nodeIdx, startOff, endOff, nodeEl };
    
    menu.classList.remove('hidden');
    
    let top = rect.top - menu.offsetHeight - 15;
    let left = rect.left + (rect.width / 2) - (menu.offsetWidth / 2);
    
    if (top < 60) top = rect.bottom + 10;
    left = Math.max(10, Math.min(left, window.innerWidth - menu.offsetWidth - 10));
    
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    
    requestAnimationFrame(() => {
        menu.classList.remove('opacity-0', 'scale-75');
    });
    
    if(window.lucide) window.lucide.createIcons();
}

window.hideSelectionMenu = function() {
    const menu = document.getElementById('selection-menu');
    if(!menu.classList.contains('hidden')) {
        menu.classList.add('opacity-0', 'scale-75');
        setTimeout(() => { menu.classList.add('hidden'); }, 200);
        window.getSelection().removeAllRanges();
    }
}

window.openBookmarkModal = function(color) {
    if(currentSelection.nodeIdx === -1) return;
    activeNoteColor = color;
    hideSelectionMenu();
    document.getElementById('bookmark-input-title').value = '';
    document.getElementById('bookmark-input-text').value = '';
    document.getElementById('str-bookmark-modal-title').innerHTML = `<i data-lucide="bookmark" class="w-5 h-5 text-${color}-500 fill-current"></i> Bookmark Baru`;
    document.getElementById('btn-delete-bookmark').classList.add('hidden');
    editingAnnotId = null;
    if(window.lucide) window.lucide.createIcons();
    
    pushAppHistory('bookmark-modal');
    openModalRaw('bookmark-modal', 'bookmark-sheet');
}

window.saveBookmarkAnnotation = async function() {
    const bookIdx = library.findIndex(b => b.id === activeBookId);
    if(bookIdx === -1) return;
    
    const title = document.getElementById('bookmark-input-title').value.trim();
    const note = document.getElementById('bookmark-input-text').value.trim();
    if(!library[bookIdx].annotations) library[bookIdx].annotations = [];
    
    if (editingAnnotId) {
        const ann = library[bookIdx].annotations.find(a => a.id === editingAnnotId);
        if(ann) { ann.title = title; ann.note = note; }
    } else {
        const newAnnot = {
            id: 'ann_' + Date.now(),
            nodeIdx: currentSelection.nodeIdx,
            start: currentSelection.startOff,
            end: currentSelection.endOff,
            text: currentSelection.text,
            color: activeNoteColor,
            title: title, note: note,
            timestamp: Date.now()
        };
        library[bookIdx].annotations.push(newAnnot);
        
        // Re-render Paragraf 
        const nodeText = window.currentBookNodes[currentSelection.nodeIdx].text;
        const nodeAnnots = library[bookIdx].annotations.filter(a => a.nodeIdx === currentSelection.nodeIdx);
        currentSelection.nodeEl.innerHTML = renderNodeText(nodeText, nodeAnnots);
    }
    
    await localforage.setItem('pdf_epub_master', library);
    renderBookmarkList();
    _closeModalAction('bookmark-modal', 'bookmark-sheet', true);
}

window.editAnnotation = function(annotId) {
    const book = library.find(b => b.id === activeBookId);
    if(!book || !book.annotations) return;
    const ann = book.annotations.find(a => a.id === annotId);
    if(!ann) return;
    
    editingAnnotId = annotId;
    document.getElementById('bookmark-input-title').value = ann.title || '';
    document.getElementById('bookmark-input-text').value = ann.note || '';
    document.getElementById('str-bookmark-modal-title').innerHTML = `<i data-lucide="edit-3" class="w-5 h-5 text-${ann.color}-500"></i> Edit Catatan`;
    document.getElementById('btn-delete-bookmark').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
    
    pushAppHistory('bookmark-modal');
    openModalRaw('bookmark-modal', 'bookmark-sheet');
}

window.deleteBookmarkInsideModal = async function() {
    if(!editingAnnotId) return;
    const bookIdx = library.findIndex(b => b.id === activeBookId);
    if(bookIdx === -1) return;
    
    const ann = library[bookIdx].annotations.find(a => a.id === editingAnnotId);
    if(ann) {
        library[bookIdx].annotations = library[bookIdx].annotations.filter(a => a.id !== editingAnnotId);
        await localforage.setItem('pdf_epub_master', library);
        
        const nodeEl = document.getElementById(`node-${ann.nodeIdx}`);
        if(nodeEl && window.currentBookNodes) {
            const nodeText = window.currentBookNodes[ann.nodeIdx].text;
            const nodeAnnots = library[bookIdx].annotations.filter(a => a.nodeIdx === ann.nodeIdx);
            nodeEl.innerHTML = renderNodeText(nodeText, nodeAnnots);
        }
        renderBookmarkList();
    }
    _closeModalAction('bookmark-modal', 'bookmark-sheet', true);
}

function renderBookmarkList() {
    DOM.bookmarkList.innerHTML = '';
    const emptyMsg = document.getElementById('bookmark-empty');
    const book = library.find(b => b.id === activeBookId);
    
    if(!book || !book.annotations || book.annotations.length === 0) {
        emptyMsg.classList.remove('hidden'); return;
    }
    
    emptyMsg.classList.add('hidden');
    const sorted = [...book.annotations].sort((a,b) => a.nodeIdx - b.nodeIdx);
    
    sorted.forEach(ann => {
        const el = document.createElement('div');
        el.className = 'bg-m3-surface p-4 rounded-2xl cursor-pointer hover:bg-m3-surface/80 transition-colors border-none mb-3 group relative';
        
        let titleHtml = ann.title ? `<h4 class="font-bold text-sm mb-1 text-m3-onSurface">${ann.title}</h4>` : '';
        let noteHtml = ann.note ? `<p class="text-xs text-m3-onSurfaceVariant mb-2 opacity-80 font-medium">${ann.note}</p>` : '';
        
        el.innerHTML = `
            <div class="absolute top-0 left-0 w-1.5 h-full rounded-l-2xl bg-${ann.color}-400 dark:bg-${ann.color}-600"></div>
            <div class="pl-2">
                ${titleHtml}
                ${noteHtml}
                <blockquote class="text-[10px] italic border-l-2 border-m3-onSurfaceVariant/20 pl-2 text-m3-onSurfaceVariant/60 line-clamp-3">"${ann.text}"</blockquote>
            </div>
        `;
        el.onclick = () => {
            const target = document.getElementById(`node-${ann.nodeIdx}`);
            if(target) { target.scrollIntoView({behavior: 'smooth', block: 'center'}); closeAllPanels(); }
        };
        DOM.bookmarkList.appendChild(el);
    });
}

// 6. UI & THEME LOGIC
function togglePanel(panelEl, panelId, btnId) {
    if (activePanel === panelId) { closeAllPanels(); return; }
    if (activePanel) closeAllPanels(false);
    
    activePanel = panelId;
    DOM.overlay.classList.remove('hidden');
    panelEl.classList.remove('hidden');
    
    requestAnimationFrame(() => {
        DOM.overlay.classList.remove('opacity-0');
        panelEl.classList.remove('translate-x-full', 'opacity-0');
    });
    
    if (btnId) {
        document.querySelectorAll('.capsule-btn').forEach(btn => btn.classList.remove('nav-active'));
        document.getElementById(btnId).classList.add('nav-active');
    }
    
    // Fullscreen auto-hide logic header
    if(document.fullscreenElement) {
        document.getElementById('reader-floating-header').classList.remove('-translate-y-full', 'opacity-0');
        setTimeout(() => { if(activePanel === panelId) document.getElementById('reader-floating-header').classList.add('-translate-y-full', 'opacity-0'); }, 2000);
    }
    
    pushAppHistory(`panel-${panelId}`);
}

window.closeAllPanels = function(removeHistory = true) {
    if(removeHistory && activePanel) history.back();
    else _executeClosePanel();
}

function _executeClosePanel() {
    activePanel = null;
    DOM.overlay.classList.add('opacity-0');
    [DOM.tocPanel, DOM.bookmarkPanel, DOM.settingsPanel].forEach(p => {
        p.classList.add('translate-x-full', 'opacity-0');
    });
    document.querySelectorAll('.capsule-btn').forEach(btn => btn.classList.remove('nav-active'));
    setTimeout(() => {
        DOM.overlay.classList.add('hidden');
        [DOM.tocPanel, DOM.bookmarkPanel, DOM.settingsPanel].forEach(p => p.classList.add('hidden'));
    }, 300);
}

window.toggleThemeState = function() {
    isDark = !isDark; 
    localStorage.setItem('theme', isDark ? 'dark' : 'light'); 
    applyThemeGlobal(currentThemeKey, isDark);
    if (isAmoled && isDark) toggleAmoled(); // Disable AMOLED if toggling main theme
}

window.toggleAmoled = function() {
    if (!isDark) return;
    isAmoled = !isAmoled;
    localStorage.setItem('amoled', isAmoled);
    applyThemeGlobal(currentThemeKey, isDark);
}

window.setTheme = function(key) {
    currentThemeKey = key;
    localStorage.setItem('m3-key', key);
    applyThemeGlobal(key, isDark);
}

function applyThemeGlobal(key, dark) {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    
    const amoledToggle = document.getElementById('amoled-toggle-container');
    const amoledLabel = document.getElementById('str-amoled-label');
    const amoledKnob = document.getElementById('amoled-switch-knob');
    const amoledBg = document.getElementById('amoled-switch-bg');

    if (dark) {
        amoledToggle.classList.remove('hidden');
        if (isAmoled) {
            root.style.setProperty('--md-sys-color-background', '#000000');
            root.style.setProperty('--md-sys-color-surface', '#09090B');
            root.style.setProperty('--md-sys-color-surface-variant', '#18181B');
            amoledLabel.classList.remove('opacity-80');
            amoledKnob.classList.add('translate-x-8', 'bg-m3-primary');
            amoledKnob.classList.remove('bg-m3-onSurface');
            amoledBg.classList.add('bg-m3-primaryContainer');
        } else {
            root.style.setProperty('--md-sys-color-background', '#1C1B1E');
            root.style.setProperty('--md-sys-color-surface', '#212024');
            root.style.setProperty('--md-sys-color-surface-variant', '#2D2B30');
            amoledLabel.classList.add('opacity-80');
            amoledKnob.classList.remove('translate-x-8', 'bg-m3-primary');
            amoledKnob.classList.add('bg-m3-onSurface');
            amoledBg.classList.remove('bg-m3-primaryContainer');
            amoledBg.classList.add('bg-m3-onSurfaceVariant/20');
        }
        
        // Icon Mode Update
        document.getElementById('theme-label-text').textContent = typeof i18n !== 'undefined' ? (i18n[wikiLang]?.themeDark || "Mode Gelap") : "Mode Gelap";
        document.getElementById('theme-switch-icon').setAttribute('data-lucide', 'moon');
        document.getElementById('theme-switch-knob').classList.add('translate-x-8');
        document.getElementById('theme-switch-bg').classList.add('bg-m3-primaryContainer');
        
    } else {
        amoledToggle.classList.add('hidden');
        root.style.setProperty('--md-sys-color-background', '#FEFBFF');
        root.style.setProperty('--md-sys-color-surface', '#F3F0F4');
        root.style.setProperty('--md-sys-color-surface-variant', '#E7E0EC');
        
        document.getElementById('theme-label-text').textContent = typeof i18n !== 'undefined' ? (i18n[wikiLang]?.themeLight || "Mode Terang") : "Mode Terang";
        document.getElementById('theme-switch-icon').setAttribute('data-lucide', 'sun');
        document.getElementById('theme-switch-knob').classList.remove('translate-x-8');
        document.getElementById('theme-switch-bg').classList.remove('bg-m3-primaryContainer');
    }
    
    if(window.lucide) window.lucide.createIcons();

    // Dinamis Color Engine
    const pal = {
        orchid: { pL: '#8B5CF6', oPL: '#FFFFFF', pCL: '#EAEBFF', oPCL: '#2A009C', sCL: '#E2E0FD', oSCL: '#1A1A31', pD: '#CABEFF', oPD: '#2A009C', pCD: '#4214CA', oPCD: '#EAEBFF', sCD: '#454459', oSCD: '#E2E0FD' },
        olive: { pL: '#4F6F2E', oPL: '#FFFFFF', pCL: '#D0F8A5', oPCL: '#132100', sCL: '#DFE5D1', oSCL: '#181E10', pD: '#B4DB8C', oPD: '#233904', pCD: '#385419', oPCD: '#D0F8A5', sCD: '#43493B', oSCD: '#DFE5D1' },
        coral: { pL: '#D95232', oPL: '#FFFFFF', pCL: '#FFDBD1', oPCL: '#3C0800', sCL: '#FFDAD4', oSCL: '#410001', pD: '#FFB4A4', oPD: '#5E1600', pCD: '#852409', oPCD: '#FFDBD1', sCD: '#930005', oSCD: '#FFDAD4' },
        teal: { pL: '#006A7B', oPL: '#FFFFFF', pCL: '#A1F0FF', oPCL: '#001F25', sCL: '#BDEAEF', oSCL: '#002023', pD: '#50D8EE', oPD: '#00363F', pCD: '#004F5C', oPCD: '#A1F0FF', sCD: '#324B4E', oSCD: '#BDEAEF' },
        lavender: { pL: '#5E17EB', oPL: '#FFFFFF', pCL: '#E7DEFF', oPCL: '#1B0061', sCL: '#E5DFF9', oSCL: '#1A152C', pD: '#CBBBFF', oPD: '#30009B', pCD: '#4600BD', oPCD: '#E7DEFF', sCD: '#47435B', oSCD: '#E5DFF9' },
        rose: { pL: '#BE123C', oPL: '#FFFFFF', pCL: '#FFD9DF', oPCL: '#3F0010', sCL: '#FFD9DE', oSCL: '#3F0014', pD: '#FFB2C0', oPD: '#67001E', pCD: '#8E002B', oPCD: '#FFD9DF', sCD: '#8E0026', oSCD: '#FFD9DE' },
        lime: { pL: '#4C6A00', oPL: '#FFFFFF', pCL: '#C9F667', oPCL: '#141F00', sCL: '#E0E5D0', oSCL: '#1A1E11', pD: '#AED94E', oPD: '#263500', pCD: '#394D00', oPCD: '#C9F667', sCD: '#45483B', oSCD: '#E0E5D0' },
        sand: { pL: '#8D6E63', oPL: '#FFFFFF', pCL: '#FFDBCE', oPCL: '#351000', sCL: '#F5DED6', oSCL: '#2B1610', pD: '#FFB59B', oPD: '#55200D', pCD: '#753420', oPCD: '#FFDBCE', sCD: '#5C4037', oSCD: '#F5DED6' },
        monochrome: { pL: '#37474F', oPL: '#FFFFFF', pCL: '#CFE6F1', oPCL: '#001E2A', sCL: '#D3E4ED', oSCL: '#0B1D25', pD: '#90CCDF', oPD: '#003546', pCD: '#004D64', oPCD: '#CFE6F1', sCD: '#435158', oSCD: '#D3E4ED' },
        blueberry: { pL: '#1A237E', oPL: '#FFFFFF', pCL: '#DEE0FF', oPCL: '#000865', sCL: '#DFE0FD', oSCL: '#161A36', pD: '#BBC3FF', oPD: '#001099', pCD: '#0018C8', oPCD: '#DEE0FF', sCD: '#414560', oSCD: '#DFE0FD' }
    };
    const c = pal[key] || pal.orchid;
    root.style.setProperty('--md-sys-color-primary', dark ? c.pD : c.pL);
    root.style.setProperty('--md-sys-color-on-primary', dark ? c.oPD : c.oPL);
    root.style.setProperty('--md-sys-color-primary-container', dark ? c.pCD : c.pCL);
    root.style.setProperty('--md-sys-color-on-primary-container', dark ? c.oPCD : c.oPCL);
    root.style.setProperty('--md-sys-color-secondary-container', dark ? c.sCD : c.sCL);
    root.style.setProperty('--md-sys-color-on-secondary-container', dark ? c.oSCD : c.oSCL);
    
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if(themeColorMeta) themeColorMeta.setAttribute('content', getComputedStyle(root).getPropertyValue('--md-sys-color-background').trim());
}

window.changeTypo = function(type, val) {
    localStorage.setItem(`typo-${type}`, val);
    applyTypoSettings();
}

function applyTypoSettings() {
    const root = document.documentElement;
    root.style.setProperty('--reader-font', localStorage.getItem('typo-font') || '"Lora", serif');
    root.style.setProperty('--reader-size', localStorage.getItem('typo-size') || '1.2rem');
    root.style.setProperty('--reader-align', localStorage.getItem('typo-align') || 'left');
    
    const thm = localStorage.getItem('reader-theme') || 'light';
    ['light', 'dark', 'amoled'].forEach(t => document.getElementById(`theme-btn-${t}`).classList.remove('nav-active'));
    document.getElementById(`theme-btn-${thm}`).classList.add('nav-active');
    
    ['1rem', '1.2rem', '1.5rem'].forEach(s => {
        let sid = s === '1rem' ? 'sm' : (s === '1.2rem' ? 'md' : 'lg');
        document.getElementById(`typo-sz-${sid}`).classList.remove('nav-active');
    });
    let curSz = localStorage.getItem('typo-size') || '1.2rem';
    let sid = curSz === '1rem' ? 'sm' : (curSz === '1.2rem' ? 'md' : 'lg');
    document.getElementById(`typo-sz-${sid}`).classList.add('nav-active');
    
    ['left', 'center', 'justify'].forEach(a => document.getElementById(`typo-al-${a}`).classList.remove('nav-active'));
    document.getElementById(`typo-al-${localStorage.getItem('typo-align') || 'left'}`).classList.add('nav-active');
    
    ['Lora', 'Merriweather', 'Playfair Display', 'Inter', 'Space Mono', 'Google Sans Flex'].forEach(f => {
        let fid = f.split(' ')[0].toLowerCase().replace('google', 'google');
        if(document.getElementById(`typo-fn-${fid}`)) {
            document.getElementById(`typo-fn-${fid}`).classList.remove('bg-m3-primary', 'text-m3-onPrimary');
            document.getElementById(`typo-fn-${fid}`).classList.add('bg-m3-surface', 'text-m3-onSurface');
        }
    });
    let curFont = localStorage.getItem('typo-font') || 'Lora';
    let fid = curFont.split(' ')[0].toLowerCase().replace('google', 'google');
    if(document.getElementById(`typo-fn-${fid}`)) {
        document.getElementById(`typo-fn-${fid}`).classList.add('bg-m3-primary', 'text-m3-onPrimary');
        document.getElementById(`typo-fn-${fid}`).classList.remove('bg-m3-surface', 'text-m3-onSurface');
    }
}

window.setReaderTheme = function(thm) {
    localStorage.setItem('reader-theme', thm);
    applyTypoSettings();
    if(thm === 'light') { isDark = false; isAmoled = false; }
    else if(thm === 'dark') { isDark = true; isAmoled = false; }
    else if(thm === 'amoled') { isDark = true; isAmoled = true; }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    localStorage.setItem('amoled', isAmoled);
    applyThemeGlobal(currentThemeKey, isDark);
}

window.setWikiLang = function(lang) {
    wikiLang = lang;
    localStorage.setItem('wiki_lang', lang);
    applyI18n();
    document.getElementById('wiki-lang-id').classList.remove('nav-active');
    document.getElementById('wiki-lang-en').classList.remove('nav-active');
    document.getElementById(`wiki-lang-${lang}`).classList.add('nav-active');
    history.back();
}

function applyI18n() {
    if(typeof i18n === 'undefined') return;
    const d = i18n[wikiLang] || i18n['id'];
    
    const set = (id, key) => { const el = document.getElementById(id); if(el && d[key]) el.textContent = d[key]; };
    
    set('global-search', 'searchPlaceholder');
    set('str-continue-reading', 'continueReading');
    set('str-pinned-books', 'pinnedBooks');
    set('str-book-collection', 'bookCollection');
    set('str-lib-empty', 'libEmpty');
    set('str-nav-back', 'navBack'); set('str-nav-toc', 'navToc'); set('str-nav-bookmark', 'navBookmark'); set('str-nav-text', 'navText'); set('str-nav-full', 'navFull');
    set('str-reader-loading', 'readerLoading');
    set('str-toc-title', 'tocTitle'); set('str-bookmark-title', 'navBookmark'); set('str-set-title', 'setTitle');
    set('str-set-search', 'search'); set('str-set-theme', 'setTheme'); set('str-set-size', 'setSize'); set('str-set-align', 'setAlign'); set('str-set-font', 'setFont');
    set('str-ai-title', 'aiTitle'); set('str-ai-loading', 'aiLoading');
    set('str-bookmark-empty', 'bookmarkEmpty');
    set('str-wel-title', 'welTitle'); set('str-wel-desc', 'welDesc'); set('str-wel-backup', 'welBackup'); set('str-wel-backup-desc', 'welBackupDesc'); set('str-wel-format', 'welFormat'); set('str-wel-format-desc', 'welFormatDesc'); set('str-wel-privacy', 'welPrivacy'); set('str-wel-privacy-desc', 'welPrivacyDesc'); set('str-wel-btn', 'welBtn');
    set('str-set-main-title', 'settings'); set('str-set-palette', 'setPalette'); set('str-set-lang', 'setLang'); set('str-set-data', 'setData'); set('str-set-info', 'setInfo'); set('str-btn-backup', 'btnBackup'); set('str-btn-restore', 'btnRestore'); set('str-btn-info', 'btnInfo'); set('str-btn-update', 'btnUpdate'); set('str-btn-donate', 'btnDonate'); set('str-btn-close', 'btnClose');
    set('str-raw-bak-title', 'rawBakTitle'); set('str-raw-bak-desc', 'rawBakDesc'); set('str-raw-bak-btn-copy', 'rawBakCopy'); set('str-raw-bak-btn-close', 'rawBakClose');
    set('str-raw-res-title', 'rawResTitle'); set('str-raw-res-desc', 'rawResDesc'); set('str-raw-res-btn-file', 'rawResFile'); set('str-raw-res-btn-process', 'rawResProcess'); set('str-raw-res-btn-close', 'rawResClose');
    set('str-edit-title', 'editTitle'); set('str-edit-book-title', 'editBookTitle'); set('str-edit-book-cover', 'editBookCover'); set('str-edit-book-shape', 'editBookShape'); set('str-edit-cancel', 'editCancel'); set('str-edit-save', 'editSave');
    set('str-opt-select', 'optSelect'); set('str-opt-edit', 'optEdit'); set('str-opt-delete', 'optDelete'); set('str-opt-cancel', 'optCancel');
    set('str-bookmark-cancel', 'editCancel'); set('str-bookmark-save', 'editSave');
    
    document.getElementById(`wiki-lang-${wikiLang}`).classList.add('nav-active');
    
    const inpSearch = document.getElementById('inbook-search-input');
    if(inpSearch && d.searchPlaceholder) inpSearch.placeholder = d.searchPlaceholder;
}


// 7. FULLSCREEN LOGIC
window.toggleFullscreenReading = function() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {});
        document.getElementById('reader-floating-header').classList.add('-translate-y-full', 'opacity-0');
        document.getElementById('reader-bottom-bar').classList.add('translate-y-full');
    } else {
        document.exitFullscreen();
        document.getElementById('reader-floating-header').classList.remove('-translate-y-full', 'opacity-0');
        document.getElementById('reader-bottom-bar').classList.remove('translate-y-full');
    }
}
document.addEventListener('fullscreenchange', () => {
    const isFull = !!document.fullscreenElement;
    document.getElementById('reader-floating-header').classList.toggle('-translate-y-full', isFull);
    document.getElementById('reader-floating-header').classList.toggle('opacity-0', isFull);
    document.getElementById('reader-bottom-bar').classList.toggle('translate-y-full', isFull);
});

// 8. BACKUP & RESTORE DATA (NATIVE OPTIMIZED)
window.exportData = async function() {
    const d = typeof i18n !== 'undefined' ? (i18n[wikiLang] || i18n['id']) : {};
    try {
        const master = await localforage.getItem('pdf_epub_master') || [];
        // Kita juga harus backup konten yang dipisah (nodes)
        let fullData = [...master];
        
        showDialog("Memproses Backup...", "Harap tunggu, sedang menggabungkan data buku.", "loader", []);
        
        for (let i = 0; i < fullData.length; i++) {
            if (fullData[i].hasSeparateContent) {
                const nodes = await localforage.getItem(`book_content_${fullData[i].id}`);
                if (nodes) fullData[i].nodes = nodes; // Gabungin sementara buat dibackup
            }
        }
        
        const dataStr = JSON.stringify(fullData);
        history.back(); // Tutup dialog loader
        
        setTimeout(() => {
            document.getElementById('raw-backup-textarea').value = dataStr;
            pushAppHistory('raw-backup-modal');
            openModalRaw('raw-backup-modal', 'raw-backup-sheet');
        }, 300);
        
    } catch(e) {
        history.back();
        setTimeout(() => showDialog("Error Backup", e.message, "alert-triangle", [{text:"Tutup"}]), 300);
    }
}

window.copyRawBackup = function() {
    const ta = document.getElementById('raw-backup-textarea');
    ta.select(); document.execCommand('copy');
    showDialog("Berhasil!", "Teks backup telah disalin ke clipboard.", "check-circle", [{text: "Ok", primary: true}]);
}

window.openRestoreOptions = function() {
    document.getElementById('raw-restore-textarea').value = '';
    pushAppHistory('raw-restore-modal');
    openModalRaw('raw-restore-modal', 'raw-restore-sheet');
}

window.processRawRestore = async function() {
    const val = document.getElementById('raw-restore-textarea').value.trim();
    if(!val) return;
    try {
        const data = JSON.parse(val);
        if(Array.isArray(data)) {
            showDialog("Memulihkan Data...", "Harap tunggu.", "loader", []);
            
            // Pisahin lagi pas restore
            for (let i = 0; i < data.length; i++) {
                if (data[i].nodes && data[i].nodes.length > 0) {
                    await localforage.setItem(`book_content_${data[i].id}`, data[i].nodes);
                    delete data[i].nodes; // Hapus dari master biar enteng
                    data[i].hasSeparateContent = true;
                }
            }
            
            await localforage.setItem('pdf_epub_master', data);
            library = data;
            
            history.back(); // Tutup loader
            setTimeout(() => {
                _closeModalAction('raw-restore-modal', 'raw-restore-sheet', true);
                renderLibrary();
                showDialog("Berhasil", "Data berhasil dipulihkan.", "check-circle", [{text: "Tutup", primary: true}]);
            }, 300);
        } else { throw new Error("Format tidak valid."); }
    } catch(e) { showDialog("Gagal Restore", "Teks JSON tidak valid.", "alert-triangle", [{text: "Tutup"}]); }
}

window.importDataFile = function(e) {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('raw-restore-textarea').value = e.target.result;
    };
    reader.readAsText(file);
}

// 9. GEMINI AI CONFIG
window.saveGeminiKey = function() {
    const key = document.getElementById('gemini-api-key').value.trim();
    localStorage.setItem('gemini_api_key', key);
    const d = typeof i18n !== 'undefined' ? (i18n[wikiLang] || i18n['id']) : {};
    showDialog("Berhasil", d.keySaved || "API Key berhasil disimpan.", "check-circle", [{text: "Ok", primary: true}]);
}
window.saveGeminiModel = function() {
    const mod = document.getElementById('gemini-model-select').value;
    localStorage.setItem('gemini_model', mod);
}

// 10. OTA UPDATER (GitHub JSON)
window.checkForUpdate = async function() {
    const btn = document.getElementById('btn-update-app');
    const icon = document.getElementById('icon-update-app');
    if(!btn || !icon) return;
    
    icon.classList.add('animate-spin');
    
    try {
        const res = await fetch(window.UPDATE_URL);
        const data = await res.json();
        icon.classList.remove('animate-spin');
        
        if (data.version && data.version !== window.APP_VERSION) {
            showDialog("Pembaruan Tersedia!", `Versi baru (${data.version}) tersedia. Lakukan pembaruan untuk fitur terbaik.`, "download-cloud", [
                { text: "Nanti" },
                { text: "Download", primary: true, action: () => window.open(window.RELEASES_URL, '_blank') }
            ]);
        } else {
            showDialog("Sudah Terbaru", "Anda menggunakan versi paling mutakhir.", "check-circle", [{text: "Tutup"}]);
        }
    } catch(e) {
        icon.classList.remove('animate-spin');
        showDialog("Error", "Gagal mengecek pembaruan.", "wifi-off", [{text: "Tutup"}]);
    }
}
setTimeout(() => {
    const vEl = document.getElementById('app-version-display');
    if(vEl) vEl.textContent = `v${window.APP_VERSION}`;
}, 500);

// 11. HARDWARE BACK BUTTON (ROUTING HISTORY)
let appHistory = ['library'];

window.pushAppHistory = function(state) {
    if (appHistory[appHistory.length - 1] === state) return;
    appHistory.push(state);
    window.history.pushState({page: state}, '');
}

function handleHardwareBack(event) {
    if (appHistory.length <= 1) return;
    const currentState = appHistory.pop();
    
    if (currentState.startsWith('panel-')) _executeClosePanel();
    else if (currentState === 'reader') closeReader();
    else if (currentState === 'b-opt-modal') _closeModalAction('b-opt-modal', 'b-opt-sheet', false);
    else if (currentState === 'edit-modal') _closeModalAction('edit-modal', 'edit-sheet', false);
    else if (currentState === 'global-settings-modal') _closeModalAction('global-settings-modal', 'global-settings-sheet', false);
    else if (currentState === 'welcome-modal') _closeModalAction('welcome-modal', 'welcome-sheet', false);
    else if (currentState === 'raw-backup-modal') _closeModalAction('raw-backup-modal', 'raw-backup-sheet', false);
    else if (currentState === 'raw-restore-modal') _closeModalAction('raw-restore-modal', 'raw-restore-sheet', false);
    else if (currentState === 'bookmark-modal') _closeModalAction('bookmark-modal', 'bookmark-sheet', false);
    else if (currentState === 'ai-modal') window.closeAiModal(true);
}

// 12. UTILITY MODALS & DIALOGS
window.openModal = function(mId, sId, avoidHistory = false) {
    if(!avoidHistory) pushAppHistory(mId);
    openModalRaw(mId, sId);
}

function openModalRaw(mId, sId) {
    const m = document.getElementById(mId); const s = document.getElementById(sId);
    m.classList.remove('hidden');
    requestAnimationFrame(() => { m.classList.remove('opacity-0'); s.classList.remove('translate-y-full', 'scale-75', 'translate-y-12'); });
}

window.closeWelcome = function() {
    localStorage.setItem('welcome_seen_v2', 'true');
    history.back();
}
window.closeEditModal = function() { history.back(); }

window._closeModalAction = function(mId, sId, avoidHistoryPop = false) {
    if(avoidHistoryPop) history.back();
    else {
        const m = document.getElementById(mId); const s = document.getElementById(sId);
        m.classList.add('opacity-0'); 
        if(s.classList.contains('translate-y-full')) s.classList.add('translate-y-full'); else s.classList.add('scale-75', 'translate-y-12');
        setTimeout(() => m.classList.add('hidden'), 300);
    }
}

if (!localStorage.getItem('welcome_seen_v2')) {
    setTimeout(() => { openModal('welcome-modal', 'welcome-sheet'); }, 1000);
}

window.showDialog = function(title, message, iconName = 'info', actions = []) {
    const d = document.getElementById('custom-dialog');
    const s = document.getElementById('custom-dialog-sheet');
    const actContainer = document.getElementById('dialog-actions');
    
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-message').textContent = message;
    
    const iconEl = document.getElementById('dialog-icon');
    if (iconName === 'loader') {
        iconEl.outerHTML = `<div id="dialog-icon" class="w-5 h-5 border-2 border-m3-onPrimaryContainer border-t-transparent rounded-full animate-spin"></div>`;
    } else {
        iconEl.outerHTML = `<i id="dialog-icon" data-lucide="${iconName}" class="w-5 h-5"></i>`;
        if(window.lucide) window.lucide.createIcons();
    }
    
    actContainer.innerHTML = '';
    if (actions.length === 0) actions = [{ text: "Ok", primary: true }];
    
    actions.forEach(act => {
        const btn = document.createElement('button');
        btn.className = `px-5 py-2.5 font-bold rounded-full btn-morph text-sm `;
        if (act.danger) btn.className += `bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400`;
        else if (act.primary) btn.className += `bg-m3-primary text-m3-onPrimary`;
        else btn.className += `bg-transparent text-m3-onSurface`;
        
        btn.textContent = act.text;
        btn.onclick = () => {
            if(act.action) act.action();
            d.classList.add('opacity-0'); s.classList.add('scale-75');
            setTimeout(() => d.classList.add('hidden'), 300);
        };
        actContainer.appendChild(btn);
    });
    
    d.classList.remove('hidden');
    requestAnimationFrame(() => { d.classList.remove('opacity-0'); s.classList.remove('scale-75'); });
}

// 13. PWA SETUP
if ('serviceWorker' in navigator) {
    const swCode = `
    const CACHE_NAME = 'baca-pwa-v6';
    self.addEventListener('install', (e) => {
        self.skipWaiting();
        e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll([
            '/', 'libs/pdf.min.js', 'libs/pdf.worker.min.js', 'libs/localforage.min.js', 'libs/jszip.min.js', 'libs/lucide.js',
            'css/output.css', 'js/config.js', 'js/reader.js', 'js/app.js'
       ])));
    });
    self.addEventListener('fetch', (e) => { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))); });
    `;
    const blob = new Blob([swCode], {type: 'application/javascript'});
    navigator.serviceWorker.register(URL.createObjectURL(blob)).catch(err => console.log("SW Error:", err));
}

// 14. INTERSECTION OBSERVER SETUP 
function setupIntersectionObserver() {}

