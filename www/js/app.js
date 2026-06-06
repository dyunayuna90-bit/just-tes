// --- APP LOGIC ---
// Mengurus interaksi UI, Tema, Render Library, & Fitur In-Book Bookmark Berwarna

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
let wikiLang = localStorage.getItem('wiki_lang') || 'en';

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
        content: document.getElementById('reader-inner'), 
        readerCont: document.getElementById('reader-content'),
        toc: document.getElementById('toc-list'), 
        progBar: document.getElementById('reading-progress-bar'),
        tocPanel: document.getElementById('toc-panel'),
        setPanel: document.getElementById('settings-panel'),
        bookmarkPanel: document.getElementById('bookmark-panel'),
        overlay: document.getElementById('side-panel-overlay'),
        readTitle: document.getElementById('reader-title'),
        progText: document.getElementById('reader-progress-text'),
        searchInput: document.getElementById('inbook-search-input'),
        searchResPanel: document.getElementById('search-results-panel'),
        globalSearch: document.getElementById('global-search'),
        searchIconLib: document.getElementById('search-icon-lib'),
        readerFloatingHeader: document.getElementById('reader-floating-header'),
        readerBottomBar: document.getElementById('reader-bottom-bar'),
        readerLoading: document.getElementById('reader-loading-overlay'),
        bookmarkList: document.getElementById('bookmark-list'),
        batchBar: document.getElementById('batch-delete-bar'),
        pinnedSection: document.getElementById('pinned-books-section'),
        pinnedGrid: document.getElementById('pinned-book-grid'),
        colHeading: document.getElementById('collection-heading')
    });

    lucide.createIcons();
    initTheme();
    applyLanguage();

    if (!localStorage.getItem('welcomed')) {
        setTimeout(() => openModal('welcome-modal', 'welcome-sheet', true), 500);
        localStorage.setItem('welcomed', 'true');
    }

    loadLibrary().then(() => { if (library.length > 0) renderLibrary(); });

    // Setup Observer untuk Progress Membaca
    observer = new IntersectionObserver((entries) => {
        if (!activeBookId) return;
        const visibleNodes = entries.filter(e => e.isIntersecting);
        if (visibleNodes.length > 0) {
            const firstNode = visibleNodes[0].target;
            const idx = Array.from(DOM.content.children).indexOf(firstNode);
            const total = DOM.content.children.length;
            const rawProgress = (idx / (total - 1)) * 100;
            const progress = isNaN(rawProgress) ? 100 : Math.min(100, Math.max(0, rawProgress));
            
            DOM.progBar.style.width = `${progress}%`;
            DOM.progText.textContent = `${Math.round(progress)}%`;
            updateBookProgress(activeBookId, idx, progress);
        }
    }, { root: DOM.readerCont, threshold: 0.1 });

    setupInteractions();
});

// 2. THEMING & UI LOGIC
function applyLanguage() {
    const d = i18n[wikiLang] || i18n['en'];
    const byId = (id, text) => { if(document.getElementById(id)) document.getElementById(id).innerHTML = text; };

    byId('str-lib-empty', d.libEmpty);
    if(DOM.globalSearch) DOM.globalSearch.placeholder = d.searchBooks;
    if(DOM.loadTxt) DOM.loadTxt.textContent = d.loadingDocs;
    byId('str-continue-reading', d.continueReading);
    byId('str-book-collection', d.bookCollection);
    byId('batch-delete-count', `0 ${d.selected}`);
    byId('btn-batch-cancel', d.cancel);
    byId('btn-batch-exec', d.delete);

    byId('str-pinned-books', d.pinnedBooks);
    byId('str-opt-pin', d.optPin);
    byId('str-opt-unpin', d.optUnpin);

    byId('str-nav-bookmark', d.navBookmark);
    byId('str-bookmark-title', `<i data-lucide="bookmark" class="w-5 h-5"></i> ${d.bookmarkTitle}`);
    byId('str-bookmark-empty', d.bookmarkEmpty);
    byId('str-bookmark-modal-title', `<i data-lucide="bookmark" class="w-5 h-5"></i> ${d.bookmarkModalTitle}`);
    if(document.getElementById('bookmark-input-title')) document.getElementById('bookmark-input-title').placeholder = d.bookmarkTitlePlaceholder;
    if(document.getElementById('bookmark-input-text')) document.getElementById('bookmark-input-text').placeholder = d.bookmarkNotePlaceholder;
    byId('str-bookmark-cancel', d.bookmarkCancel);
    byId('str-bookmark-save', d.bookmarkSave);

    byId('str-opt-select', d.optSelect);
    byId('str-opt-edit', d.optEdit);
    byId('str-opt-delete', d.optDelete);
    byId('str-opt-cancel', d.optCancel);

    byId('str-wel-title', d.welcomeTitle);
    byId('str-wel-desc', d.welcomeDesc);
    byId('str-wel-backup', d.welBackup);
    byId('str-wel-backup-desc', d.welBackupDesc);
    byId('str-wel-format', d.welFormat);
    byId('str-wel-format-desc', d.welFormatDesc);
    byId('str-wel-privacy', d.welPrivacy);
    byId('str-wel-privacy-desc', d.welPrivacyDesc);
    byId('str-wel-btn', d.welBtn);

    byId('str-set-main-title', d.setMainTitle);
    byId('str-set-palette', d.setPalette);
    byId('str-set-lang', d.setLang);
    byId('str-set-info', d.setInfo);
    byId('str-btn-info', d.btnInfo);
    byId('str-btn-update', d.btnUpdate);
    byId('str-btn-donate', d.btnDonate);
    byId('str-btn-close', d.btnClose);
    byId('str-set-data', d.setData);
    byId('str-btn-backup', d.btnBackup);
    byId('str-btn-restore', d.btnRestore);
    
    byId('str-nav-back', d.navBack);
    byId('str-nav-toc', d.navToc);
    if(DOM.searchInput) DOM.searchInput.placeholder = d.searchPlaceholder;
    byId('str-nav-text', d.navText);
    byId('str-nav-full', d.navFull);
    byId('str-reader-loading', d.readerLoading);
    byId('str-toc-title', `<i data-lucide="list-tree"></i> ${d.tocTitle}`);
    byId('str-set-title', `<i data-lucide="sliders-horizontal"></i> ${d.setTitle}`);
    
    byId('str-set-search', d.navSearch);
    byId('str-set-theme', d.setTheme);
    byId('str-set-size', d.setSize);
    byId('str-set-align', d.setAlign);
    byId('str-set-font', d.setFont);
    byId('str-ai-title', d.aiTitle);
    
    byId('str-edit-title', d.editTitle);
    byId('str-edit-book-title', d.editBookTitle);
    byId('str-edit-book-cover', d.editBookCover);
    byId('str-edit-book-shape', d.editBookShape);
    byId('str-edit-cancel', d.editCancel);
    byId('str-edit-save', d.editSave);
    
    byId('shape-default', d.shapeDyn);
    byId('shape-rounded', d.shapeRound);
    byId('shape-square', d.shapeSquare);
    
    byId('str-amoled-label', d.amoledLabel);

    byId('str-raw-bak-title', d.rawBakTitle);
    byId('str-raw-bak-desc', d.rawBakDesc);
    byId('str-raw-bak-btn-copy', d.rawBakCopy);
    byId('str-raw-bak-btn-close', d.rawBakClose);

    byId('str-raw-res-title', d.rawResTitle);
    byId('str-raw-res-desc', d.rawResDesc);
    byId('str-raw-res-btn-file', d.rawResFile);
    byId('str-raw-res-btn-process', d.rawResProcess);
    byId('str-raw-res-btn-close', d.rawResClose);
    
    byId('str-set-ai-config', d.setAiConfig);
    if(document.getElementById('gemini-api-key')) document.getElementById('gemini-api-key').placeholder = d.geminiPlaceholder;
    byId('gemini-desc', d.geminiDesc);

    byId('str-stat-title', d.statTitle);
    byId('str-stat-total', d.statTotal);
    byId('str-stat-reading', d.statReading);
    byId('str-stat-completed', d.statCompleted);
    byId('str-stat-notes', d.statNotes);

    updateThemeUI();
    syncWikiLangUI();
    lucide.createIcons();
}

function syncWikiLangUI() {
    const btns = ['id', 'en', 'es'];
    btns.forEach(lang => {
        const btn = document.getElementById(`wiki-lang-${lang}`);
        if(btn) {
            if(wikiLang === lang) {
                btn.classList.add('bg-m3-primary', 'text-m3-onPrimary');
                btn.classList.remove('text-m3-onSurfaceVariant');
            } else {
                btn.classList.remove('bg-m3-primary', 'text-m3-onPrimary');
                btn.classList.add('text-m3-onSurfaceVariant');
            }
        }
    });
}

function setWikiLang(lang) {
    wikiLang = lang;
    localStorage.setItem('wiki_lang', lang);
    applyLanguage();
}

