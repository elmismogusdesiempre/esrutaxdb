(()=>{
  const api=window.RutaXAPI.request,$=id=>document.getElementById(id);
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let current=null,settingsData=null,page='settings',deliveryRows=[],deliveryOffset=0,noticeTimer=null,refreshBusy=false,outboxBusy=false;
  const labels={urgent:'🔴 Urgente',info:'🟡 Informativo',friendly:'🟢 Amigable'};
  function status(message,error=false){const box=$('rxStatus');if(box){box.textContent=message;box.classList.toggle('error',error);}}
  async function action(button,fn){if(button)button.disabled=true;try{await fn();}catch(err){status(err.message,true);window.RutaXUI?.toast(err.message,3500);}finally{if(button)button.disabled=false;}}
  function applyTheme(value){const dark=value==='dark'||value==='system'&&matchMedia('(prefers-color-scheme: dark)').matches;document.body.dataset.theme=dark?'dark':'light';localStorage.setItem('rx_theme',value);}
  applyTheme(localStorage.getItem('rx_theme')||'system');
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>applyTheme(current?.messenger.theme||localStorage.getItem('rx_theme')||'system'));
  function updateAvatar(){const a=$('avatar');if(a&&current?.messenger.avatar){const img=document.createElement('img');img.src=current.messenger.avatar;img.alt='Mi perfil';a.replaceChildren(img);}}
  const panel=document.createElement('section');panel.id='rxPanel';panel.className='rx-panel';panel.setAttribute('aria-label','Centro de administración');panel.innerHTML='<header class="rx-panel-header"><button id="rxClose" aria-label="Volver">←</button><h2 id="rxPanelTitle">Centro de administración</h2></header><div class="rx-panel-body"><div id="rxTabs" class="rx-tabs"></div><div id="rxContent"></div><div id="rxStatus" class="rx-status" role="status"></div></div>';document.body.append(panel);
  $('rxClose').onclick=()=>panel.classList.remove('active');
  document.addEventListener('keydown',e=>{if(e.key==='Escape')panel.classList.remove('active');});
  function addToolbar(parent){const el=document.createElement('div');el.className='rx-toolbar';el.innerHTML='<button class="rx-btn primary" data-center>Ajustes y avisos</button><button class="rx-btn" data-deliveries>Gestionar entregas</button><button class="rx-btn" data-profile>Mi PIN</button>';parent.prepend(el);el.querySelector('[data-center]').onclick=()=>openAdmin('settings');el.querySelector('[data-deliveries]').onclick=()=>openAdmin('deliveries');el.querySelector('[data-profile]').onclick=()=>openAdmin('profile');}
  addToolbar($('adminMensajerosView'));addToolbar($('adminDesktopOverlay'));
  // El listado heredado repinta el contenedor: conserva un acceso en la cabecera móvil.
  const mobileButton=document.createElement('button');mobileButton.className='rx-inbox-btn';mobileButton.textContent='⚙';mobileButton.title='Ajustes y avisos';mobileButton.onclick=()=>openAdmin('settings');$('adminSubtitle').parentElement.after(mobileButton);
  const inbox=document.createElement('button');inbox.className='rx-inbox-btn';inbox.id='rxInbox';inbox.textContent='Avisos';inbox.onclick=openNotices;$('settingsBtn').before(inbox);
  const queueBar=document.createElement('div');queueBar.className='rx-queue';queueBar.hidden=true;$('app').prepend(queueBar);
  const personal=document.createElement('div');personal.className='settings-section rx-personal-section';personal.innerHTML='<h3>Mi perfil</h3><div id="rxPersonal"></div>';$('settingsOverlay').querySelector('.settings-body').prepend(personal);
  function profileMarkup(admin=false){return `<label class="rx-field">Tema<select id="rxTheme"><option value="system">Usar el del dispositivo</option><option value="light">Claro</option><option value="dark">Oscuro</option></select></label>${admin?'':`<label class="rx-field">Foto de perfil<input id="rxAvatarFile" type="file" accept="image/jpeg,image/png,image/webp"></label><img id="rxAvatarPreview" class="rx-avatar" alt="Mi perfil" hidden>`}<label class="rx-field">PIN actual<input id="rxCurrentPin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="${admin?6:4}"></label><label class="rx-field">Nuevo PIN de ${admin?6:4} dígitos<input id="rxNewPin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="${admin?6:4}"></label><label class="rx-field">Repetir nuevo PIN<input id="rxRepeatPin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="${admin?6:4}"></label><button id="rxSaveProfile" class="rx-btn primary">Guardar perfil</button>`;}
  function wireProfile(admin=false){
    $('rxTheme').value=current?.messenger.theme||'system';let avatar=null;
    const preview=$('rxAvatarPreview');if(preview&&current?.messenger.avatar){preview.src=current.messenger.avatar;preview.hidden=false;}
    $('rxAvatarFile')?.addEventListener('change',async e=>{
      const f=e.target.files[0];if(!f)return;
      if(!/^image\/(jpeg|png|webp)$/.test(f.type)||f.size>10000000){window.RutaXUI.toast('Elige una imagen de menos de 10 MB');return;}
      try {const image=await createImageBitmap(f),c=document.createElement('canvas');c.width=c.height=160;const size=Math.min(image.width,image.height);c.getContext('2d').drawImage(image,(image.width-size)/2,(image.height-size)/2,size,size,0,0,160,160);image.close();avatar=c.toDataURL('image/jpeg',.7);preview.src=avatar;preview.hidden=false;}catch{window.RutaXUI.toast('No se pudo abrir la foto');}
    });
    $('rxSaveProfile').onclick=e=>action(e.target,async()=>{
      const payload={theme:$('rxTheme').value};if(avatar)payload.avatar=avatar;
      if($('rxNewPin').value){if($('rxNewPin').value!==$('rxRepeatPin').value)throw new Error('Los PIN no coinciden');payload.currentPin=$('rxCurrentPin').value;payload.newPin=$('rxNewPin').value;if(!(admin?/^\d{6}$/:/^\d{4}$/).test(payload.newPin))throw new Error('Revisa los dígitos del PIN');}
      const data=await api('profile',payload);current.messenger=data.messenger;applyTheme(data.messenger.theme);updateAvatar();['rxCurrentPin','rxNewPin','rxRepeatPin'].forEach(id=>$(id).value='');window.RutaXUI.toast('Perfil actualizado');
    });
  }
  function renderPersonal(){if(!current||current.role==='admin')return;$('rxPersonal').innerHTML=profileMarkup();wireProfile();}
  window.addEventListener('rutax:session',event=>{
    current=event.detail;applyTheme(current.messenger.theme||'system');setTimeout(updateAvatar,0);
    // No recrear el formulario mientras el usuario lo edita.
    if(!$('rxTheme')&&!$('settingsOverlay').classList.contains('active'))renderPersonal();
    if(!noticeTimer){noticeTimer=setInterval(tick,45000);loadBadge();setTimeout(()=>flushOutbox(true),2000);}
    if(new URLSearchParams(location.search).has('avisos')){history.replaceState({},'',location.pathname);setTimeout(openNotices,300);}
  });
  window.addEventListener('rutax:logout',()=>{current=null;$('rxPersonal').innerHTML='';clearInterval(noticeTimer);noticeTimer=null;panel.classList.remove('active');queueBar.hidden=true;applyTheme('system');});
  $('settingsBtn').addEventListener('click',renderPersonal);
  async function openAdmin(tab){if(current?.role!=='admin')return;page=tab;panel.classList.add('active');$('rxPanelTitle').textContent='Centro de administración';$('rxTabs').innerHTML=[['settings','Ajustes'],['broadcast','Avisos masivos'],['deliveries','Entregas'],['csv','Cargar CSV'],['profile','Mi perfil']].map(([id,name])=>`<button class="rx-btn ${id===tab?'active':''}" data-page="${id}">${name}</button>`).join('');$('rxTabs').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>openAdmin(b.dataset.page));$('rxContent').innerHTML='<div class="rx-empty">Cargando…</div>';status('');await action(null,async()=>{if(tab==='settings')await renderSettings();if(tab==='broadcast')renderBroadcast();if(tab==='deliveries')renderDeliveries();if(tab==='csv')await renderCSV();if(tab==='profile'){$('rxPersonal').innerHTML='';$('rxContent').innerHTML='<div class="rx-card">'+profileMarkup(true)+'</div>';wireProfile(true);}});}
  const settingLabels={requireRecipient:'Nombre de quien recibe',allowNoPhoto:'Permitir entrega sin foto',promptWhatsApp:'Preguntar WhatsApp al entregar',requireSignature:'Firma del cliente',signatureColor:'Color de firma',geocodeCountry:'Región de geocodificación'};
  async function renderSettings(){
    settingsData=await api('admin_settings');
    $('rxContent').innerHTML=`<div class="rx-grid"><section class="rx-card"><h3>1. Elige a quién aplicar</h3><label class="rx-check"><input id="rxAll" type="checkbox" checked>Todos, incluidos futuros repartidores</label><div id="rxTargets">${settingsData.messengers.map(m=>`<label class="rx-check"><input type="checkbox" value="${esc(m.code)}" disabled>${esc(m.name)} · ${esc(m.code)}</label>`).join('')}</div></section><section class="rx-card"><h3>2. Elige los cambios</h3><p>Marca una opción para cambiarla por separado, o varias para aplicarlas juntas. Las opciones sin marcar se conservan.</p><button id="rxSelectSettings" class="rx-btn">Seleccionar todas las opciones</button>${Object.entries(settingLabels).map(([key,label])=>`<div class="rx-setting-row"><input aria-label="Aplicar ${esc(label)}" type="checkbox" data-apply="${key}"><label for="rxValue-${key}">${label}</label>${key==='signatureColor'?`<input id="rxValue-${key}" type="color" value="${esc(settingsData.defaults[key])}">`:key==='geocodeCountry'?`<input id="rxValue-${key}" type="text" maxlength="120" value="${esc(settingsData.defaults[key]||'')}" placeholder="País o ciudad">`:`<select id="rxValue-${key}"><option value="true" ${settingsData.defaults[key]?'selected':''}>Activado</option><option value="false" ${!settingsData.defaults[key]?'selected':''}>Desactivado</option></select>`}</div>`).join('')}<p id="rxSettingsScope">Se muestran los valores globales actuales.</p><button id="rxSaveSettings" class="rx-btn primary">Aplicar cambios seleccionados</button></section></div>`;
    const targets=()=>[...$('rxTargets').querySelectorAll('input:checked')].map(x=>x.value);
    function scope(){const selected=targets(),one=!$('rxAll').checked&&selected.length===1?settingsData.messengers.find(m=>m.code===selected[0]):null;
      if(one)for(const k of Object.keys(settingLabels))$('rxValue-'+k).value=String(one.settings[k]??'');
      $('rxSettingsScope').textContent=one?'Valores efectivos de '+one.name:($('rxAll').checked?'Se muestran los valores globales. Los cambios seleccionados se aplicarán a todos.':'Al seleccionar varios se aplicarán únicamente las opciones marcadas.');}
    $('rxAll').onchange=()=>{$('rxTargets').querySelectorAll('input').forEach(x=>x.disabled=$('rxAll').checked);scope();};$('rxTargets').onchange=scope;
    $('rxSelectSettings').onclick=()=>{$('rxContent').querySelectorAll('[data-apply]').forEach(x=>x.checked=true);};
    $('rxSaveSettings').onclick=e=>action(e.target,async()=>{const patch={};$('rxContent').querySelectorAll('[data-apply]:checked').forEach(x=>{const v=$('rxValue-'+x.dataset.apply).value;patch[x.dataset.apply]=['signatureColor','geocodeCountry'].includes(x.dataset.apply)?v:v==='true';});if(!Object.keys(patch).length)throw new Error('Marca las opciones que quieres aplicar');if(!$('rxAll').checked&&!targets().length)throw new Error('Selecciona al menos un repartidor');await api('admin_settings',{all:$('rxAll').checked,codes:targets(),patch});status('Cambios aplicados. Los repartidores recibirán la configuración al actualizar y antes de registrar una entrega.');settingsData=await api('admin_settings');});
  }
  function renderBroadcast(){
    $('rxContent').innerHTML=`<section class="rx-card"><h3>Un mensaje para todo el equipo</h3><p>Se guardará en los avisos de todos los repartidores activos y se enviará una notificación a los dispositivos que la hayan autorizado.</p><div class="rx-level">${Object.entries(labels).map(([key,label])=>`<label><input type="radio" name="rxLevel" value="${key}" ${key==='info'?'checked':''}> ${label}</label>`).join('')}</div><label class="rx-field">Título<input id="rxNoticeTitle" maxlength="100" placeholder="Ej. Cambio de punto de recogida"></label><label class="rx-field">Mensaje<textarea id="rxNoticeBody" maxlength="1500" placeholder="Escribe el mensaje para el equipo…"></textarea></label><button id="rxSendNotice" class="rx-btn primary">Enviar a todos los repartidores</button></section>`;
    $('rxSendNotice').onclick=e=>action(e.target,async()=>{if(!confirm('¿Enviar este aviso a todos los repartidores activos?'))return;const result=await api('admin_broadcast',{title:$('rxNoticeTitle').value,body:$('rxNoticeBody').value,level:document.querySelector('[name=rxLevel]:checked').value});status('Aviso guardado para todo el equipo. '+(result.push.error?result.push.error:result.push.configured?`Notificaciones aceptadas por el proveedor: ${result.push.sent}. Fallidas: ${result.push.failed}.`:'Falta configurar las claves push en Vercel para enviar notificaciones.'));$('rxNoticeTitle').value='';$('rxNoticeBody').value='';});
  }
  const dateString=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  function renderDeliveries(){const today=dateString(new Date());$('rxContent').innerHTML=`<section class="rx-card"><h3>Gestionar entregas</h3><p>Selecciona una o varias entregas. La eliminación las oculta del historial y queda registrada; no convierte el paquete en pendiente. Las fotos siguen su retención de 30 días.</p><div class="rx-grid"><label class="rx-field">Desde<input id="rxFrom" type="date" value="${today}"></label><label class="rx-field">Hasta<input id="rxUntil" type="date" value="${today}"></label></div><button id="rxLoadDeliveries" class="rx-btn">Buscar entregas</button> <button id="rxDeleteDeliveries" class="rx-btn danger" disabled>Eliminar selección</button><div class="rx-table-wrap" id="rxDeliveryList"></div><button id="rxNextDeliveries" class="rx-btn" hidden>Siguientes 200</button></section>`;
    $('rxLoadDeliveries').onclick=e=>action(e.target,async()=>{deliveryOffset=0;await loadDeliveries();});$('rxNextDeliveries').onclick=e=>action(e.target,async()=>{deliveryOffset+=200;await loadDeliveries();});
    $('rxDeleteDeliveries').onclick=e=>action(e.target,async()=>{const chosen=[...document.querySelectorAll('[data-delivery]:checked')].map(x=>deliveryRows[+x.dataset.delivery]);if(!chosen.length)return;if(!confirm('¿Eliminar '+chosen.length+' entrega(s) del historial?'))return;const r=await api('admin_delete_deliveries',{keys:chosen.map(x=>({code:x.code,id:x.id}))});status(r.deleted+' entrega(s) eliminadas del historial.');await loadDeliveries();});
    action(null,loadDeliveries);
  }
  async function loadDeliveries(){const since=new Date($('rxFrom').value+'T00:00:00').getTime(),until=new Date($('rxUntil').value+'T00:00:00').getTime()+86400000;if(!Number.isFinite(since)||!Number.isFinite(until))throw new Error('Elige un rango de fechas');const data=await api('admin_deliveries',{since,until,offset:deliveryOffset});deliveryRows=data.events;
    $('rxDeliveryList').innerHTML=deliveryRows.length?`<table class="rx-table"><thead><tr><th><input type="checkbox" id="rxSelectDeliveries" aria-label="Seleccionar esta página"></th><th>Guía / cliente</th><th>Repartidor</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>${deliveryRows.map((row,i)=>`<tr><td><input type="checkbox" data-delivery="${i}" aria-label="Seleccionar entrega ${esc(row.data.guide)}"></td><td><strong>${esc(row.data.guide)}</strong><br>${esc(row.data.client)}</td><td>${esc(row.data.messengerName||row.code)}</td><td>${row.data.undoneAt?'Deshecha':row.data.status==='delivered'?'Entregada':'Novedad'}</td><td>${esc(new Date(row.data.timestamp).toLocaleString('es'))}</td></tr>`).join('')}</tbody></table>`:'<div class="rx-empty">No hay entregas en esta página.</div>';
    $('rxNextDeliveries').hidden=deliveryRows.length<200;$('rxDeleteDeliveries').disabled=true;
    const update=()=>{$('rxDeleteDeliveries').disabled=!document.querySelector('[data-delivery]:checked');};$('rxDeliveryList').onchange=update;
    if($('rxSelectDeliveries'))$('rxSelectDeliveries').onchange=e=>{document.querySelectorAll('[data-delivery]').forEach(x=>x.checked=e.target.checked);update();};
  }
  async function renderCSV(){const data=await api('admin_list_messengers');let items=[];$('rxContent').innerHTML=`<section class="rx-card"><h3>Asignar una ruta CSV</h3><p>Columnas: guia, cliente, direccion, telefono, tipo; lat y lng opcionales. Usar coordenadas reduce consultas a los mapas gratuitos.</p><label class="rx-field">Repartidor<select id="rxCSVTarget">${data.messengers.filter(x=>x.active).map(m=>`<option value="${esc(m.code)}">${esc(m.name)} · ${esc(m.code)}</option>`).join('')}</select></label><label class="rx-field">Archivo<input id="rxCSVFile" type="file" accept=".csv,text/csv"></label><label class="rx-field">Cómo asignar<select id="rxCSVMode"><option value="append">Añadir a su ruta</option><option value="replace">Reemplazar destinos pendientes</option></select></label><div id="rxCSVPreview" class="rx-status"></div><button id="rxAssignCSV" class="rx-btn primary" disabled>Asignar ruta</button></section>`;
    $('rxCSVFile').onchange=async e=>{items=[];$('rxAssignCSV').disabled=true;const f=e.target.files[0];if(!f)return;if(f.size>2000000){status('Archivo demasiado grande',true);return;}items=window.RutaXUI.parseCSV(await f.text());$('rxCSVPreview').textContent=items.length+' destinos detectados.\n'+items.slice(0,5).map(x=>`${x.guide} · ${x.client} · ${x.address}`).join('\n');$('rxAssignCSV').disabled=!items.length||items.length>1000;};
    $('rxAssignCSV').onclick=e=>action(e.target,async()=>{if($('rxCSVMode').value==='replace'&&!confirm('¿Reemplazar todos los destinos pendientes de este repartidor?'))return;const r=await window.RutaXAPI.adminAssignRoute($('rxCSVTarget').value,items,$('rxCSVMode').value);status(r.added+' destinos asignados.');items=[];$('rxCSVPreview').textContent='';$('rxCSVFile').value='';setTimeout(()=>$('rxAssignCSV')&&($('rxAssignCSV').disabled=true),0);});
  }
  async function enablePush(){
    if(!('serviceWorker' in navigator)||!('PushManager' in window))throw new Error('Este navegador no admite notificaciones push. En iPhone añade primero la app a la pantalla de inicio.');
    const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Permite las notificaciones desde los ajustes del navegador');
    const {publicKey}=await api('push_config');if(!publicKey)throw new Error('El administrador debe configurar las claves de notificaciones en Vercel');
    const reg=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
    const bytes=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const subscription=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});await api('push_subscribe',{subscription:subscription.toJSON()});status('Notificaciones activadas en este dispositivo.');
  }
  async function openNotices(){if(!current)return;panel.classList.add('active');$('rxPanelTitle').textContent='Avisos del equipo';$('rxTabs').innerHTML='';$('rxContent').innerHTML='<div class="rx-empty">Cargando avisos…</div>';status('');await action(null,async()=>{const data=await api('notices');$('rxContent').innerHTML=`<section class="rx-card"><h3>Notificaciones</h3><p>Actívalas para recibir avisos aunque la app no esté abierta. En iPhone instala primero Ruta X en la pantalla de inicio.</p><button class="rx-btn primary" id="rxEnablePush">Activar en este dispositivo</button></section>`+(data.notices.length?data.notices.map(n=>`<article class="rx-card rx-notice ${n.level} ${n.readAt?'read':''}"><span class="rx-pill">${labels[n.level]}</span><h3>${esc(n.title)}</h3><div class="rx-notice-body">${esc(n.body)}</div><p>${esc(new Date(n.created_at).toLocaleString('es'))}</p>${n.readAt?'Leído':`<button class="rx-btn" data-read="${n.id}">Marcar leído</button>`}</article>`).join(''):'<div class="rx-empty">Todavía no tienes avisos.</div>');$('rxEnablePush').onclick=e=>action(e.target,enablePush);document.querySelectorAll('[data-read]').forEach(b=>b.onclick=()=>action(b,async()=>{await api('read_notice',{id:b.dataset.read});b.closest('article').classList.add('read');b.remove();loadBadge();}));});}
  const historyButton=document.createElement('button');historyButton.className='rx-btn';historyButton.textContent='Cargar historial anterior';historyButton.style.margin='12px 16px';$('viewRegistro').append(historyButton);
  historyButton.onclick=e=>action(e.target,async()=>{const cursor=window.RutaXUI.historyCursor();if(!cursor){window.RutaXUI.toast('Todavía no hay entregas anteriores');return;}const data=await api('history',{before:cursor.timestamp,id:cursor.id});window.RutaXUI.appendHistory(data.events);if(!data.events.length)window.RutaXUI.toast('Has llegado al inicio del historial');});
  async function loadBadge(){if(current?.role!=='messenger')return;try{const r=await api('notices');const n=r.notices.filter(x=>!x.readAt).length;inbox.textContent=n?'Avisos · '+n:'Avisos';}catch{}}
  async function flushOutbox(retry=true){
    if(!current||current.role!=='messenger'||outboxBusy)return;
    outboxBusy=true;
    try {
      let rows=(await RutaXOutbox.list()).filter(row=>row.code===current.messenger.code);
      queueBar.hidden=!rows.length;
      queueBar.textContent=rows.length+' entrega(s) pendientes de sincronizar. Toca para reintentar.';
      let completed=false;
      if(retry&&navigator.onLine)for(const row of rows){
        try {await api('save_event',{event:row.event,photos:row.photos});await RutaXOutbox.remove(row.key);completed=true;}
        catch(err){queueBar.hidden=false;queueBar.textContent='Entrega pendiente: '+err.message+'. Toca para reintentar.';break;}
      }
      rows=(await RutaXOutbox.list()).filter(row=>row.code===current.messenger.code);
      if(!rows.length)queueBar.hidden=true;
      if(completed){const data=await window.RutaXAPI.pull();window.RutaXUI.apply(data);}
    }catch(err){queueBar.hidden=false;queueBar.textContent='No se pudo acceder a las evidencias pendientes. Mantén esta pestaña abierta.';}
    finally{outboxBusy=false;}
  }
  queueBar.onclick=()=>flushOutbox(true);
  window.addEventListener('online',()=>flushOutbox(true));
  window.addEventListener('rutax:outbox',()=>flushOutbox(false));
  async function tick(){if(!current||refreshBusy||document.hidden)return;refreshBusy=true;try{await flushOutbox(true);await loadBadge();if(current.role==='messenger'&&!document.querySelector('#detailOverlay.active,#addPackageOverlay.active,#undoOverlay.active')){const data=await window.RutaXAPI.pull();window.RutaXUI.apply(data);updateAvatar();}}catch(err){if(err.status===401){clearInterval(noticeTimer);noticeTimer=null;window.RutaXUI.toast('Tu sesión terminó. Vuelve a ingresar.');location.reload();}}finally{refreshBusy=false;}}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
  navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='OPEN_NOTICES')openNotices();});
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
})();
