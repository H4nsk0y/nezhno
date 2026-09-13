import { authorized, db, env, validState, validSubscription, sendPush } from '../_shared/core.ts';

Deno.serve(async request => {
  const origin=env('ALLOWED_ORIGIN');
  const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type, apikey, x-care-token','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json'};
  const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(request.headers.get('origin')&&request.headers.get('origin')!==origin)return response({error:'Источник не разрешён.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return response({error:'Method not allowed'},405);
  if(!await authorized(request.headers.get('x-care-token'),'CARE_ACCESS_TOKEN'))return response({error:'Проверь приватный код доступа.'},401);
  try {
    const raw=await request.text();
    if(raw.length>2_000_000)return response({error:'Слишком много данных.'},413);
    const body=JSON.parse(raw),client=db();
    if(body.action==='load'){
      const {data,error}=await client.from('care_state').select('data,revision').eq('id',1).single();
      if(error)throw error;
      return response({state:data.data,revision:data.revision});
    }
    if(body.action==='save'){
      if(!validState(body.state)||!Number.isInteger(body.revision)||body.revision<0)return response({error:'Проверь данные расписания.'},400);
      const {data,error}=await client.from('care_state').update({data:body.state,revision:body.revision+1,updated_at:new Date().toISOString()}).eq('id',1).eq('revision',body.revision).select('revision').maybeSingle();
      if(error)throw error;
      if(!data)return response({error:'Записи изменились на другом устройстве.'},409);
      return response({revision:data.revision});
    }
    if(body.action==='push-key'){
      if(!env('VAPID_PUBLIC_KEY'))return response({error:'Серверные напоминания ещё не настроены.'},503);
      return response({publicKey:env('VAPID_PUBLIC_KEY')});
    }
    if(body.action==='subscribe'){
      if(!validSubscription(body.subscription))return response({error:'Этот сервис уведомлений не поддерживается.'},400);
      const {error}=await client.from('care_subscriptions').upsert({endpoint:body.subscription.endpoint,subscription:body.subscription},{onConflict:'endpoint'});
      if(error)throw error;
      return response({ok:true});
    }
    if(body.action==='unsubscribe'){
      const {error}=await client.from('care_subscriptions').delete().eq('endpoint',body.endpoint);
      if(error)throw error;
      return response({ok:true});
    }
    if(body.action==='test-push'){
      const {data,error}=await client.from('care_subscriptions').select('subscription');
      if(error)throw error;
      if(!data.length)return response({error:'Сначала включи уведомления на устройстве.'},400);
      const results=await Promise.allSettled(data.map(row=>sendPush(row.subscription,'nezhno-test',true)));
      if(results.some(r=>r.status==='rejected'))return response({error:'Не все устройства приняли уведомление. Попробуй включить уведомления заново.'},502);
      return response({ok:true});
    }
    return response({error:'Неизвестное действие.'},400);
  }catch(error){console.error('care-api failure',error instanceof Error?error.name:'database');return response({error:'Не удалось сохранить данные. Попробуй позже.'},500);}
});
