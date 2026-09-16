/** 화면 밖에 있는 요소가 "스크롤하면 보이는" 것인지 "아예 못 보는" 것인지 가른다. */
import puppeteer from 'puppeteer';
import { SignJWT } from 'jose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');
const jwt = await new SignJWT({ user: process.env.ADMIN_ID || 'yogico', role: 'admin' })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('24h').sign(secret);
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setCookie({ name: 'admin_session', value: jwt, domain: 'localhost', path: '/' });
const W = Number(process.env.W || 1440);
await page.setViewport({ width: W, height: 900 });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle2' });
await new Promise(r=>setTimeout(r,900));
await page.evaluate(v=>document.querySelector(`.nav-item[data-view="${v}"]`)?.click(), process.env.V || 'tool-inbox');
await new Promise(r=>setTimeout(r,1400));
const out = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return { err: '요소 없음' };
  const r = el.getBoundingClientRect();
  const chain = [];
  let p = el;
  while (p && p !== document.documentElement) {
    const cs = getComputedStyle(p);
    chain.push({
      tag: p.tagName.toLowerCase() + (p.id?'#'+p.id:'') + (typeof p.className==='string'&&p.className?'.'+p.className.trim().split(/\s+/).slice(0,2).join('.'):''),
      overflowX: cs.overflowX,
      clientW: p.clientWidth, scrollW: p.scrollWidth,
      canScrollRight: p.scrollWidth - p.clientWidth,
      width: cs.width, minWidth: cs.minWidth, display: cs.display,
    });
    p = p.parentElement;
  }
  return { vw: document.documentElement.clientWidth, rect: {l:Math.round(r.left), r:Math.round(r.right), w:Math.round(r.width)}, chain };
}, process.env.SEL || 'button.conversation-btn');
console.log(JSON.stringify(out, null, 1));
await browser.close();
