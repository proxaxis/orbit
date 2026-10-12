import puppeteer from 'puppeteer';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const PAGES = ['/', '/privacy', '/terms'];
const WIDTHS = [320, 360, 414, 560, 700, 767, 768, 834, 900, 1023, 1024, 1100, 1279, 1280, 1440, 1920];

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const issues = [];

for (const path of PAGES) {
  for (const width of WIDTHS) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 800 });
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
    } catch (e) {
      issues.push({ page: path, width, kind: 'NAV', detail: e.message });
      await page.close();
      continue;
    }

    // ページ全体の横スクロール有無
    const pageOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (pageOverflow.scrollWidth > pageOverflow.clientWidth + 1) {
      issues.push({
        page: path,
        width,
        kind: 'PAGE-X-OVERFLOW',
        detail: `scrollWidth=${pageOverflow.scrollWidth} > clientWidth=${pageOverflow.clientWidth}`,
      });
    }

    // ビューポートからはみ出す要素
    const offenders = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // overflow:auto/scroll のコンテナ内部は除外(意図的なスクロール)
        let p = el.parentElement;
        let insideScroll = false;
        while (p) {
          const ps = getComputedStyle(p);
          if (ps.overflowX === 'auto' || ps.overflowX === 'scroll') {
            insideScroll = true;
            break;
          }
          p = p.parentElement;
        }
        if (insideScroll) continue;
        if (r.right > vw + 1 || r.left < -1) {
          const sel = el.tagName.toLowerCase() +
            (el.id ? `#${el.id}` : '') +
            (el.className && typeof el.className === 'string'
              ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
              : '');
          out.push({ sel, left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
        }
      }
      return out.slice(0, 20);
    });
    for (const o of offenders) {
      issues.push({
        page: path,
        width,
        kind: 'ELEMENT-OVERFLOW',
        detail: `${o.sel} left=${o.left} right=${o.right} w=${o.w} (vw=${width})`,
      });
    }

    // モバイル幅ではハンバーガーメニューを開いてはみ出し確認
    if (width <= 767 && path === '/') {
      const opened = await page.evaluate(() => {
        const d = document.querySelector('.nav-mobile');
        if (d) d.open = true;
        return !!d;
      });
      if (opened) {
        const menuRect = await page.evaluate(() => {
          const m = document.querySelector('.mobile-menu');
          const r = m.getBoundingClientRect();
          return { left: Math.round(r.left), right: Math.round(r.right) };
        });
        if (menuRect.right > width + 1 || menuRect.left < -1) {
          issues.push({
            page: path,
            width,
            kind: 'MENU-OVERFLOW',
            detail: `mobile-menu left=${menuRect.left} right=${menuRect.right}`,
          });
        }
      }
    }

    await page.close();
  }
  console.log(`checked ${path}`);
}

await browser.close();

if (issues.length === 0) {
  console.log('\nOK: すべての画面幅ではみ出し・崩れは検出されませんでした');
} else {
  console.log(`\n${issues.length} 件の問題:`);
  for (const i of issues) {
    console.log(`[${i.page}] w=${i.width} ${i.kind}: ${i.detail}`);
  }
}
