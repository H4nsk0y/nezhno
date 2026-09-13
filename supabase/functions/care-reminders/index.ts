import { authorized, db, currentSlot, needsReminder, sendPush } from '../_shared/core.ts';

Deno.serve(async request=>{
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  if(!await authorized(request.headers.get('x-cron-secret'),'CRON_SECRET'))return new Response('Unauthorized',{status:401});
  const client=db();
  try{
    const {data:row,error}=await client.from('care_state').select('data').eq('id',1).single();
    if(error)throw error;
    if(!row?.data)return Response.json({skipped:'not configured'});
    const slot=currentSlot(new Date(),row.data.settings.timezone);
    if(!slot||!needsReminder(row.data,slot.day))return Response.json({skipped:'outside reminder window or completed'});
    const {data:subscriptions,error:subscriptionError}=await client.from('care_subscriptions').select('id,subscription');
    if(subscriptionError)throw subscriptionError;
    let sent=0,failed=0;
    for(const subscription of subscriptions){
      let claimed=false;
      const {error:insertError}=await client.from('care_deliveries').insert({subscription_id:subscription.id,slot:slot.id});
      if(!insertError)claimed=true;
      else if(insertError.code==='23505'){
        const {data,error:readError}=await client.from('care_deliveries').select('status,updated_at').eq('subscription_id',subscription.id).eq('slot',slot.id).single();
        if(readError)throw readError;
        if(data.status==='sent'||(data.status==='sending'&&Date.now()-Date.parse(data.updated_at)<120000))continue;
        const {data:retry,error:retryError}=await client.from('care_deliveries').update({status:'sending',updated_at:new Date().toISOString()}).eq('subscription_id',subscription.id).eq('slot',slot.id).eq('updated_at',data.updated_at).select('slot');
        if(retryError)throw retryError;
        claimed=Boolean(retry?.length);
      }else throw insertError;
      if(!claimed)continue;
      try{
        await sendPush(subscription.subscription,'nezhno-'+slot.id);
        const {error:markError}=await client.from('care_deliveries').update({status:'sent',updated_at:new Date().toISOString()}).eq('subscription_id',subscription.id).eq('slot',slot.id);
        if(markError)throw markError;
        sent++;
      }catch(pushError){
        failed++;
        if([404,410].includes((pushError as any).statusCode))await client.from('care_subscriptions').delete().eq('id',subscription.id);
        else await client.from('care_deliveries').update({status:'failed',updated_at:new Date().toISOString()}).eq('subscription_id',subscription.id).eq('slot',slot.id);
      }
    }
    await client.from('care_deliveries').delete().lt('updated_at',new Date(Date.now()-30*86400000).toISOString());
    return Response.json({sent,failed},{status:failed?502:200});
  }catch(error){console.error('reminder failure',error instanceof Error?error.name:'database');return Response.json({error:'Reminder delivery failed'},{status:500});}
});
