export const TIMES=['07:00','10:00','13:00','16:00','19:00','22:00'];
export const DAYS=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
export function dateKey(date=new Date(),timeZone='Europe/Moscow'){return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function addDays(key,n){const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function weekday(key){return (new Date(key+'T12:00:00Z').getUTCDay()+6)%7;}
export function weekOf(key){return Array.from({length:7},(_,i)=>addDays(key,i-weekday(key)));}
export function initialState(){return {version:1,settings:{name:'',timezone:'Europe/Moscow',rewardAmount:1500},medicines:[['folic','Фолиевая кислота','1 таблетка',1],['vitamin-d','Витамин Д','Доза по назначению',1],['iodine','Калий йодит','1 таблетка',1],['tardyferon','Тардиферон','1 таблетка',2],['magne','Магне B6 Форте','2 таблетки',2]].map(([id,name,dose,count])=>({id,name,dose,note:'',days:[0,1,2,3,4,5,6],times:Array.from({length:count},(_,i)=>'daily-'+(i+1)),start:'2026-09-13',end:null})),days:{},rewards:[]};}
export function timeLabel(time){return time==='daily-1'?'В течение дня':time==='daily-2'?'Второй приём':time;}
export function planned(state,key){return state.medicines.filter(m=>m.days.includes(weekday(key))&&key>=m.start&&(!m.end||key<=m.end)).flatMap(m=>m.times.map(time=>({id:m.id+':'+time,medicineId:m.id,name:m.name,dose:m.dose,note:m.note,time}))).sort((a,b)=>a.time.localeCompare(b.time));}
export function dayPlan(state,key){return state.days[key]?.items ?? planned(state,key);}
export function ensureDay(state,key){if(!state.days[key])state.days[key]={items:planned(state,key),taken:{},completedAt:null};return state.days[key];}
export function completeDay(state,key,now=new Date()){const today=dateKey(now,state.settings.timezone);if(key>today)throw Error('Будущий день пока нельзя заполнить.');const d=ensureDay(state,key);if(!d.items.length||!d.items.every(i=>d.taken[i.id]))throw Error('Сначала отметь все приёмы этого дня.');d.completedAt=now.toISOString();}
export function completedCount(state){return Object.values(state.days).filter(d=>d.completedAt&&d.items.length&&d.items.every(i=>d.taken[i.id])).length;}
export function rewardStats(state){const count=completedCount(state);return {count,earned:Math.floor(count/10),progress:count%10,available:Math.max(0,Math.floor(count/10)-state.rewards.length)};}
export function claimReward(state,kind,now=new Date()){if(!['wb','trip'].includes(kind))throw Error('Выбери награду.');if(rewardStats(state).available<1)throw Error('До следующей награды осталось совсем немного.');state.rewards.push({id:crypto.randomUUID(),kind,amount:state.settings.rewardAmount,createdAt:now.toISOString()});}