function initTheme() {
    const savedAPIKey = localStorage.getItem('gemini_api_key');
    if (savedAPIKey) document.getElementById('gemini-api-key').value = savedAPIKey;
    
    const savedModel = localStorage.getItem('gemini_model');
    if (savedModel) document.getElementById('gemini-model-select').value = savedModel;

    document.getElementById('app-version-display').textContent = `v${window.APP_VERSION}`;
    
    // Perbaikan: Paksa tema awal mengikuti isDark tanpa toggle yang salah
    if(isDark) {
        document.documentElement.classList.add('dark');
        document.querySelector('meta[name="theme-color"]').setAttribute('content', '#1C1B1E');
    } else {
        document.documentElement.classList.remove('dark');
        document.querySelector('meta[name="theme-color"]').setAttribute('content', '#FFFDF9');
    }

    applyPalette(currentThemeKey);
    updateThemeUI();
    syncAmoledUI();

    // Reader UI Init
    const savedBg = localStorage.getItem('reader-bg') || (isDark ? 'dark' : 'light');
    if (savedBg === 'amoled') {
        DOM.readView.style.backgroundColor = '#000000';
    } else {
        DOM.readView.style.backgroundColor = 'var(--md-sys-color-background)';
    }

    syncThemeBtns(savedBg);

    const savedSize = localStorage.getItem('reader-size') || '1.2rem';
    const savedAlign = localStorage.getItem('reader-align') || 'left';
    const savedFont = localStorage.getItem('reader-font') || 'Lora';
    
    document.documentElement.style.setProperty('--reader-size', savedSize);
    document.documentElement.style.setProperty('--reader-align', savedAlign);
    document.documentElement.style.setProperty('--reader-font', savedFont);

    syncTypoBtns('size', savedSize);
    syncTypoBtns('align', savedAlign);
    syncTypoBtns('font', savedFont);
}

function applyPalette(key) {
    const colors = M3_PALETTES[key] || M3_PALETTES['orchid'];
    document.getElementById('dynamic-theme').textContent = `:root { ${colors.light} } .dark { ${colors.dark} }`;
    
    // Update theme-color berdasarkan palet aktif
    const div = document.createElement('div');
    div.style.backgroundColor = 'var(--md-sys-color-background)';
    document.body.appendChild(div);
    const bgColor = getComputedStyle(div).backgroundColor;
    document.body.removeChild(div);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', bgColor);
}

function setTheme(key) {
    currentThemeKey = key;
    localStorage.setItem('m3-key', key);
    applyPalette(key);
}

function updateThemeUI() {
    const text = document.getElementById('theme-label-text');
    const bg = document.getElementById('theme-switch-bg');
    const knob = document.getElementById('theme-switch-knob');
    const icon = document.getElementById('theme-switch-icon');
    const amoledToggle = document.getElementById('amoled-toggle-container');
    const d = i18n[wikiLang] || i18n['en'];

    if (isDark) {
        text.textContent = d.themeDark;
        bg.classList.replace('bg-m3-onSurfaceVariant/20', 'bg-m3-primary');
        knob.style.transform = 'translateX(32px)';
        knob.classList.replace('bg-m3-surface', 'bg-m3-onPrimary');
        icon.setAttribute('data-lucide', 'moon');
        icon.classList.replace('text-m3-onSurface', 'text-m3-primary');
        amoledToggle.classList.remove('hidden');
    } else {
        text.textContent = d.themeLight;
        bg.classList.replace('bg-m3-primary', 'bg-m3-onSurfaceVariant/20');
        knob.style.transform = 'translateX(0)';
        knob.classList.replace('bg-m3-onPrimary', 'bg-m3-surface');
        icon.setAttribute('data-lucide', 'sun');
        icon.classList.replace('text-m3-primary', 'text-m3-onSurface');
        amoledToggle.classList.add('hidden');
        if(isAmoled) {
            isAmoled = false;
            localStorage.setItem('amoled', 'false');
            syncAmoledUI();
            DOM.readView.style.backgroundColor = 'var(--md-sys-color-background)';
            localStorage.setItem('reader-bg', 'light');
            syncThemeBtns('light');
        }
    }
    lucide.createIcons();
}

function toggleThemeState() {
    isDark = !isDark;
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    
    if(!isDark && isAmoled) {
        isAmoled = false;
        localStorage.setItem('amoled', 'false');
        syncAmoledUI();
    }
    
    updateThemeUI();
    applyPalette(currentThemeKey);

    const savedBg = isDark ? (isAmoled ? 'amoled' : 'dark') : 'light';
    localStorage.setItem('reader-bg', savedBg);
    if (savedBg === 'amoled') {
        DOM.readView.style.backgroundColor = '#000000';
    } else {
        DOM.readView.style.backgroundColor = 'var(--md-sys-color-background)';
    }
    syncThemeBtns(savedBg);
}

function syncAmoledUI() {
    const bg = document.getElementById('amoled-switch-bg');
    const knob = document.getElementById('amoled-switch-knob');
    if (isAmoled) {
        bg.classList.add('bg-m3-primary');
        bg.classList.remove('bg-m3-onSurfaceVariant/20');
        knob.style.transform = 'translateX(32px)';
        knob.classList.add('bg-m3-onPrimary');
        knob.classList.remove('bg-m3-onSurface');
    } else {
        bg.classList.remove('bg-m3-primary');
        bg.classList.add('bg-m3-onSurfaceVariant/20');
        knob.style.transform = 'translateX(0)';
        knob.classList.remove('bg-m3-onPrimary');
        knob.classList.add('bg-m3-onSurface');
    }
}

function toggleAmoled() {
    if (!isDark) return;
    isAmoled = !isAmoled;
    localStorage.setItem('amoled', isAmoled.toString());
    syncAmoledUI();
    
    if (isAmoled) {
        DOM.readView.style.backgroundColor = '#000000';
        localStorage.setItem('reader-bg', 'amoled');
        syncThemeBtns('amoled');
    } else {
        DOM.readView.style.backgroundColor = 'var(--md-sys-color-background)';
        localStorage.setItem('reader-bg', 'dark');
        syncThemeBtns('dark');
    }
}

function setReaderTheme(type) {
    if (type === 'light') {
        if(isDark) toggleThemeState(); 
    } else if (type === 'dark') {
        if(!isDark) toggleThemeState();
        if(isAmoled) toggleAmoled(); 
    } else if (type === 'amoled') {
        if(!isDark) toggleThemeState();
        if(!isAmoled) toggleAmoled();
    }
}

function syncThemeBtns(active) {
    ['light', 'dark', 'amoled'].forEach(t => {
        const btn = document.getElementById(`theme-btn-${t}`);
        if(btn) {
            if (t === active) btn.classList.add('bg-m3-primary', 'text-m3-onPrimary');
            else btn.classList.remove('bg-m3-primary', 'text-m3-onPrimary');
        }
    });
}

function changeTypo(type, val) {
    localStorage.setItem(`reader-${type}`, val);
    document.documentElement.style.setProperty(`--reader-${type}`, val);
    syncTypoBtns(type, val);
}

function syncTypoBtns(type, active) {
    const map = {
        'size': {'1rem':'sm', '1.2rem':'md', '1.5rem':'lg'},
        'align': {'left':'left', 'center':'center', 'justify':'justify'},
        'font': {'Lora':'lora', 'Merriweather':'merri', 'Playfair Display':'playfair', 'Inter':'inter', 'Space Mono':'mono', 'Google Sans Flex':'google'}
    };
    if(!map[type]) return;
    
    Object.keys(map[type]).forEach(k => {
        const id = `typo-${type.substring(0,2)}-${map[type][k]}`;
        const btn = document.getElementById(id);
        if(btn) {
            if (k === active) {
                if(type === 'font') {
                    btn.classList.add('bg-m3-primaryContainer', 'text-m3-onPrimaryContainer');
                    btn.classList.remove('bg-m3-surface');
                } else {
                    btn.classList.add('bg-m3-primary', 'text-m3-onPrimary');
                }
            } else {
                if(type === 'font') {
                    btn.classList.remove('bg-m3-primaryContainer', 'text-m3-onPrimaryContainer');
                    btn.classList.add('bg-m3-surface');
                } else {
                    btn.classList.remove('bg-m3-primary', 'text-m3-onPrimary');
                }
            }
        }
    });
}

// 3. STORAGE & RENDER LIBRARY
async function loadLibrary() {
    try {
        const keys = await localforage.keys();
        library = [];
        for (let k of keys) {
            if (k.startsWith('book_')) {
                const book = await localforage.getItem(k);
                if (book) {
                    if(!book.bookmarks) book.bookmarks = []; // Migrasi array bookmark
                    library.push(book);
                }
            }
        }
        library.sort((a,b) => b.lastRead - a.lastRead);
        updateStatistics(); // Update stat tiap kali load
    } catch(e) { console.error("Load Lib Error", e); }
}

