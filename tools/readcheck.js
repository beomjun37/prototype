// 모바일 가독성 자동 점검: node readcheck.js <file.html> [--width 375]
// 1) 처음 화면 그대로 2) 숨은 화면까지 모두 펼친 상태(글자 크기·대비만)로 점검한다.
const { chromium } = require("playwright");
const path = require("path");

const file = process.argv[2];
const wi = process.argv.indexOf("--width");
const WIDTH = wi > 0 ? +process.argv[wi + 1] : 375;
const LIM = { MIN_FONT: 13, MIN_FONT_HARD: 12, MIN_TAP: 44, MIN_CONTRAST: 4.5, MIN_CONTRAST_LARGE: 3 };

function audit(opts) {
  const { MIN_FONT, MIN_FONT_HARD, MIN_TAP, MIN_CONTRAST, MIN_CONTRAST_LARGE } = opts;
  const parse = s => { const m = s.match(/[\d.]+/g); if (!m) return null; const [r, g, b, a = 1] = m.map(Number); return { r, g, b, a }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  function bgOf(el) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return { unknown: true };
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let out = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) out = blend(layers[i], out);
    return out;
  }
  const label = el => {
    const t = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
    const tag = "<" + el.tagName.toLowerCase() + (el.id ? "#" + el.id : el.className ? "." + String(el.className).split(" ")[0] : "") + ">";
    return t ? t.slice(0, 40) + " " + tag : tag;
  };
  if (opts.reveal) {
    document.querySelectorAll("[hidden]").forEach(e => e.removeAttribute("hidden"));
    document.querySelectorAll("body *").forEach(e => { if (getComputedStyle(e).display === "none" && !/^(SCRIPT|STYLE|TEMPLATE|HEAD|META|LINK)$/.test(e.tagName)) e.style.setProperty("display", "block", "important"); });
  }
  const issues = { smallFont: [], tinyFont: [], contrast: [], tap: [], longPara: [], overflow: null, leakHidden: [] };
  // hidden 속성을 줬는데 CSS display 규칙에 밀려 화면에 그대로 보이는 요소 (흔한 실수: .modal{display:flex})
  if (!opts.reveal) document.querySelectorAll("[hidden]").forEach(e => { if (e.getClientRects().length) issues.leakHidden.push(label(e)); });
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const text = n.textContent.trim(); if (!text) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (el.closest("[aria-hidden=true],script,style,svg")) continue;
    const cs = getComputedStyle(el);
    if (!opts.reveal && (cs.visibility === "hidden" || el.getClientRects().length === 0)) continue;
    const fs = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
    const t = text.replace(/\s+/g, " ").slice(0, 40);
    if (fs < MIN_FONT_HARD) issues.tinyFont.push(`${fs}px "${t}"`);
    else if (fs < MIN_FONT) issues.smallFont.push(`${fs}px "${t}"`);
    const fg = parse(cs.color), bg = bgOf(el);
    if (fg && !bg.unknown) {
      const f = fg.a < 1 ? blend(fg, bg) : fg;
      const op = parseFloat(cs.opacity);
      const ff = op < 1 ? blend({ ...f, a: op }, bg) : f;
      const L1 = lum(ff), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const large = fs >= 24 || (fs >= 18.66 && bold);
      if (ratio < (large ? MIN_CONTRAST_LARGE : MIN_CONTRAST)) issues.contrast.push(`${ratio.toFixed(2)}:1 ${fs}px "${t}"`);
    }
    if (text.length > 90 && !/^(BUTTON|LABEL|A)$/.test(el.tagName)) issues.longPara.push(`${text.length}자 "${t}…"`);
  }
  if (!opts.reveal) {
    document.querySelectorAll("button,a[href],input:not([type=hidden]),select,textarea,[role=button],[onclick],label[for]").forEach(el => {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      if (getComputedStyle(el).visibility === "hidden") return;
      if (r.height < MIN_TAP - 0.5 || r.width < MIN_TAP - 0.5) issues.tap.push(`${Math.round(r.width)}x${Math.round(r.height)} "${label(el)}"`);
    });
    const sw = document.documentElement.scrollWidth;
    if (sw > innerWidth + 1) issues.overflow = `가로 스크롤 발생: 문서 폭 ${sw}px > 화면 ${innerWidth}px`;
  }
  return issues;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 812 }, deviceScaleFactor: 2, colorScheme: process.argv.includes("--dark") ? "dark" : "light" });
  await page.goto("file://" + path.resolve(file));
  await page.waitForTimeout(600);
  const first = await page.evaluate(audit, { reveal: false, ...LIM });
  await page.screenshot({ path: file.replace(/\.html$/, `.${WIDTH}.png`) });
  const all = await page.evaluate(audit, { reveal: true, ...LIM });
  await browser.close();
  const uniq = a => [...new Set(a)];
  const out = (title, a, max = 15) => { a = uniq(a); if (!a.length) return; console.log(`\n## ${title} (${a.length})`); a.slice(0, process.env.ALL ? 999 : max).forEach(x => console.log("- " + x)); if (a.length > max) console.log(`- …외 ${a.length - max}개`); };
  console.log(`# ${path.basename(file)} @ ${WIDTH}px${process.argv.includes("--dark") ? " (다크)" : ""}`);
  out(`[필수] hidden인데 보이는 요소 ([hidden]{display:none!important} 필요)`, first.leakHidden);
  if (first.overflow) console.log("\n## " + first.overflow);
  out(`[필수] 12px 미만 글자`, [...first.tinyFont, ...all.tinyFont]);
  out(`[필수] 대비 부족 (본문 4.5:1, 큰 글자 3:1)`, [...first.contrast, ...all.contrast]);
  out(`[필수] 누르는 영역 44px 미만 (첫 화면)`, first.tap);
  out(`[권장] 12~13px 글자`, [...first.smallFont, ...all.smallFont]);
  out(`[권장] 90자 넘는 한 덩어리 문단`, [...first.longPara, ...all.longPara], 8);
})();
