// ID: ext_mangasusuku
// NAME: Mangasusuku
// VERSION: 1.0.1
// COLOR: #FF6740
// ICON: https://mangasusuku.com/favicon.ico
// REFERER: https://mangasusuku.com/

const BASE = 'https://mangasusuku.com';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Referer': 'https://mangasusuku.com/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
};

async function fetchHtml(url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${url}`);
    return await res.text();
}

function extractMatch(regex, str, defaultVal = '') {
    const m = str.match(regex);
    return m ? m[1].trim() : defaultVal;
}

function extractAll(regex, str) {
    const matches = [];
    let m;
    while ((m = regex.exec(str)) !== null) matches.push(m);
    return matches;
}

function parseList(html) {
    // 1. Theme Manga: bsx + tt
    let matches = extractAll(/<div class="bsx"[^>]*>[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<img[^>]*(?:data-src|data-lazy-src|src)="([^"]+)"[^>]*>[\s\S]*?<div class="tt">([^<]+)<\/div>/gi, html);
    // 2. List update: listupd / bs
    if (matches.length === 0) matches = extractAll(/<div class="bs"[^>]*>[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<img[^>]*(?:data-src|src)="([^"]+)"[^>]*>[\s\S]*?<div class="tt">([^<]+)<\/div>/gi, html);
    // 3. Generik: semua link /manga/
    if (matches.length === 0) matches = extractAll(/<a href="([^"]*\/manga\/[^"]*)"[^>]*>[\s\S]{0,800}?(?:data-src|data-lazy-src|src)="([^"]+)"[\s\S]{0,800}?>([^<]{3,100})</gi, html);
    // 4. Generik banget: semua link manga-list (kalau theme-nya beda)
    if (matches.length === 0) matches = extractAll(/<a href="([^"]+)"[^>]*title="([^"]+)"[^>]*>[\s\S]{0,500}?(?:data-src|src)="([^"]+)"/gi, html);

    const list = [];
    const seen = new Set();
    for (const m of matches) {
        let urlPath = m[1];
        let cover = '';
        let title = '';
        // Format 1-3: [url, cover, title] | Format 4: [url, title, cover]
        if (m.length >= 4 && m[3] && m[3].includes('http')) {
            title = (m[2] || '').trim();
            cover = m[3] || '';
        } else {
            cover = m[2] || '';
            title = (m[3] || '').trim();
        }
        if (!urlPath || !title) continue;
        // Homepage Mangasusu isinya CHAPTER, bukan manga - buang yang ada kata Chapter
        if (/chapter\s*\d+/i.test(title)) continue;
        if (urlPath.includes('chapter-') && !urlPath.includes('/manga/')) continue;
        if (seen.has(urlPath)) continue;
        seen.add(urlPath);
        if (cover.includes(',')) cover = cover.split(',')[0].trim().split(' ')[0];
        if (cover.includes('?')) cover = cover.split('?')[0];
        if (cover.startsWith('//')) cover = 'https:' + cover;
        if (cover.includes('logo') || cover.includes('placeholder') || cover.includes('favicon')) continue;
        if (urlPath.includes('/genres/') || urlPath.includes('/tag/') || urlPath.includes('/author/')) continue;
        list.push({ id: urlPath, title: title, cover_url: cover, rating: '-', views: '-' });
    }
    return list;
}

const KonmikExtension = {
    // -- Daftar komik / pencarian --
    async getList(page, query, filters) {
        // FIX: Jangan ambil dari homepage (/), homepage isinya update chapter!
        // Ambil dari /manga-list/ yang isinya daftar judul manga beneran.
        // Contoh judul asli: Mother's Friends, My Ideal Type is my Friend's Mom, I'll Plug It In!
        let urlsToTry = [];
        if (query) {
            urlsToTry.push(`${BASE}/page/${page}/?s=${encodeURIComponent(query)}`);
            urlsToTry.push(`${BASE}/?s=${encodeURIComponent(query)}`);
            urlsToTry.push(`${BASE}/manga-list/?s=${encodeURIComponent(query)}`);
        } else {
            urlsToTry.push(`${BASE}/manga-list/page/${page}/`);
            urlsToTry.push(`${BASE}/manga-list/`);
            urlsToTry.push(`${BASE}/daftar-manga/page/${page}/`);
            urlsToTry.push(`${BASE}/page/${page}/`);
        }

        let mangaList = [];
        for (const url of urlsToTry) {
            try {
                const html = await fetchHtml(url);
                mangaList = parseList(html);
                if (mangaList.length > 0) break;
            } catch (e) { continue; }
        }
        return { manga_list: mangaList, has_next_page: mangaList.length > 0 };
    },

    // -- Detail komik + daftar chapter --
    async getDetail(urlPath) {
        const fullUrl = urlPath.startsWith('http') ? urlPath : BASE + urlPath;
        const html = await fetchHtml(fullUrl);

        const title = extractMatch(/<h1[^>]*>([^<]+)<\/h1>/i, html, 'Unknown Title');
        const author = extractMatch(/Author[\s\S]{0,150}?<a[^>]*>([^<]+)<\/a>/i, html, 'Mangasusu').trim();
        const desc = extractMatch(/<div class="sinopsis"[^>]*>([\s\S]*?)<\/div>/i, html) || extractMatch(/<div class="desc"[^>]*>([\s\S]*?)<\/div>/i, html, 'Tidak ada deskripsi.');
        const cleanDesc = desc.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

        let cover = extractMatch(/property="og:image"[^>]*content="([^"]+)"/i, html) || extractMatch(/content="([^"]+)"[^>]*property="og:image"/i, html);
        if (!cover) cover = extractMatch(/<div class="thumb"[^>]*>[\s\S]*?<img[^>]*(?:data-src|src)="([^"]+)"/i, html);
        if (cover && cover.includes('?')) cover = cover.split('?')[0];

        const genreMatches = extractAll(/<a[^>]*rel="tag"[^>]*>([^<]+)<\/a>/gi, html);
        let genres = genreMatches.map(m => m[1].trim()).filter(Boolean);
        if (genres.length === 0) genres = ['Manga'];

        // Chapter list: cari semua <a> yang href-nya ada kata 'chapter'
        // Contoh asli: /mother-s-friends-chapter-9/, /i-ll-plug-it-in-chapter-33/
        let matches = extractAll(/<a href="([^"]*chapter[^"]*)"[^>]*>[\s\S]{0,300}?<span class="chapternum">([^<]+)<\/span>/gi, html);
        if (matches.length === 0) matches = extractAll(/<a href="([^"]*chapter[^"]*)"[^>]*>([^<]{3,120})<\/a>/gi, html);
        if (matches.length === 0) matches = extractAll(/<li[^>]*>[\s\S]{0,300}?<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, html);

        const chapters = [];
        const seenCh = new Set();
        for (const m of matches) {
            const chUrl = m[1];
            const chTitle = (m[2] || '').trim();
            if (!chUrl || seenCh.has(chUrl)) continue;
            if (!chUrl.toLowerCase().includes('chapter')) continue;
            if (chUrl.includes('/manga/') && !chUrl.includes('chapter')) continue;
            seenCh.add(chUrl);
            chapters.push({ id: chUrl, title: chTitle || chUrl.split('/').filter(Boolean).pop(), date: '-' });
        }

        return {
            title: title,
            cover_url: cover,
            description: cleanDesc || 'Tidak ada deskripsi.',
            rating: '-',
            views: '-',
            genres: genres,
            author: author || 'Mangasusu',
            artist: author || 'Mangasusu',
            chapters: chapters,
        };
    },

    // -- Gambar chapter --
    async getChapterImages(viewerUrl) {
        const fullUrl = viewerUrl.startsWith('http') ? viewerUrl : BASE + viewerUrl;
        const html = await fetchHtml(fullUrl);

        let listHtml = extractMatch(/<div[^>]*id="readerarea"[^>]*>([\s\S]*?)<\/div>\s*<div/i, html);
        if (!listHtml) listHtml = extractMatch(/<div class="entry-content"[^>]*>([\s\S]*?)<\/div>\s*<div/i, html);
        if (!listHtml) listHtml = extractMatch(/<div[^>]*reading-content[^>]*>([\s\S]*?)<\/div>\s*<div/i, html);
        if (!listHtml) listHtml = html;

        let matches = extractAll(/data-src="([^"]+)"/g, listHtml);
        if (matches.length === 0) matches = extractAll(/data-lazy-src="([^"]+)"/g, listHtml);
        if (matches.length === 0) matches = extractAll(/data-original="([^"]+)"/g, listHtml);
        if (matches.length === 0) matches = extractAll(/<img[^>]*src="([^"]+)"/g, listHtml);

        const images = [];
        const seenImg = new Set();
        for (const m of matches) {
            let img = m[1];
            if (!img) continue;
            if (img.startsWith('//')) img = 'https:' + img;
            if (img.includes('logo') || img.includes('placeholder') || img.includes('banner') || img.includes('avatar') || img.includes('favicon') || img.includes('facebook') || img.includes('twitter')) continue;
            if (seenImg.has(img)) continue;
            seenImg.add(img);
            images.push(img);
        }
        return images;
    },
};
