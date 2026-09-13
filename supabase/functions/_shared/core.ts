import { createClient } from 'npm:@supabase/supabase-js@2.99.3';
import webpush from 'npm:web-push@3.6.7';

export const env = (key: string) => Deno.env.get(key) || '';
export function db() {
  const secret = env('SUPABASE_SERVICE_ROLE_KEY') || JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}').default;
  return createClient(env('SUPABASE_URL'), secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function authorized(token: string | null, secretName: string) {
  const expected = env(secretName);
  if (!token || expected.length < 32 || token.length > 512) return false;
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a,b] = await Promise.all([digest(token), digest(expected)]);
  let difference = 0;
  for (let i=0;i<a.length;i++) difference |= a[i]^b[i];
  return difference === 0;
}
export function validSubscription(subscription: any) {
  try {
    const url = new URL(subscription.endpoint);
    const hosts = ['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','wns.windows.com','notify.windows.com'];
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && hosts.some(h => url.hostname===h || url.hostname.endsWith('.'+h)) && subscription.endpoint.length<4096 && /^[A-Za-z0-9_-]{80,120}$/.test(subscription.keys.p256dh) && /^[A-Za-z0-9_-]{20,30}$/.test(subscription.keys.auth);
  } catch { return false; }
}
export function validState(s: any) {
  const text=(x:any,max:number)=>typeof x==='string'&&x.length<=max;
  const date=(x:any)=>/^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x));
  const time=(x:any)=>typeof x==='string'&&(/^([01]\d|2[0-3]):[0-5]\d$/.test(x)||/^daily-[1-6]$/.test(x));
  const item=(i:any)=>i&&text(i.id,150)&&text(i.name,100)&&text(i.dose,100)&&text(i.note,200)&&time(i.time);
  if (!s || s.version!==1 || !s.settings || !text(s.settings.name,40) || !Number.isInteger(s.settings.rewardAmount) || s.settings.rewardAmount<1 || s.settings.rewardAmount>10000000) return false;
  try {new Intl.DateTimeFormat('en',{timeZone:s.settings.timezone}).format();} catch {return false;}
  if (!Array.isArray(s.medicines)||s.medicines.length>100||!Array.isArray(s.rewards)||s.rewards.length>1000||!s.days||Array.isArray(s.days)||typeof s.days!=='object')return false;
  if (!s.medicines.every((m:any)=>m&&text(m.id,100)&&text(m.name,100)&&text(m.dose,100)&&text(m.note,200)&&date(m.start)&&(!m.end||date(m.end)&&m.end>=m.start)&&Array.isArray(m.days)&&m.days.length>0&&m.days.length<=7&&m.days.every((n:any)=>Number.isInteger(n)&&n>=0&&n<7)&&Array.isArray(m.times)&&m.times.length>0&&m.times.length<=6&&new Set(m.times).size===m.times.length&&m.times.every(time)))return false;
  if(new Set(s.medicines.map((m:any)=>m.id)).size!==s.medicines.length)return false;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:s.settings.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const entries=Object.entries(s.days);
  if(entries.length>10000)return false;
  if(!entries.every(([key,d]:[string,any])=>date(key)&&key<=today&&d&&Array.isArray(d.items)&&d.items.length<=600&&d.items.every(item)&&new Set(d.items.map((i:any)=>i.id)).size===d.items.length&&d.taken&&typeof d.taken==='object'&&!Array.isArray(d.taken)&&Object.entries(d.taken).every(([id,at])=>d.items.some((i:any)=>i.id===id)&&typeof at==='string'&&!Number.isNaN(Date.parse(at)))&&(!d.completedAt||(typeof d.completedAt==='string'&&!Number.isNaN(Date.parse(d.completedAt))&&d.items.length>0&&d.items.every((i:any)=>d.taken[i.id])))))return false;
  return s.rewards.every((r:any)=>r&&text(r.id,100)&&['wb','trip'].includes(r.kind)&&Number.isInteger(r.amount)&&r.amount>0&&r.amount<=10000000&&typeof r.createdAt==='string'&&!Number.isNaN(Date.parse(r.createdAt)))&&new Set(s.rewards.map((r:any)=>r.id)).size===s.rewards.length;
}
export async function sendPush(subscription: any, tag: string, test=false) {
  webpush.setVapidDetails(env('VAPID_SUBJECT'),env('VAPID_PUBLIC_KEY'),env('VAPID_PRIVATE_KEY'));
  return await webpush.sendNotification(subscription,JSON.stringify({title:test?'Найка на связи 🌷':'Минута заботы о себе 🌷',body:test?'Всё получилось! Напоминания смогут приходить сюда.':'Загляни в список на сегодня и отметь то, что уже выпито.',tag}),{TTL:1800,urgency:'normal',timeout:10000});
}
export function currentSlot(now: Date, timezone: string) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  // A short catch-up window tolerates delayed cron invocations without sending stale reminders.
  if(![7,10,13,16,19,22].includes(Number(p.hour))||Number(p.minute)>9)return null;
  return {day:`${p.year}-${p.month}-${p.day}`,id:`${p.year}-${p.month}-${p.day}T${p.hour}:00@${timezone}`};
}
export function needsReminder(state:any,day:string){
  const saved=state.days[day];
  if(saved?.completedAt)return false;
  if(saved)return saved.items.length>0;
  const weekday=(new Date(day+'T12:00:00Z').getUTCDay()+6)%7;
  return state.medicines.some((m:any)=>m.days.includes(weekday)&&m.start<=day&&(!m.end||m.end>=day));
}
