self.addEventListener('push',event=>{
  let n;try {n=event.data.json();}catch{return;}
  const labels={urgent:'🔴 Urgente',info:'🟡 Informativo',friendly:'🟢 Amigable'};
  event.waitUntil(self.registration.showNotification(`${labels[n.level]||'Ruta X'} · ${n.title}`,{
    body:n.body,icon:'/icon.svg',badge:'/icon.svg',tag:n.id,data:{id:n.id},requireInteraction:n.level==='urgent'
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const wins=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const win of wins) if(new URL(win.url).origin===self.location.origin){win.postMessage({type:'OPEN_NOTICES'});return win.focus();}
    return clients.openWindow('/?avisos=1');
  })());
});
