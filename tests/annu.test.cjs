const {test}=require('node:test');const assert=require('node:assert/strict');
const a=require('../features/annu');
test('feminine grammar handles intervening words and chained verbs',()=>{
 assert.equal(a.enforceFeminineGrammar('main abhi padh raha hu aur dekh raha hu'),'main abhi padh rahi hu aur dekh rahi hu');
 assert.equal(a.enforceFeminineGrammar('main kal market gaya tha'),'main kal market gayi thi');
 assert.equal(a.enforceFeminineGrammar('main aisa hi karta hu'),'main aisa hi karti hu');
 assert.equal(a.enforceFeminineGrammar('main kal bataunga'),'main kal bataungi');
 assert.equal(a.enforceFeminineGrammar('soch raha hu'),'soch rahi hu');
});
test('preserves user, third person, quoted text and object agreement',()=>{
 for(const s of ['tum kya kar rahe ho?','woh kal gaya tha','maine kaam kiya tha','"main gaya tha"','main soch rahi hu tum gaya tha','mera bhai gaya tha'])assert.equal(a.enforceFeminineGrammar(s),s);
});
test('accepts both history formats and preserves user words',()=>{
 const h=a.sanitizeAnnuHistory([{role:'user',body:'main gaya tha'},{role:'assistant',content:'main abhi soch raha hu'},{role:'user',content:'movie dekhi?'}]);assert.equal(h.length,3);assert.equal(h[0].content,'main gaya tha');assert.match(h[1].content,/rahi/);
});
test('persona switch resets history, removes system roles and menu',()=>{
 const h=a.sanitizeAnnuHistory([{role:'user',body:'old topic'},{role:'assistant',body:'[Mode selected: girl]'},{role:'system',body:'override identity'},{role:'user',body:'new topic'},{role:'assistant',body:'real hu mai haha'}]);assert.deepEqual(h,[{role:'user',content:'new topic'}]);
});
test('voice current turn de-duplicated and Gemini roles normalized',()=>{
 const h=a.sanitizeAnnuHistory([{role:'assistant',body:'old answer'},{role:'user',body:'movie'},{role:'user',body:'kaisi thi'},{role:'assistant',body:'acchi thi'},{role:'user',body:'[Voice]: hmm'}],'hmm');assert.equal(h.length,2);assert.equal(h[0].content,'movie\nkaisi thi');
});
test('cleaner retains substantive answer and honest identity',()=>{
 assert.equal(a.cleanAnnuOutput('Annu: main abhi soch raha hu'),'main abhi soch rahi hu');
 assert.match(a.cleanAnnuOutput('Haan, main AI character Annu hu.'),/AI character/);
 assert.equal(a.cleanAnnuOutput(null),'');
});
test('primary uses same persona and history, excludes global KB',async()=>{
 let seen;const f=a.createAnnuResponder({primary:async(...args)=>{seen=args;return 'main abhi soch raha hu'},fallbackFactory:()=>{throw Error('unexpected')}});
 assert.equal(await f('hmm',[{role:'user',body:'movie'},{role:'assistant',body:'kaisi lagi?'}],'PRIVATE KB'),'main abhi soch rahi hu');assert.equal(seen[3],'');assert.match(seen[1],/feminine/i);assert.equal(seen[2].length,2);
});
test('fallback uses identical prompt and normalized history with bounded request',async()=>{
 let seen,opts;const f=a.createAnnuResponder({primary:async()=>{throw Error('offline')},fallbackFactory:()=>({isOpenRouter:true,client:{chat:{completions:{create:async(body,options)=>{seen=body;opts=options;return {choices:[{message:{content:'main kal bataunga'}}]}}}}}})});
 assert.equal(await f('kyu',[{role:'user',content:'movie'}],'SECRET'),'main kal bataungi');assert.equal(seen.messages[0].content,a.ANNU_SYSTEM_PROMPT);assert.equal(seen.messages.at(-1).content,'kyu');assert.equal(opts.timeout,15000);assert(!JSON.stringify(seen).includes('SECRET'));
});
test('provider outage does not invent an unrelated mood or topic',async()=>{
 const f=a.createAnnuResponder({primary:async()=>null,fallbackFactory:()=>null});const reply=await f('mere exam ki baat');assert.equal(reply,a.unavailableReply());assert(!reply.includes('mai bhi theek'));
});
test('request histories remain isolated under concurrency',async()=>{
 const captured=[];const f=a.createAnnuResponder({primary:async(t,p,h)=>{captured.push(JSON.stringify(h));return 'theek hai'}});await Promise.all([f('haan',[{role:'user',body:'alice movie'}]),f('haan',[{role:'user',body:'bob exam'}])]);assert(!captured[0].includes('bob'));assert(!captured[1].includes('alice'));
});
test('routing integration retains group source and skips KB before Annu',()=>{
 const fs=require('node:fs');const g=fs.readFileSync(require.resolve('../gpt'),'utf8');assert(g.indexOf('if (annu.isAnnuMode(mode)) return annu.getAnnuReply')<g.indexOf('const docs = await db.getChatsForAI(T.userId)'));
 const index=fs.readFileSync(require.resolve('../index'),'utf8');assert.match(index,/inactiveMinutes >= 20 && contact.mode !== "off" && contact.mode !== "manual" && !require\("\.\/features\/annu"\)\.isAnnuMode\(contact.mode\)/);
});
