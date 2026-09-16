import puppeteer from 'puppeteer';
import { SignJWT } from 'jose';
import { config } from 'dotenv';
config({ path:'.env.local', quiet:true });
const OUT=process.env.OUT;
const secret=new TextEncoder().encode(process.env.JWT_SECRET||'fallback_secret');
const jwt=await new SignJWT({user:process.env.ADMIN_ID||'yogico',role:'admin'})
  .setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('24h').sign(secret);
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
const p=await b.newPage();
await p.setCookie({name:'admin_session',value:jwt,domain:'localhost',path:'/'});
for (const [w,tag,open] of [[390,'m-closed',false],[390,'m-open',true],[768,'t-closed',false]]) {
  await p.setViewport({width:w,height:844});
  await p.goto('http://localhost:3000/',{waitUntil:'networkidle2'});
  await new Promise(r=>setTimeout(r,1500));
  if (open) { await p.click('#navDrawerBtn'); await new Promise(r=>setTimeout(r,450)); }
  await p.screenshot({path:`${OUT}/${tag}.png`});
  console.log('찍음 '+tag);
}
await b.close();
