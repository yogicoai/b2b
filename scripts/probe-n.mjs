import puppeteer from 'puppeteer';
import { SignJWT } from 'jose';
import { config } from 'dotenv';
config({path:'.env.local',quiet:true});
const s=new TextEncoder().encode(process.env.JWT_SECRET||'fallback_secret');
const jwt=await new SignJWT({user:'yogico',role:'admin'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('24h').sign(s);
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
const p=await b.newPage();
await p.setCookie({name:'admin_session',value:jwt,domain:'localhost',path:'/'});
await p.setViewport({width:390,height:844});
await p.goto('http://localhost:3000/',{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,1500));
console.log(await p.evaluate(()=>{
  const el = document.elementFromPoint(38, 806);
  const chain=[]; let c=el;
  while(c && chain.length<5){ chain.push(c.tagName.toLowerCase()+(c.id?'#'+c.id:'')+(typeof c.className==='string'&&c.className?'.'+c.className.slice(0,24):'')); c=c.parentElement; }
  return chain.join('  <  ');
}));
await b.close();
