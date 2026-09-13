import {currentSlot,needsReminder,validState,validSubscription,authorized} from './core.ts';
import {initialState} from '../../../src/model.js';
function assert(value:unknown){if(!value)throw new Error('Assertion failed');}
Deno.test('Moscow reminders at 7,10,13,16,19,22 only; no overnight or stale push',()=>{
  for(const hour of [4,7,10,13,16,19])assert(currentSlot(new Date(`2026-09-13T${String(hour).padStart(2,'0')}:00:00Z`),'Europe/Moscow'));
  for(const time of ['03:59','04:10','20:00','22:00'])assert(!currentSlot(new Date(`2026-09-13T${time}:00Z`),'Europe/Moscow'));
});
Deno.test('skip complete days and unscheduled days',()=>{const s:any=initialState();assert(needsReminder(s,'2026-09-13'));s.days['2026-09-13']={completedAt:'2026-09-13',items:[]};assert(!needsReminder(s,'2026-09-13'));s.medicines=[];assert(!needsReminder(s,'2026-09-14'));});
Deno.test('state validation rejects malformed and empty completed records',()=>{assert(validState(initialState()));const s:any=initialState();s.days['2026-09-13']={items:[],taken:{},completedAt:'2026-09-13T10:00:00Z'};assert(!validState(s));s.days={};s.medicines[0].times=['25:00'];assert(!validState(s));});
Deno.test('push destination allowlist rejects local and lookalike hosts',()=>{const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}};assert(validSubscription(sub));for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.test/a','https://evil.test/a'])assert(!validSubscription({...sub,endpoint}));});
Deno.test('no access without a strong configured secret',async()=>{assert(!await authorized(null,'UNSET_TEST_SECRET'));assert(!await authorized('short','UNSET_TEST_SECRET'));});