function updateStatistics() {
    const total = library.length;
    let reading = 0;
    let completed = 0;
    let notes = 0;

    library.forEach(b => {
        if(b.progress > 0 && b.progress < 100) reading++;
        if(b.progress === 100) completed++;
        if(b.bookmarks && b.bookmarks.length > 0) notes += b.bookmarks.length;
    });

    document.getElementById('stat-val-total').textContent = total;
    document.getElementById('stat-val-reading').textContent = reading;
    document.getElementById('stat-val-completed').textContent = completed;
    document.getElementById('stat-val-notes').textContent = notes;
}


function renderLibrary(query = '') {
    DOM.grid.innerHTML = '';
    DOM.topSlider.innerHTML = '';
    DOM.pinnedGrid.innerHTML = '';
    
    if (library.length === 0) {
        DOM.empty.classList.remove('hidden');
        DOM.topSection.classList.add('hidden');
        DOM.pinnedSection.classList.add('hidden');
        DOM.colHeading.classList.add('hidden');
        return;
    }
    DOM.empty.classList.add('hidden');

    const filtered = query ? library.filter(b => b.title.toLowerCase().includes(query.toLowerCase())) : library;
    
    // Sort logic
    const pinnedBooks = filtered.filter(b => b.isPinned).sort((a,b) => b.lastRead - a.lastRead);
    const unpinnedBooks = filtered.filter(b => !b.isPinned).sort((a,b) => b.lastRead - a.lastRead);

    // Render Pinned Books
    if (pinnedBooks.length > 0 && !query) {
        DOM.pinnedSection.classList.remove('hidden');
        pinnedBooks.forEach(b => DOM.pinnedGrid.appendChild(createBookCard(b)));
    } else {
        DOM.pinnedSection.classList.add('hidden');
    }

    // Render Recent Books di Slider (hanya yg ada progress, unpinned)
    const recentBooks = unpinnedBooks.filter(b => b.progress > 0).slice(0, 5);
    if (recentBooks.length > 0 && !query) {
        DOM.topSection.classList.remove('hidden');
        recentBooks.forEach(b => DOM.topSlider.appendChild(createBookCard(b, true)));
    } else {
        DOM.topSection.classList.add('hidden');
    }

    // Render Regular Collection
    if (unpinnedBooks.length > 0) {
        DOM.colHeading.classList.remove('hidden');
        unpinnedBooks.forEach(b => DOM.grid.appendChild(createBookCard(b)));
    } else {
        DOM.colHeading.classList.add('hidden');
    }

    if(filtered.length === 0 && query) {
        DOM.empty.classList.remove('hidden');
        DOM.colHeading.classList.add('hidden');
    }
}


function createBookCard(book, isSlider = false) {
    const div = document.createElement('div');
    const shape = book.shape || 'square';
    
    let shapeClass = 'rounded-2xl'; // default fallback
    if (shape === 'rounded') shapeClass = 'rounded-[2rem]';
    else if (shape === 'square') shapeClass = 'rounded-lg';
    
    if (isSlider) {
        div.className = `book-card min-w-[130px] w-[130px] shrink-0 snap-center relative group active:scale-95 transition-transform duration-300`;
        div.innerHTML = `
            <div class="relative w-full aspect-[2/3] ${shapeClass} shadow-md overflow-hidden bg-m3-surfaceVariant border-none">
                ${book.cover ? `<img src="${book.cover}" class="w-full h-full object-cover select-none pointer-events-none" loading="lazy">` : `<div class="w-full h-full flex flex-col items-center justify-center p-3 text-center"><i data-lucide="book" class="w-6 h-6 mb-2 text-m3-onSurfaceVariant/50"></i><span class="text-[9px] font-bold text-m3-onSurfaceVariant/70 uppercase tracking-widest line-clamp-2 leading-tight">${book.title}</span></div>`}
                <div class="absolute inset-0 bg-black/10 opacity-0 group-active:opacity-100 transition-opacity"></div>
                <div class="absolute bottom-0 left-0 w-full h-1.5 bg-black/30 backdrop-blur-sm">
                    <div class="h-full bg-m3-primary progress-smooth" style="width: ${book.progress}%"></div>
                </div>
            </div>
            <p class="mt-2 text-xs font-bold truncate px-1 text-m3-onBg">${book.title}</p>
        `;
    } else {
        div.className = `book-card relative group active:scale-95 transition-transform duration-300 ${isBatchDeleteMode ? 'cursor-pointer' : ''}`;
        div.onclick = (e) => {
            if (isBatchDeleteMode) {
                toggleSelection(div, book.id);
            } else {
                openBook(book.id);
            }
        };
        div.oncontextmenu = (e) => {
            e.preventDefault();
            if (!isBatchDeleteMode) {
                navigator.vibrate && navigator.vibrate(50);
                openBookOptions(book.id);
            }
        };
        // Tambahkan event touch long press untuk mobile
        let touchTimer;
        div.addEventListener('touchstart', (e) => {
            if (isBatchDeleteMode) return;
            touchTimer = setTimeout(() => {
                navigator.vibrate && navigator.vibrate(50);
                openBookOptions(book.id);
            }, 600);
        }, {passive: true});
        div.addEventListener('touchend', () => clearTimeout(touchTimer));
        div.addEventListener('touchmove', () => clearTimeout(touchTimer));

        div.innerHTML = `
            <div class="relative w-full aspect-[2/3] ${shapeClass} shadow-md overflow-hidden bg-m3-surfaceVariant border-none transition-all duration-300 ring-0 ring-m3-primary ring-offset-2 ring-offset-m3-bg book-ring">
                ${book.cover ? `<img src="${book.cover}" class="w-full h-full object-cover select-none pointer-events-none" loading="lazy">` : `<div class="w-full h-full flex flex-col items-center justify-center p-3 text-center"><i data-lucide="book" class="w-6 h-6 mb-2 text-m3-onSurfaceVariant/50"></i><span class="text-[9px] font-bold text-m3-onSurfaceVariant/70 uppercase tracking-widest line-clamp-2 leading-tight">${book.title}</span></div>`}
                <div class="absolute inset-0 bg-black/10 opacity-0 group-active:opacity-100 transition-opacity pointer-events-none"></div>
                <div class="absolute bottom-0 left-0 w-full h-1 bg-black/20 backdrop-blur-sm pointer-events-none">
                    <div class="h-full bg-m3-primary progress-smooth" style="width: ${book.progress}%"></div>
                </div>
                ${book.isPinned ? `<div class="absolute top-2 right-2 w-6 h-6 bg-m3-primaryContainer rounded-full flex items-center justify-center shadow-sm pointer-events-none"><i data-lucide="pin" class="w-3 h-3 text-m3-onPrimaryContainer"></i></div>` : ''}
            </div>
            <p class="mt-2 text-xs font-bold text-m3-onBg truncate px-1">${book.title}</p>
            <p class="text-[9px] opacity-60 font-bold uppercase tracking-wider px-1 mt-0.5">${book.progress}% • ${book.nodes.length} Hal</p>
            <div class="absolute -top-2 -right-2 w-6 h-6 bg-m3-primary text-m3-onPrimary rounded-full items-center justify-center z-10 scale-0 transition-transform duration-300 check-icon shadow-md pointer-events-none">
                <i data-lucide="check" class="w-4 h-4"></i>
            </div>
        `;
    }

    if (isSlider) div.onclick = () => openBook(book.id);
    return div;
}

