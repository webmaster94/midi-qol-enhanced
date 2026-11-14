const { chromium } = await import(process.env.MIDI_PLAYWRIGHT_MODULE ?? 'playwright');
import fs from 'node:fs/promises';
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
try {
 await page.goto(process.env.MIDI_TEST_URL ?? 'http://localhost:49170',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>game?.view === 'join' && document.querySelector('button'));
 if(await page.locator('select').count()) {
  await page.locator('select').selectOption({label:'Gamemaster'});
  await page.locator('button[name=join]').click();
  await page.waitForFunction(()=>globalThis.game?.ready,{},{timeout:60000});
 }
 if(!await page.evaluate(()=>game.modules.get('midi-qol')?.active)) {
   await page.evaluate(()=>game.settings.set('core','moduleConfiguration',{...game.settings.get('core','moduleConfiguration'),'midi-qol':true}));
   await page.reload(); await page.waitForFunction(()=>game?.ready,{},{timeout:60000});
 }
 console.log('state',await page.evaluate(()=>({ready:game?.ready,version:game?.version,system:game?.system?.version,modules:[...game.modules].filter(m=>m.active).map(m=>({id:m.id,version:m.version})),invalid:[...game.actors.invalidDocumentIds],scene:canvas.scene?.name})));
 await fs.writeFile('../midi-card-dom.html',await page.evaluate(async()=> (await game.messages.contents.findLast(m=>m.system?.activity)?.renderHTML())?.outerHTML ?? document.body.innerHTML));
 const cardResult = await page.evaluate(await fs.readFile('scripts/dnd6-card-regression.js','utf8'));
 console.log('cards',JSON.stringify({pass:cardResult.pass,checks:cardResult.assertions.length,failures:cardResult.assertions.filter(a=>!a.pass),error:cardResult.error}));
 await fs.writeFile('../midi-current-dom.html',await page.locator('#midi-compatibility-preview').innerHTML());
 await fs.writeFile('../midi-card-results.json',JSON.stringify(cardResult,null,2));
 const forkResult=await page.evaluate(await fs.readFile('scripts/dnd6-fork-runtime.js','utf8'));
 console.log('forkRuntime',JSON.stringify({pass:forkResult.pass,checks:forkResult.checks.length,failures:forkResult.checks.filter(c=>!c.pass)}));
 await fs.writeFile('../midi-fork-runtime-results.json',JSON.stringify(forkResult,null,2));
 console.log('errors',errors);
 if(!cardResult.pass || !forkResult.pass || errors.length) process.exitCode=1;
 await page.screenshot({path:'../midi-startup.png',fullPage:true});
} finally {await browser.close();}

