const {test}=require('node:test');
const assert=require('node:assert/strict');
const {commandOf,createDirectChatControl}=require('../features/directChatControl');
test('exact commands accept case, slash, whitespace and punctuation; prose stays prose',()=>{
 for(const v of ['stop',' STOP! ','/stop','*STOP*','pause ai','opt out'])assert.equal(commandOf(v),'stop');
 for(const v of ['start','/resume','MENU'])assert.equal(commandOf(v),'start');
 for(const v of ['please stop by tomorrow','nonstop','stopwatch','officer'])assert.equal(commandOf(v),null);
});
test('stop suppresses text, media and presence already in flight; start does not revive stale work',async()=>{
 const c=createDirectChatControl();const sent=[];const s={sendMessage:async(...a)=>sent.push(a),sendPresenceUpdate:async(...a)=>sent.push(a)};
 const ticket=await c.ticket('alice');const guarded=c.guard(s,ticket);
 await guarded.sendMessage('alice',{text:'before'});
 await c.command('alice','STOP');
 await guarded.sendMessage('alice',{text:'late'});await guarded.sendMessage('alice',{audio:Buffer.from('x')});await guarded.sendPresenceUpdate('composing','alice');
 await c.command('alice','START');await guarded.sendMessage('alice',{text:'stale after resume'});
 await c.guard(s,await c.ticket('alice')).sendMessage('alice',{text:'new turn'});
 assert.deepEqual(sent.map(a=>a[1].text),['before','new turn']);
});
test('persisted pause survives new controller, and contacts remain independent',async()=>{
 const values=new Map();const opts={read:async j=>values.get(j),write:async(j,v)=>values.set(j,v)};
 let c=createDirectChatControl(opts);await c.command('alice','stop');c=createDirectChatControl(opts);
 assert.equal(c.allowed(await c.ticket('alice')),false);assert.equal(c.allowed(await c.ticket('bob')),true);
 await c.command('alice','start');assert.equal(c.allowed(await c.ticket('alice')),true);
});
test('stop takes effect before slow persistence completes',async()=>{
 let release;const c=createDirectChatControl({write:()=>new Promise(r=>release=r)});const t=await c.ticket('a');
 const pending=c.command('a','stop');assert.equal(c.allowed(t),false);await new Promise(setImmediate);release();await pending;
});
test('a stale database read cannot undo a concurrent stop',async()=>{
 let release;const c=createDirectChatControl({read:()=>new Promise(r=>release=r)});
 const pending=c.ticket('a');await c.command('a','stop');release(false);assert.equal(c.allowed(await pending),false);
});
test('read failure fails closed and failed stop write still suppresses pending output',async()=>{
 const c=createDirectChatControl({read:async()=>{throw Error('offline')}});await assert.rejects(c.ticket('a'));
 const d=createDirectChatControl({write:async()=>{throw Error('offline')}});const t=await d.ticket('a');await assert.rejects(d.command('a','stop'));assert.equal(d.allowed(t),false);
});
test('command writes preserve ordering under rapid stop/start',async()=>{
 const writes=[];const c=createDirectChatControl({write:async(j,v)=>{await new Promise(setImmediate);writes.push(v)}});
 await Promise.all([c.command('a','stop'),c.command('a','start'),c.command('a','stop')]);
 assert.deepEqual(writes,[true,false,true]);assert.equal(c.allowed(await c.ticket('a')),false);
});
test('disappearing-message wrapper still exposes STOP',()=>{
 const {unwrapDirectMessage}=require('../features/directChatControl');
 const m=unwrapDirectMessage({ephemeralMessage:{message:{extendedTextMessage:{text:'STOP'}}}});
 assert.equal(commandOf(m.extendedTextMessage.text),'stop');
});