// 4. UI INTERACTIONS (Scroll, Search, Header)
function setupInteractions() {
    // Hide/Show Header Library on Scroll
    const scrollArea = document.getElementById('library-content-scroll');
    const header = DOM.mainHeader;
    const titleArea = document.getElementById('title-area');
    const searchArea = document.getElementById('search-area');
    const statSection = document.getElementById('statistics-section');
    let lastScroll = 0;

    scrollArea.addEventListener('scroll', () => {
        const currentScroll = scrollArea.scrollTop;
        if (currentScroll > 20) {
            header.classList.add('shadow-sm');
            titleArea.style.height = '0px';
            titleArea.style.opacity = '0';
            titleArea.style.overflow = 'hidden';
            titleArea.style.marginBottom = '0px';
            
            // Sembunyikan Statistik saat scroll
            if(statSection) {
                statSection.style.height = '0px';
                statSection.style.opacity = '0';
                statSection.style.margin = '0px';
            }
        } else {
            header.classList.remove('shadow-sm');
            titleArea.style.height = 'auto';
            titleArea.style.opacity = '1';
            titleArea.style.marginBottom = '1rem';

            // Munculkan Statistik
            if(statSection) {
                statSection.style.height = 'auto';
                statSection.style.opacity = '1';
                statSection.style.marginTop = '0.25rem';
                statSection.style.marginBottom = '2rem';
            }
        }
        lastScroll = currentScroll;
    }, {passive: true});

    // Global Search Library
    DOM.globalSearch.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (val) DOM.searchIconLib.classList.add('text-m3-primary', 'opacity-100');
        else DOM.searchIconLib.classList.remove('text-m3-primary', 'opacity-100');
        renderLibrary(val);
    });

    // Reader Reader In-Book Search
    DOM.searchInput.addEventListener('input', (e) => {
        clearTimeout(inbookSearchTimeout);
        const query = e.target.value.trim().toLowerCase();
        const d = i18n[wikiLang] || i18n['en'];
        
        if (!query) {
            DOM.searchResPanel.classList.add('hidden');
            DOM.searchResPanel.innerHTML = '';
            return;
        }

        inbookSearchTimeout = setTimeout(() => {
            const results = [];
            const book = library.find(b => b.id === activeBookId);
            if(book) {
                book.nodes.forEach((node, i) => {
                    const text = (node.text || "").toLowerCase();
                    if(text.includes(query)) {
                        const start = Math.max(0, text.indexOf(query) - 20);
                        const snippet = (node.text || "").substring(start, start + 60).replace(/</g, '&lt;');
                        results.push({ idx: i, snip: `...${snippet}...` });
                    }
                });
            }

            DOM.searchResPanel.innerHTML = '';
            if(results.length > 0) {
                results.slice(0, 20).forEach(r => {
                    const btn = document.createElement('button');
                    btn.className = "text-left p-3 hover:bg-m3-surfaceVariant rounded-xl transition-colors border-none btn-morph";
                    btn.innerHTML = `<div class="font-bold text-[10px] text-m3-primary mb-1 uppercase tracking-wider">Hal ${r.idx + 1}</div><div class="text-xs opacity-80 leading-relaxed font-medium">${r.snip}</div>`;
                    btn.onclick = () => {
                        jumpToNode(r.idx);
                        togglePanel(DOM.setPanel, 'settings', 'btn-settings');
                    };
                    DOM.searchResPanel.appendChild(btn);
                });
            } else {
                DOM.searchResPanel.innerHTML = `<div class="p-4 text-center opacity-50 font-bold">${d.searchNotFound}</div>`;
            }
            DOM.searchResPanel.classList.remove('hidden');
        }, 400);
    });

    // Text Selection Event for Highlight/Dictionary
    DOM.readerCont.addEventListener('selectionchange', handleTextSelection);
    document.addEventListener('selectionchange', handleTextSelection); // Fallback
}

// 5. HIGHLIGHT & TEXT SELECTION LOGIC
function handleTextSelection() {
    if (activePanel) return; // Jangan munculin menu kalau lagi buka panel

    const sel = window.getSelection();
    const menu = document.getElementById('selection-menu');

    if (!sel || sel.isCollapsed || sel.toString().trim().length === 0) {
        menu.classList.add('hidden', 'opacity-0', 'scale-75');
        menu.classList.remove('opacity-100', 'scale-100');
        menu.style.top = '-100px';
        return;
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Validasi apakah seleksi ada di dalam reader-inner
    let nodeEl = range.commonAncestorContainer;
    if (nodeEl.nodeType === 3) nodeEl = nodeEl.parentNode; // Get element from text node
    
    const wrapper = nodeEl.closest('.reader-node-wrapper');
    if (!wrapper) return; // Abaikan seleksi di luar area baca

    const nodeIdx = parseInt(wrapper.dataset.index);

    // Hitung offset relatif terhadap teks murni di dalam wrapper
    // Menggunakan TreeWalker untuk menghitung character offset
    let startOff = 0;
    let endOff = 0;
    const treeWalker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, null, false);
    let charCount = 0;
    let foundStart = false;
    let foundEnd = false;

    while (treeWalker.nextNode()) {
        const tNode = treeWalker.currentNode;
        if (!foundStart) {
            if (tNode === range.startContainer) {
                startOff = charCount + range.startOffset;
                foundStart = true;
            }
        }
        if (!foundEnd) {
            if (tNode === range.endContainer) {
                endOff = charCount + range.endOffset;
                foundEnd = true;
            }
        }
        charCount += tNode.length;
        if (foundStart && foundEnd) break;
    }

    currentSelection = {
        text: sel.toString().trim(),
        nodeIdx: nodeIdx,
        startOff: startOff,
        endOff: endOff
    };

    // Posisikan menu melayang di atas teks yang diblok
    const readerRect = DOM.readerCont.getBoundingClientRect();
    let top = rect.top - readerRect.top + DOM.readerCont.scrollTop - 60; 
    let left = rect.left + (rect.width / 2) - (menu.offsetWidth / 2);

    // Jaga agar menu tidak keluar layar
    if (left < 10) left = 10;
    if (left + menu.offsetWidth > window.innerWidth - 10) left = window.innerWidth - menu.offsetWidth - 10;
    if (top < DOM.readerCont.scrollTop + 80) top = rect.bottom - readerRect.top + DOM.readerCont.scrollTop + 10; // Geser ke bawah teks jika nyundul atas

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.classList.remove('hidden');
    
    // Animasi masuk
    requestAnimationFrame(() => {
        menu.classList.add('opacity-100', 'scale-100');
        menu.classList.remove('opacity-0', 'scale-75');
    });
}

function openBookmarkModal(color) {
    activeNoteColor = color;
    document.getElementById('bookmark-input-title').value = currentSelection.text.substring(0, 30) + "...";
    document.getElementById('bookmark-input-text').value = "";
    editingAnnotId = null;
    document.getElementById('btn-delete-bookmark').classList.add('hidden');
    
    // Clear selection biar rapi
    window.getSelection().removeAllRanges();
    document.getElementById('selection-menu').classList.add('hidden', 'opacity-0', 'scale-75');

    openModal('bookmark-modal', 'bookmark-sheet');
}

function saveBookmarkAnnotation() {
    if (!activeBookId) return;
    const title = document.getElementById('bookmark-input-title').value.trim();
    const note = document.getElementById('bookmark-input-text').value.trim();
    if (!title) return;

    const bookIdx = library.findIndex(b => b.id === activeBookId);
    if (bookIdx > -1) {
        if (!library[bookIdx].bookmarks) library[bookIdx].bookmarks = [];
        
        if (editingAnnotId) {
            // Mode Edit
            const bmIdx = library[bookIdx].bookmarks.findIndex(b => b.id === editingAnnotId);
            if (bmIdx > -1) {
                library[bookIdx].bookmarks[bmIdx].title = title;
                library[bookIdx].bookmarks[bmIdx].note = note;
            }
        } else {
            // Mode Baru
            const annot = {
                id: 'bm_' + Date.now(),
                type: 'highlight', // 'highlight' atau 'point'
                color: activeNoteColor,
                title: title,
                note: note,
                nodeIdx: currentSelection.nodeIdx,
                startOff: currentSelection.startOff,
                endOff: currentSelection.endOff,
                text: currentSelection.text,
                date: Date.now()
            };
            library[bookIdx].bookmarks.push(annot);
        }

        localforage.setItem(activeBookId, library[bookIdx]).then(() => {
            _closeModalAction('bookmark-modal', 'bookmark-sheet', true);
            // Re-render konten node yang aktif biar highlight langsung muncul
            const wrapper = document.querySelector(`.reader-node-wrapper[data-index="${editingAnnotId ? library[bookIdx].bookmarks.find(b=>b.id===editingAnnotId).nodeIdx : currentSelection.nodeIdx}"]`);
            if(wrapper) {
                // Cara tergampang untuk re-render highlight:
                // render ulang node tersebut via helper internal atau paksa jump
                const nIdx = editingAnnotId ? library[bookIdx].bookmarks.find(b=>b.id===editingAnnotId).nodeIdx : currentSelection.nodeIdx;
                wrapper.innerHTML = applyHighlights(library[bookIdx].nodes[nIdx].html, library[bookIdx].bookmarks, nIdx);
            }
            updateStatistics();
            renderBookmarkPanel();
        });
    }
}

