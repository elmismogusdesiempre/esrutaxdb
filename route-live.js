// Suscripción de solo avisos; los datos de ruta se consultan mediante la sesión HttpOnly.
(()=>{
  let code=null,client=null,channel=null,generation=0,refreshTimer=null,retryTimer=null,running=false,again=false;
  const api=window.RutaXAPI;
  function stop(){generation++;code=null;clearTimeout(refreshTimer);clearTimeout(retryTimer);if(client){client.removeAllChannels().catch(()=>{});client.realtime.disconnect();}client=null;channel=null;}
  function queueRefresh(){again=true;clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,180);}
  async function refresh(){
    if(!code||document.hidden)return;
    if(running){again=true;return;}
    running=true;again=false;const account=code;
    try {const data=await api.pull();if(code===account)window.RutaXUI.apply(data,{notify:true});}
    catch(error){if(error.status===401)stop();}
    finally{running=false;if(again&&code&&!document.hidden)queueRefresh();}
  }
  async function start(profile){
    if(code===profile.code&&client)return;
    stop();const attempt=generation;code=profile.code;
    try {
      const config=await api.request('route_live');
      if(attempt!==generation||code!==profile.code)return;
      if(!config.enabled||!window.supabase)return;
      client=supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      channel=client.channel(config.topic,{config:{broadcast:{self:false}}});
      channel.on('broadcast',{event:'route_changed'},queueRefresh).subscribe(status=>{
        if(attempt!==generation)return;
        if(status==='SUBSCRIBED')queueRefresh();
        if(status==='CLOSED'||status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
          clearTimeout(retryTimer);retryTimer=setTimeout(()=>{if(code===profile.code){stop();start(profile);}},10000);
        }
      });
    }catch(error){if(error.status===401)stop();else retryTimer=setTimeout(()=>{if(code===profile.code){stop();start(profile);}},15000);}
  }
  window.addEventListener('rutax:session',event=>{const data=event.detail;if(data.role==='messenger')start(data.messenger);else if(code)stop();});
  window.addEventListener('rutax:logout',stop);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&code)queueRefresh();});
  window.addEventListener('online',()=>{if(code)queueRefresh();});
})();
