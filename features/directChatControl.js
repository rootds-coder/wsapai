'use strict';
// In-memory keys are owner-scoped: admin keeps the plain jid, tenants
// use "owner::jid" (see directKey in index.js). The DB, however, stores
// contacts as { jid: rawJid, userId: owner } — so any DB read/write
// must split the composite key first. Writing the composite key as
// the jid (the pre-2026-10-24 bug) never matched a real contact and
// upserted junk docs with jid "owner::jid" and no userId, which broke
// tenant STOP/MENU: MENU's pendingModeSelection=true landed on the
// junk doc, the tenant's real contact kept its old mode with
// pending=false, and the next "1" was treated as a normal chat in
// the OLD persona instead of a picker choice.
function parseDirectKey(key) {
  const s = String(key || '');
  const i = s.indexOf('::');
  if (i < 0) return { owner: 'admin', jid: s };
  return { owner: s.slice(0, i), jid: s.slice(i + 2) };
}
const STOP = new Set(['stop','stop ai','pause','pause ai','off','unsubscribe','optout','opt out','cancel']);
const START = new Set(['start','start ai','resume','resume ai','on','menu']);
function commandOf(text) {
  const normalized=String(text||'').normalize('NFKC').trim().toLowerCase().replace(/^[/*!\s]+|[*.!?\s]+$/g,'').replace(/\s+/g,' ');
  return STOP.has(normalized)?'stop':START.has(normalized)?'start':null;
}
function createDirectChatControl({read=async()=>false,write=async()=>{}}={}) {
  const states=new Map(), queues=new Map();
  function state(jid){if(!states.has(jid))states.set(jid,{paused:false,version:0,loaded:false});return states.get(jid);}
  async function command(jid,text) {
    const action=commandOf(text);if(!action)return null;
    const s=state(jid);s.paused=action==='stop';s.loaded=true;s.version++;
    const paused=s.paused;
    const task=(queues.get(jid)||Promise.resolve()).catch(()=>{}).then(()=>write(jid,paused));
    queues.set(jid,task);
    try {await task;} finally {if(queues.get(jid)===task)queues.delete(jid);}
    return action;
  }
  async function ticket(jid) {
    const s=state(jid),version=s.version;
    if(!s.loaded){const paused=await read(jid);if(s.version===version){s.paused=!!paused;s.loaded=true;}}
    return {jid,version};
  }
  function allowed(t){const s=state(t.jid);return s.loaded&&!s.paused&&s.version===t.version;}
  function guard(sock,t){return new Proxy(sock,{get(target,key){
    const value=target[key];
    if(key==='sendMessage'||key==='sendPresenceUpdate')return (...args)=>allowed(t)?value.apply(target,args):Promise.resolve(undefined);
    return typeof value==='function'?value.bind(target):value;
  }});}
  return {command,ticket,allowed,guard};
}
function unwrapDirectMessage(message) {
  let m=message||{};
  for(let i=0;i<8;i++) {
    const inner=m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.documentWithCaptionMessage?.message;
    if(!inner)break; m=inner;
  }
  return m;
}
module.exports={commandOf,createDirectChatControl,unwrapDirectMessage,parseDirectKey};