function applyHighlights(htmlContent, bookmarks, nodeIdx) {
    if (!bookmarks || bookmarks.length === 0) return htmlContent;
    
    // Filter bookmark yang ada di node ini
    const localMarks = bookmarks.filter(b => b.nodeIdx === nodeIdx && b.type === 'highlight');
    if (localMarks.length === 0) return htmlContent;

    // Sort descending berdasarkan startOff agar tidak merusak offset saat disisipkan tag HTML
    localMarks.sort((a, b) => b.startOff - a.startOff);

    // Parsing HTML content menjadi teks murni + map posisi tag
    // Karena konten aslinya HTML, kita harus ekstrak teksnya, bikin highlight di teks, lalu satukan lagi.
    // Pendekatan sederhana (karena node biasanya berupa <p>teks murni</p> dari parser):
    
    let tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // Fungsi rekursif untuk membungkus text node
    function wrapTextNodes(node, offsetTracker = {current: 0}) {
        if (node.nodeType === 3) { // Text Node
            const text = node.nodeValue;
            const length = text.length;
            const startNodeOff = offsetTracker.current;
            const endNodeOff = offsetTracker.current + length;
            
            let parentInserted = false;
            let currentText = text;

            // Cek setiap bookmark apakah bersinggungan dengan text node ini
            // Gunakan loop normal, bukan modifikasi node langsung di sini karena rumit.
            // Pendekatan lebih robust: Re-build text node dengan span.
            
            // Untuk versi sederhana ini, asumsikan parser kita menghasilkan struktur flat
            // dimana highlight bisa langsung diterapkan via replace di text murni jika memungkinkan.
            // Namun karena DOM rumit, implementasi M3 Highlight akan merender ulang textContent 
            // lalu apply style.
        } else {
            node.childNodes.forEach(child => wrapTextNodes(child, offsetTracker));
        }
    }

    // --- Pendekatan Regex Fallback (Kurang akurat untuk tag bersarang, tapi aman untuk teks flat) ---
    // Extract text, find position, inject <mark>.
    // Ini adalah fallback M3 yang stabil tanpa tree-walker kompleks saat render.
    let markedHtml = htmlContent;
    
    // Hapus semua tag HTML untuk dapetin teks murni
    const pureText = tempDiv.textContent; 
    
    localMarks.forEach(mark => {
        // Cari posisi string mark.text di dalam pureText (sebagai konfirmasi)
        // Inject span highlight.
        // Peringatan: Logika ini bisa pecah jika highlight memotong tag HTML (misal bold/italic).
        // Untuk app baca, biasanya highlight di block level.
        
        const colorMap = {
            'yellow': 'hl-yellow',
            'green': 'hl-green',
            'pink': 'hl-pink',
            'blue': 'hl-blue'
        };
        const cClass = colorMap[mark.color] || 'hl-yellow';
        
        // Sederhananya, replace string persis dengan dibungkus span.
        // Hati-hati regex injection.
        const safeStr = mark.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const reg = new RegExp(`(${safeStr})`, 'g');
        
        // Cek apakah string ini bukan bagian dari atribut HTML (sangat tricky).
        // Workaround aman: Hanya replace di text nodes menggunakan TreeWalker.
    });

    // --- IMPLEMENTASI ROBUST TREEWALKER ---
    let offset = 0;
    const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while(walker.nextNode()) {
        textNodes.push({
            node: walker.currentNode,
            start: offset,
            end: offset + walker.currentNode.length
        });
        offset += walker.currentNode.length;
    }

    localMarks.forEach(mark => {
        const cClass = mark.color === 'yellow' ? 'hl-yellow' : (mark.color === 'green' ? 'hl-green' : 'hl-pink');
        const spanOpen = `<span class="px-1 rounded-sm cursor-pointer transition-colors ${cClass}" onclick="openEditAnnotation('${mark.id}')">`;
        const spanClose = `</span>`;

        // Modifikasi node dari belakang agar tidak mengganggu iterasi
        for (let i = textNodes.length - 1; i >= 0; i--) {
            const tn = textNodes[i];
            
            // Cek irisan
            if (mark.startOff < tn.end && mark.endOff > tn.start) {
                // Ada irisan!
                const relativeStart = Math.max(0, mark.startOff - tn.start);
                const relativeEnd = Math.min(tn.node.length, mark.endOff - tn.start);
                
                const originalText = tn.node.nodeValue;
                const before = originalText.substring(0, relativeStart);
                const highlight = originalText.substring(relativeStart, relativeEnd);
                const after = originalText.substring(relativeEnd);
                
                // Ganti text node dengan elemen baru
                const fragment = document.createDocumentFragment();
                if(before) fragment.appendChild(document.createTextNode(before));
                
                const span = document.createElement('span');
                span.className = `px-1 mx-[1px] rounded flex-inline cursor-pointer transition-all active:opacity-50 ${cClass}`;
                span.onclick = (e) => { e.stopPropagation(); openEditAnnotation(mark.id); };
                span.textContent = highlight;
                fragment.appendChild(span);
                
                if(after) fragment.appendChild(document.createTextNode(after));
                
                tn.node.parentNode.replaceChild(fragment, tn.node);
                
                // Update textNodes reference is omitted for simplicity as we go backwards and don't reuse modified nodes in same pass
            }
        }
    });

    return tempDiv.innerHTML;
}

window.openEditAnnotation = function(id) {
    if (!activeBookId) return;
    const book = library.find(b => b.id === activeBookId);
    if (!book || !book.bookmarks) return;
    const annot = book.bookmarks.find(b => b.id === id);
    if (!annot) return;

    editingAnnotId = id;
    activeNoteColor = annot.color || 'yellow';
    
    document.getElementById('bookmark-input-title').value = annot.title;
    document.getElementById('bookmark-input-text').value = annot.note || '';
    
    const delBtn = document.getElementById('btn-delete-bookmark');
    delBtn.classList.remove('hidden');

    openModal('bookmark-modal', 'bookmark-sheet');
};

window.deleteBookmarkInsideModal = function() {
    const d = i18n[wikiLang] || i18n['en'];
    showDialog("Hapus Catatan", d.deleteNoteConfirm, "trash-2", [
        {text: d.cancel, action: null},
        {text: d.delete, primary: true, action: () => {
            if (!activeBookId || !editingAnnotId) return;
            const bookIdx = library.findIndex(b => b.id === activeBookId);
            if (bookIdx > -1) {
                const nodeIdx = library[bookIdx].bookmarks.find(b => b.id === editingAnnotId).nodeIdx;
                library[bookIdx].bookmarks = library[bookIdx].bookmarks.filter(b => b.id !== editingAnnotId);
                localforage.setItem(activeBookId, library[bookIdx]).then(() => {
                    _closeModalAction('bookmark-modal', 'bookmark-sheet', true);
                    const wrapper = document.querySelector(`.reader-node-wrapper[data-index="${nodeIdx}"]`);
                    if(wrapper) wrapper.innerHTML = applyHighlights(library[bookIdx].nodes[nodeIdx].html, library[bookIdx].bookmarks, nodeIdx);
                    updateStatistics();
                    renderBookmarkPanel();
                });
            }
        }}
    ]);
};


function copySelection() {
    if (!currentSelection.text) return;
    navigator.clipboard.writeText(currentSelection.text).then(() => {
        document.getElementById('selection-menu').classList.add('hidden');
        window.getSelection().removeAllRanges();
        // Toast mini
        const toast = document.createElement('div');
        toast.className = "fixed bottom-24 left-1/2 -translate-x-1/2 bg-m3-onSurface text-m3-surface px-4 py-2 rounded-full text-xs font-bold z-[200] shadow-lg animate-fade-in-up";
        toast.textContent = "Disalin ke clipboard";
        document.body.appendChild(toast);
        setTimeout(() => { toast.classList.add('opacity-0', 'translate-y-4'); setTimeout(() => toast.remove(), 300); }, 2000);
    });
}


// 6. READER NAVIGATION & RENDER BUKU
function openBook(id) {
    const book = library.find(b => b.id === id);
    if (!book) return;

    activeBookId = id;
    DOM.readTitle.textContent = book.title;
    DOM.toc.innerHTML = '';
    DOM.content.innerHTML = '';
    
    // Render Konten
    const fragment = document.createDocumentFragment();
    book.nodes.forEach((node, idx) => {
        const div = document.createElement('div');
        div.className = "mb-4 sm:mb-6 reader-node-wrapper"; // Spacing block
        div.dataset.index = idx;
        // Inject id untuk navigasi TOC, pakai node.id atau fallback ke n_{idx}
        div.id = node.id || `n_${idx}`;
        
        // Apply Highlight jika ada
        div.innerHTML = applyHighlights(node.html, book.bookmarks, idx);
        
        observer.observe(div);
        fragment.appendChild(div);
        
        // Render Item TOC
        if (node.isToc) {
            const btn = document.createElement('button');
            const depth = node.depth || 1;
            btn.className = `text-left p-3 w-full hover:bg-m3-surface rounded-xl transition-colors text-m3-onSurfaceVariant border-none btn-morph`;
            btn.style.paddingLeft = `${depth * 1.5}rem`;
            btn.innerHTML = `<span class="text-sm font-bold opacity-90 line-clamp-2">${node.text}</span>`;
            btn.onclick = () => { jumpToNode(idx); togglePanel(DOM.tocPanel, 'toc', 'btn-toc'); };
            DOM.toc.appendChild(btn);
        }
    });
    DOM.content.appendChild(fragment);

    renderBookmarkPanel(); // Render daftar bookmark
    updateBookProgress(activeBookId, book.lastReadNode || 0, book.progress || 0);

    // Animasi Masuk
    DOM.readView.style.transform = 'translateY(0)';
    setTimeout(() => {
        DOM.libView.classList.add('hidden');
        if (book.lastReadNode && book.lastReadNode > 0) {
            jumpToNode(book.lastReadNode, false); // false = tanpa smooth scroll saat awal buka
        } else {
            DOM.readerCont.scrollTop = 0;
        }
    }, 500);

    book.lastRead = Date.now();
    localforage.setItem(id, book);
    renderLibrary(); // Update library sort
}

