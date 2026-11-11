import webpush from 'web-push';
import { db, eq } from './db.js';
export async function sendNotice(notice, subscriptions) {
  if(!process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_PUBLIC_KEY) return {sent:0,failed:0,configured:false};
  webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
  let sent=0,failed=0;
  for(let i=0;i<subscriptions.length;i+=10) {
    await Promise.all(subscriptions.slice(i,i+10).map(async row=>{
      try {await webpush.sendNotification(row.subscription,JSON.stringify({id:notice.id,title:notice.title,body:notice.body,level:notice.level}),{TTL:86400,urgency:notice.level==='urgent'?'high':'normal',timeout:7000});sent++;}
      catch(error) {failed++;if([404,410].includes(error.statusCode)) await db(`rx_push?id=eq.${eq(row.id)}`,{method:'DELETE'});}
    }));
  }
  return {sent,failed,configured:true};
}
