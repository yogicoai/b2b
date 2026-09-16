import puppeteer from 'puppeteer';
import { SignJWT } from 'jose';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
const OUT = process.env.OUT;
const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');
const jwt = await new SignJWT({ user: process.env.ADMIN_ID || 'yogico', role: 'admin' })
  .setProtectedHeader({ alg:'HS256' }).setIssuedAt().setExpirationTime('24h').sign(secret);
const browser = await puppeteer.launch({ headless:'new', args:['--no-sandbox'] });
const page = await browser.newPage();
await page.setCookie({ name:'admin_session', value:jwt, domain:'localhost', path:'/' });
const jobs = [
  [1440,'pipeline-verified','verified'],
  [1024,'pipeline-verified','verified'],
  [ 768,'pipeline-verified','verified'],
  [ 390,'pipeline-verified','verified'],
  [1440,'tool-inbox','inbox'],
  [ 768,'tool-inbox','inbox'],
  [ 390,'tool-inbox','inbox'],
];
for (const [w, view, tag] of jobs) {
  await page.setViewport({ width:w, height:900 });
  await page.goto('http://localhost:3000/', { waitUntil:'networkidle2' });
  await new Promise(r=>setTimeout(r,800));
  await page.evaluate(v=>document.querySelector(`.nav-item[data-view="${v}"]`)?.click(), view);
  await new Promise(r=>setTimeout(r,1500));
  await page.screenshot({ path:`${OUT}/${tag}-${w}.png` });
  console.log(`  찍음 ${tag}-${w}.png`);
}
await browser.close();