function updateBookProgress(id, nodeIdx, pct) {
    const book = library.find(b => b.id === id);
    if (book) {
        book.lastReadNode = nodeIdx;
        book.progress = Math.round(pct);
        localforage.setItem(id, book);
    }
}

function jumpToNode(idx, smooth = true) {
    const el = document.querySelector(`[data-index="${idx}"]`);
    if (el) {
        // Hitung offset akurat (kurangi margin atas sticky header)
        const offset = el.offsetTop - 120; 
        DOM.readerCont.scrollTo({ top: offset, behavior: smooth ? 'smooth' : 'auto' });
    }
}

// Fullscreen toggle
function toggleFullscreenReading() {
    const d = i18n[wikiLang] || i18n['en'];
    const header = DOM.readerFloatingHeader;
    const nav = DOM.readerBottomBar;
    const isFull = header.style.transform === 'translateY(-150%)';

    if (isFull) {
        header.style.transform = 'translateY(0)';
        header.style.opacity = '100';
        nav.style.transform = 'translateY(0)';
        document.getElementById('str-nav-full').textContent = d.navFull;
    } else {
        header.style.transform = 'translateY(-150%)';
        header.style.opacity = '0';
        nav.style.transform = 'translateY(150%)';
        document.getElementById('str-nav-full').textContent = d.navBack; // re-use string
    }
}


// --- PANEL BOOKMARK ---
function renderBookmarkPanel() {
    if (!activeBookId) return;
    const book = library.find(b => b.id === activeBookId);
    if (!book) return;

    const list = DOM.bookmarkList;
    const empty = document.getElementById('bookmark-empty');
    list.innerHTML = '';

    const bms = book.bookmarks || [];
    
    if (bms.length === 0) {
        empty.classList.remove('hidden');
    } else {
        empty.classList.add('hidden');
        
        // Sort descending berdasar tanggal buat list
        [...bms].sort((a,b) => b.date - a.date).forEach(bm => {
            const btn = document.createElement('button');
            btn.className = "text-left p-4 hover:bg-m3-surface rounded-2xl transition-colors border-none btn-morph bg-m3-surface/50 mb-2 relative overflow-hidden group";
            
            const colorMap = {'yellow': 'bg-[#EAB308]', 'green': 'bg-[#22C55E]', 'pink': 'bg-[#EC4899]', 'blue': 'bg-[#3B82F6]'};
            const barColor = colorMap[bm.color] || 'bg-m3-primary';
            
            btn.innerHTML = `
                <div class="absolute left-0 top-0 bottom-0 w-1 ${barColor}"></div>
                <div class="pl-2">
                    <h4 class="font-bold text-sm text-m3-onSurfaceVariant mb-1 truncate pr-8">${bm.title}</h4>
                    ${bm.note ? `<p class="text-[10px] opacity-70 italic line-clamp-2 mb-2 font-medium">"${bm.note}"</p>` : ''}
                    <div class="text-[9px] font-black uppercase tracking-wider text-m3-primary opacity-80">Hal ${bm.nodeIdx + 1}</div>
                </div>
                <div class="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2">
                    <div class="w-8 h-8 rounded-full bg-m3-surfaceVariant flex items-center justify-center shadow-sm" onclick="event.stopPropagation(); openEditAnnotation('${bm.id}')"><i data-lucide="edit-2" class="w-3.5 h-3.5"></i></div>
                </div>
            `;
            btn.onclick = () => {
                jumpToNode(bm.nodeIdx);
                togglePanel(DOM.bookmarkPanel, 'bookmark', 'btn-bookmarks');
            };
            list.appendChild(btn);
        });
        lucide.createIcons();
    }
}

window.filterBookmarkPanel = function(query) {
    query = query.toLowerCase();
    const list = DOM.bookmarkList;
    Array.from(list.children).forEach(btn => {
        const title = btn.querySelector('h4').textContent.toLowerCase();
        const note = btn.querySelector('p') ? btn.querySelector('p').textContent.toLowerCase() : '';
        if (title.includes(query) || note.includes(query)) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    });
};


// 7. MULTIPLE SELECTION LOGIC
window.toggleBatchDelete = function() {
    isBatchDeleteMode = !isBatchDeleteMode;
    selectedForDelete = [];
    
    if (isBatchDeleteMode) {
        DOM.batchBar.classList.remove('translate-y-32');
        DOM.batchBar.classList.add('translate-y-0');
        updateBatchCount();
    } else {
        DOM.batchBar.classList.add('translate-y-32');
        DOM.batchBar.classList.remove('translate-y-0');
        document.querySelectorAll('.book-ring').forEach(el => {
            el.classList.remove('ring-4');
            el.classList.add('ring-0');
        });
        document.querySelectorAll('.check-icon').forEach(el => {
            el.classList.remove('scale-100');
            el.classList.add('scale-0');
        });
    }
    renderLibrary(DOM.globalSearch.value); 
};

function toggleSelection(card, id) {
    const idx = selectedForDelete.indexOf(id);
    const ring = card.querySelector('.book-ring');
    const check = card.querySelector('.check-icon');
    
    if (idx > -1) {
        selectedForDelete.splice(idx, 1);
        ring.classList.remove('ring-4');
        ring.classList.add('ring-0');
        check.classList.remove('scale-100');
        check.classList.add('scale-0');
    } else {
        selectedForDelete.push(id);
        ring.classList.add('ring-4');
        ring.classList.remove('ring-0');
        check.classList.add('scale-100');
        check.classList.remove('scale-0');
    }
    updateBatchCount();
}

function updateBatchCount() {
    const d = i18n[wikiLang] || i18n['en'];
    document.getElementById('batch-delete-count').textContent = `${selectedForDelete.length} ${d.selected}`;
}

window.executeBatchDelete = function() {
    if (selectedForDelete.length === 0) { toggleBatchDelete(); return; }
    const d = i18n[wikiLang] || i18n['en'];

    showDialog("Hapus Buku", d.deleteConfirm, "trash-2", [
        {text: d.cancel, action: null},
        {text: d.delete, primary: true, action: async () => {
            for (let id of selectedForDelete) {
                await localforage.removeItem(id);
                library = library.filter(b => b.id !== id);
            }
            toggleBatchDelete();
            renderLibrary(DOM.globalSearch.value);
            updateStatistics();
        }}
    ]);
};

// 8. BOOK OPTIONS & EDIT DATA LOGIC
function openBookOptions(id) {
    activeOptsId = id;
    const book = library.find(b => b.id === id);
    if(!book) return;

    const d = i18n[wikiLang] || i18n['en'];

    document.getElementById('opt-title').textContent = book.title;
    
    const pinStr = book.isPinned ? d.optUnpin : d.optPin;
    document.getElementById('str-opt-pin').textContent = pinStr;
    const iconPin = document.getElementById('icon-opt-pin');
    if(book.isPinned) {
        iconPin.classList.add('fill-current');
    } else {
        iconPin.classList.remove('fill-current');
    }

    openModal('b-opt-modal', 'b-opt-sheet');
}

window.togglePinBook = function() {
    if(!activeOptsId) return;
    const book = library.find(b => b.id === activeOptsId);
    if(book) {
        book.isPinned = !book.isPinned;
        localforage.setItem(book.id, book).then(() => {
            _closeModalAction('b-opt-modal', 'b-opt-sheet', true);
            renderLibrary(DOM.globalSearch.value);
        });
    }
};

window.triggerSelectMode = function() {
    _closeModalAction('b-opt-modal', 'b-opt-sheet', true);
    setTimeout(() => { toggleBatchDelete(); }, 300);
};

window.triggerEditView = function() {
    if(!activeOptsId) return;
    const book = library.find(b => b.id === activeOptsId);
    
    document.getElementById('edit-book-id').value = book.id;
    document.getElementById('edit-book-title').value = book.title;
    document.getElementById('edit-book-cover').value = ""; // Reset file input
    selectShape(book.shape || 'square');

    _closeModalAction('b-opt-modal', 'b-opt-sheet', false);
    setTimeout(() => openModal('edit-modal', 'edit-sheet'), 200);
};

window.triggerDeleteView = function() {
    if(!activeOptsId) return;
    const d = i18n[wikiLang] || i18n['en'];
    _closeModalAction('b-opt-modal', 'b-opt-sheet', true);

    setTimeout(() => {
        showDialog("Hapus Buku", d.deleteConfirm, "trash-2", [
            {text: d.cancel, action: null},
            {text: d.delete, primary: true, action: async () => {
                await localforage.removeItem(activeOptsId);
                library = library.filter(b => b.id !== activeOptsId);
                renderLibrary(DOM.globalSearch.value);
                updateStatistics();
            }}
        ]);
    }, 300);
};

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
};

window.closeEditModal = function() {
    _closeModalAction('edit-modal', 'edit-sheet', true);
};

window.saveBookEdit = function() {
    const id = document.getElementById('edit-book-id').value;
    const title = document.getElementById('edit-book-title').value.trim();
    const shape = document.getElementById('edit-book-shape').value;
    const fileInput = document.getElementById('edit-book-cover');
    
    const bookIdx = library.findIndex(b => b.id === id);
    if (bookIdx === -1) return;

    library[bookIdx].title = title || "Untitled Document";
    library[bookIdx].shape = shape;

    const finalize = () => {
        localforage.setItem(id, library[bookIdx]).then(() => {
            renderLibrary(DOM.globalSearch.value);
            closeEditModal();
        });
    };

    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            library[bookIdx].cover = e.target.result;
            finalize();
        };
        reader.readAsDataURL(file);
    } else {
        finalize();
    }
};

// 9. BACKUP & RESTORE LOGIC (JSON Teks Mentah)
window.exportData = async function() {
    const data = { version: window.APP_VERSION, timestamp: Date.now(), library: library };
    const jsonStr = JSON.stringify(data);
    
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
            const { Filesystem, Directory, Encoding } = window.Capacitor.Plugins;
            const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const fileName = `baca-backup-${dateStr}.json`;
            
            await Filesystem.writeFile({
                path: fileName,
                data: jsonStr,
                directory: Directory.Documents,
                encoding: Encoding.UTF8
            });
            
            showDialog("Backup Berhasil", `Data disimpan sebagai:\nDocuments/${fileName}`, "check-circle", [{text: "Tutup", primary: true}]);
        } else {
            // Fallback web: trigger download
            const blob = new Blob([jsonStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `baca-backup-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
    } catch(e) {
        console.error("Backup FS Error", e);
        // Fallback ekstrim: Teks Mentah UI
        document.getElementById('raw-backup-textarea').value = jsonStr;
        openModal('raw-backup-modal', 'raw-backup-sheet');
    }
};

window.copyRawBackup = function() {
    const text = document.getElementById('raw-backup-textarea').value;
    navigator.clipboard.writeText(text).then(() => {
        const d = i18n[wikiLang] || i18n['en'];
        const btn = document.getElementById('str-raw-bak-btn-copy');
        const ogText = btn.textContent;
        btn.textContent = "Tersalin!";
        setTimeout(() => btn.textContent = ogText, 2000);
    });
};

window.openRestoreOptions = function() {
    document.getElementById('raw-restore-textarea').value = '';
    openModal('raw-restore-modal', 'raw-restore-sheet');
};

window.importDataFile = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        document.getElementById('raw-restore-textarea').value = evt.target.result;
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
};

window.processRawRestore = async function() {
    const text = document.getElementById('raw-restore-textarea').value.trim();
    if(!text) return;
    try {
        const data = JSON.parse(text);
        if(!data.library || !Array.isArray(data.library)) throw new Error("Format JSON invalid.");
        
        DOM.loadTxt.textContent = "Memulihkan Data...";
        DOM.load.classList.remove('hidden');
        DOM.loadBar.style.width = '100%';
        DOM.loadPct.textContent = '...';
        
        _closeModalAction('raw-restore-modal', 'raw-restore-sheet', true);
        
        await localforage.clear();
        for (let b of data.library) await localforage.setItem(b.id, b);
        
        await loadLibrary();
        renderLibrary();
        
        DOM.load.classList.add('hidden');
        showDialog("Pulihkan Selesai", `${data.library.length} buku berhasil dipulihkan.`, "check-circle", [{text: "Tutup", primary: true}]);

    } catch(e) {
        showDialog("Gagal Memulihkan", "Teks JSON tidak valid atau korup.", "alert-triangle", [{text: "Tutup", primary: true}]);
        console.error(e);
    }
};

// 10. SYSTEM MODAL HANDLERS
window.openModal = function(modalId, sheetId, pushHistory = false) {
    const modal = document.getElementById(modalId);
    const sheet = document.getElementById(sheetId);
    if (!modal || !sheet) return;

    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        if (sheet.classList.contains('scale-75')) {
            sheet.classList.remove('scale-75', 'translate-y-12');
            sheet.classList.add('scale-100', 'translate-y-0');
        } else {
            sheet.style.transform = 'translateY(0)';
        }
    });

    if(pushHistory) history.pushState({modal: modalId, sheet: sheetId}, "");
};

window._closeModalAction = function(modalId, sheetId, goBack = false) {
    const modal = document.getElementById(modalId);
    const sheet = document.getElementById(sheetId);
    if (!modal || !sheet) return;

    modal.classList.add('opacity-0');
    if (sheet.classList.contains('scale-100')) {
        sheet.classList.remove('scale-100', 'translate-y-0');
        sheet.classList.add('scale-75', 'translate-y-12');
    } else {
        sheet.style.transform = 'translateY(100%)';
    }
    
    setTimeout(() => {
        modal.classList.add('hidden');
        if(goBack && history.state && history.state.modal === modalId) {
            history.back();
        }
    }, 300); // 300ms sesuaikan dgn durasi Tailwind
};

window.closeWelcome = function() {
    _closeModalAction('welcome-modal', 'welcome-sheet', true);
};

// 11. SYSTEM DIALOG (Custom Alert)
function showDialog(title, message, iconName, actions) {
    const modal = document.getElementById('custom-dialog');
    const sheet = document.getElementById('custom-dialog-sheet');
    const titleEl = document.getElementById('dialog-title');
    const msgEl = document.getElementById('dialog-message');
    const actionsEl = document.getElementById('dialog-actions');
    const iconEl = document.getElementById('dialog-icon');
    const iconCont = document.getElementById('dialog-icon-container');

    titleEl.textContent = title;
    msgEl.innerHTML = message; // Boleh HTML
    
    iconEl.setAttribute('data-lucide', iconName);
    
    if (iconName === 'alert-triangle' || iconName === 'trash-2') {
        iconCont.className = 'w-10 h-10 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 flex items-center justify-center shrink-0';
    } else if (iconName === 'check-circle') {
        iconCont.className = 'w-10 h-10 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 flex items-center justify-center shrink-0';
    } else {
        iconCont.className = 'w-10 h-10 rounded-full bg-m3-primaryContainer text-m3-onPrimaryContainer flex items-center justify-center shrink-0';
    }

    actionsEl.innerHTML = '';
    actions.forEach(act => {
        const btn = document.createElement('button');
        if (act.primary) {
            btn.className = "py-3 px-6 bg-m3-primary text-m3-onPrimary font-bold rounded-full btn-morph text-sm shadow-sm";
        } else {
            btn.className = "py-3 px-6 bg-transparent text-m3-onSurface font-bold rounded-full btn-morph text-sm";
        }
        btn.textContent = act.text;
        btn.onclick = () => {
            _closeModalAction('custom-dialog', 'custom-dialog-sheet', false);
            if(act.action) setTimeout(act.action, 300);
        };
        actionsEl.appendChild(btn);
    });

    lucide.createIcons();
    openModal('custom-dialog', 'custom-dialog-sheet', false);
}


// 12. HARDWARE BACK BUTTON & ROUTING
window.addEventListener('popstate', (e) => {
    // 1. Close active panel (TOC/Settings)
    if (activePanel) {
        togglePanel(activePanel);
        return;
    }
    
    // 2. Close active modals (berdasarkan class CSS visible)
    const openModals = document.querySelectorAll('.modal-overlay:not(.hidden)');
    if (openModals.length > 0) {
        // Asumsi overlay teratas adalah yang terakhir dirender (z-index)
        const topModal = Array.from(openModals).pop();
        const sheet = topModal.querySelector('.modal-content');
        if(topModal.id === 'welcome-modal') closeWelcome();
        else if(topModal.id === 'ai-modal' && window.closeAiModal) window.closeAiModal(true);
        else _closeModalAction(topModal.id, sheet.id, false);
        return;
    }

    // 3. Close Reader View if active
    if (!DOM.readView.classList.contains('translate-y-full')) {
        // Animasi keluar
        DOM.readView.style.transform = 'translateY(100%)';
        DOM.libView.classList.remove('hidden');
        
        // Reset full screen kalau nyala
        const header = DOM.readerFloatingHeader;
        if(header.style.transform === 'translateY(-150%)') toggleFullscreenReading();
        
        setTimeout(() => {
            DOM.toc.innerHTML = '';
            DOM.content.innerHTML = '';
            activeBookId = null;
            document.getElementById('selection-menu').classList.add('hidden');
            window.getSelection().removeAllRanges();
            updateStatistics();
            renderLibrary(DOM.globalSearch.value);
        }, 500);
    }
});

// Setup back button native UI reader
document.getElementById('btn-back').addEventListener('click', () => {
    history.back();
});

// Helper for side panels
function togglePanel(panel, type, btnId) {
    if (activePanel && activePanel !== panel) {
        activePanel.style.transform = 'translateX(100%)';
        activePanel.style.opacity = '0';
        activePanel.classList.remove('pointer-events-auto');
    }

    if (panel.style.transform === 'translateX(0px)' || panel.style.transform === 'translateX(0)') {
        panel.style.transform = 'translateX(100%)';
        panel.style.opacity = '0';
        panel.classList.remove('pointer-events-auto');
        DOM.overlay.classList.add('hidden');
        DOM.overlay.classList.remove('opacity-100');
        activePanel = null;
        history.back(); // Pop state
    } else {
        panel.style.transform = 'translateX(0)';
        panel.style.opacity = '100';
        panel.classList.add('pointer-events-auto');
        DOM.overlay.classList.remove('hidden');
        requestAnimationFrame(() => DOM.overlay.classList.add('opacity-100'));
        activePanel = panel;
        history.pushState({panel: type}, ""); // Push state

        if(type === 'settings') {
            document.getElementById('inbook-search-input').focus();
        } else if (type === 'bookmark') {
            document.getElementById('bookmark-search-input').focus();
        }
    }
}

// Bind panel buttons
document.getElementById('btn-toc').addEventListener('click', () => togglePanel(DOM.tocPanel, 'toc', 'btn-toc'));
document.getElementById('btn-settings').addEventListener('click', () => togglePanel(DOM.setPanel, 'settings', 'btn-settings'));

// Setup Swipe Gestures to close panels
let touchStartX = 0;
let touchEndX = 0;

['toc-panel', 'settings-panel', 'bookmark-panel'].forEach(id => {
    const panel = document.getElementById(id);
    panel.addEventListener('touchstart', e => touchStartX = e.changedTouches[0].screenX, {passive: true});
    panel.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        if (touchEndX - touchStartX > 50) { // Swipe Right
            history.back(); // Akan men-trigger popstate -> togglePanel()
        }
    }, {passive: true});
    
    // Smooth drag (opsional)
    panel.addEventListener('touchmove', e => {
        const x = e.changedTouches[0].screenX;
        if(x > touchStartX) {
            const diff = x - touchStartX;
            panel.style.transform = `translateX(${diff}px)`;
        }
    }, {passive: true});
    
    // Snap back or close on release
    panel.addEventListener('touchend', e => {
        requestAnimationFrame(() => {
            if (activePanel !== panel) return; // Udah diclose history
            const diff = touchEndX - touchStartX;
            if (diff <= 50) {
                // Snap back
                panel.style.transition = 'transform 0.3s ease';
                panel.style.transform = 'translateX(0)';
                setTimeout(() => panel.style.transition = '', 300);
            }
        });
    });
});

// Overlay native clik
DOM.overlay.addEventListener('click', () => {
    history.back();
});

// Update System Check Logics
window.checkForUpdate = async function() {
    const d = i18n[wikiLang] || i18n['en'];
    const btnText = document.getElementById('str-btn-update');
    const icon = document.getElementById('icon-update-app');
    
    const ogText = btnText.textContent;
    btnText.textContent = d.updateChecking;
    icon.classList.add('animate-spin');
    
    try {
        const response = await fetch(window.UPDATE_URL, { cache: 'no-store' });
        if(!response.ok) throw new Error("Gagal fetch package.json");
        const data = await response.json();
        
        const currentArr = window.APP_VERSION.split('.').map(Number);
        const latestArr = data.version.split('.').map(Number);
        
        let isOutdated = false;
        for(let i=0; i<3; i++) {
            if(latestArr[i] > currentArr[i]) { isOutdated = true; break; }
            if(latestArr[i] < currentArr[i]) { break; }
        }
        
        btnText.textContent = ogText;
        icon.classList.remove('animate-spin');
        
        if (isOutdated) {
            showDialog(d.updateAvailableTitle, `${d.updateAvailableDesc.replace('Version', data.version)}`, "download-cloud", [
                {text: d.btnClose, action: null},
                {text: d.btnDownload, primary: true, action: () => {
                    window.open(window.RELEASES_URL, '_system');
                }}
            ]);
        } else {
            showDialog(d.updateLatestTitle, d.updateLatestDesc, "check-circle", [{text: d.btnClose, primary: true}]);
        }
        
    } catch(err) {
        console.error(err);
        btnText.textContent = ogText;
        icon.classList.remove('animate-spin');
        showDialog("Error", d.updateError, "alert-triangle", [{text: d.btnClose, primary: true}]);
    }
};

// Modifikasi Swipe untuk Close Reader (Swipe Down)
let readerTouchStartY = 0;
let readerTouchEndY = 0;
const readerContent = document.getElementById('reader-content');

readerContent.addEventListener('touchstart', e => {
    if(readerContent.scrollTop === 0) readerTouchStartY = e.changedTouches[0].screenY;
    else readerTouchStartY = 0;
}, {passive: true});

readerContent.addEventListener('touchmove', e => {
    if (readerTouchStartY > 0) {
        const y = e.changedTouches[0].screenY;
        const diff = y - readerTouchStartY;
        if (diff > 0) {
            DOM.readView.style.transform = `translateY(${diff}px)`;
        }
    }
}, {passive: true});

readerContent.addEventListener('touchend', e => {
    if (readerTouchStartY > 0) {
        readerTouchEndY = e.changedTouches[0].screenY;
        const diff = readerTouchEndY - readerTouchStartY;
        
        if (diff > 150) { // Threshold 150px buat close
            history.back(); // Akan trigger popstate buat nutup reader
        } else {
            DOM.readView.style.transform = 'translateY(0)';
        }
    }
    readerTouchStartY = 0;
});

// Modifikasi Swipe untuk Close Bottom Sheet Modal
const modalsToSwipe = ['global-settings-sheet', 'welcome-sheet', 'b-opt-sheet', 'edit-sheet', 'ai-sheet', 'bookmark-sheet', 'raw-backup-sheet', 'raw-restore-sheet', 'custom-dialog-sheet'];

modalsToSwipe.forEach(id => {
    const sheet = document.getElementById(id);
    if(sheet) {
        let sheetStartY = 0;
        let isDragging = false;

        sheet.addEventListener('touchstart', (e) => {
            // Jangan halangi scroll di dalam container scrollable
            if (e.target.closest('.overflow-y-auto')) return;
            sheetStartY = e.touches[0].clientY;
            isDragging = true;
            sheet.style.transition = 'none';
        }, {passive: true});

        sheet.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const currentY = e.touches[0].clientY;
            const diff = currentY - sheetStartY;
            
            if (diff > 0) { // Hanya allow drag ke bawah
                // Untuk modal yg pakai transform translate-y-full (bottom sheet)
                if (sheet.classList.contains('translate-y-full') || sheet.id === 'global-settings-sheet' || sheet.id === 'b-opt-sheet' || sheet.id === 'ai-sheet') {
                    sheet.style.transform = `translateY(${diff}px)`;
                } 
                // Untuk modal yg ditengah (scale-75) -> geser translateY nya aja ditambah base margin
                else {
                    sheet.style.transform = `translateY(${diff + 48}px) scale(1)`; 
                }
            }
        }, {passive: true});

        sheet.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            isDragging = false;
            sheet.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            
            const currentY = e.changedTouches[0].clientY;
            const diff = currentY - sheetStartY;

            if (diff > 100) { // Threshold close
                // Trigger action tutup sesuai modal
                const parentModalId = sheet.parentElement.id;
                
                // Jika itu welcome modal, jangan pop history karena g ada push state diawal
                if (parentModalId === 'welcome-modal') closeWelcome();
                else if (parentModalId === 'ai-modal' && window.closeAiModal) window.closeAiModal(true);
                else {
                    // Cek apakah beneran nyangkut di history
                    if (history.state && history.state.modal === parentModalId) {
                        setTimeout(() => { history.back(); setTimeout(() => { sheet.style.transform = ''; }, 100); }, 100);
                    } else {
                        _closeModalAction(parentModalId, id, false);
                        setTimeout(() => { sheet.style.transform = ''; }, 300);
                    }
                }
            } else { 
                // Kembalikan ke posisi awal
                sheet.style.transform = '';
            }
        });
    }
});

// 13. PWA & CAPACITOR SETUP
if ('serviceWorker' in navigator) {
    const swCode = `
    const CACHE_NAME = 'baca-pwa-v5';
    self.addEventListener('install', (e) => {
        self.skipWaiting();
        e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll([
            '/', 'libs/tailwindcss.js', 'libs/pdf.min.js', 'libs/pdf.worker.min.js', 'libs/localforage.min.js', 'libs/jszip.min.js', 'libs/lucide.js', 'libs/marked.min.js',
            'css/style.css', 'js/config.js', 'js/reader.js', 'js/app.js'
       ])));
    });
    self.addEventListener('fetch', (e) => { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))); });
    `;
    const blob = new Blob([swCode], {type: 'application/javascript'});
    navigator.serviceWorker.register(URL.createObjectURL(blob)).catch(err => console.log("SW Error:", err));
}

document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        if (window.Capacitor && window.Capacitor.Plugins) {
            const capApp = window.Capacitor.Plugins.App;
            capApp.addListener('backButton', (e) => {
                if (window.history.length > 1) window.history.back();
                else capApp.exitApp();
            });
        }
    }, 1000);
});
