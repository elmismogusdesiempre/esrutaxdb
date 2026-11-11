// Editor compartido: la búsqueda propone un área; el usuario confirma el punto.
(function(){
  let generation=0,map,marker,context,pin=null;
  const overlay=document.createElement('div');overlay.id='locationEditor';overlay.hidden=true;
  overlay.innerHTML='<section class="location-dialog" role="dialog" aria-modal="true" aria-labelledby="locationTitle"><header><h2 id="locationTitle">Dirección y ubicación</h2><button type="button" id="locationClose" aria-label="Cerrar edición">✕</button></header><form id="locationForm"><label for="locationAddress">Dirección del cliente</label><input id="locationAddress" maxlength="500" required autocomplete="street-address"><label for="locationRegion">Ciudad / región para buscar</label><input id="locationRegion" maxlength="180" placeholder="Ej. Cali, Colombia"><button type="button" id="locationSearch">Buscar en el mapa</button><p class="location-help">Toca el mapa o arrastra el pin hasta el destino. La búsqueda es aproximada: confirma siempre el punto.</p><div id="locationMap"></div><button type="button" id="locationConfirm">Confirmar punto mostrado</button><button type="button" id="locationClear">Quitar punto</button><p id="locationStatus" role="status" aria-live="polite"></p><p id="locationError" role="alert"></p><footer><button type="button" id="locationCancel">Cancelar</button><button type="submit" id="locationSave">Guardar</button></footer></form></section>';
  const $=id=>overlay.querySelector('#'+id);
  function close(){generation++;overlay.hidden=true;if(map)map.remove();map=null;marker=null;context=null;}
  function status(){ $('locationStatus').textContent=pin?'Punto confirmado · '+pin.lat.toFixed(6)+', '+pin.lng.toFixed(6):'Sin punto confirmado. Guardar solo la dirección quitará la ubicación anterior.'; }
  function select(point){pin={lat:point.lat,lng:point.lng};if(marker)marker.setLatLng(pin);else {marker=L.marker(pin,{draggable:true,icon:L.divIcon({className:'location-pin',html:'📍',iconSize:[32,40],iconAnchor:[16,36]})}).addTo(map);marker.on('dragend',()=>select(marker.getLatLng()));}status();}
  function clear(){pin=null;if(marker)marker.remove();marker=null;status();}
  async function search(regionOnly=false){
    const ticket=generation;const q=(regionOnly?'':$('locationAddress').value+' ')+$('locationRegion').value;
    if(!q.trim())return;
    $('locationSearch').disabled=true;$('locationError').textContent='';
    try {
      const response=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(q),{headers:{Accept:'application/json'}});
      if(!response.ok)throw Error('El buscador no está disponible. Puedes mover el mapa manualmente.');
      const results=await response.json();if(ticket!==generation)return;
      if(!results.length)throw Error('Sin resultados. Busca la ciudad o mueve el mapa manualmente.');
      map.setView([Number(results[0].lat),Number(results[0].lon)],regionOnly?12:17);
      $('locationError').textContent=regionOnly?'':'Ubicación aproximada. Toca el mapa o confirma el centro si corresponde al destino.';
    }catch(e){if(ticket===generation)$('locationError').textContent=e.message;}
    finally{if(ticket===generation)$('locationSearch').disabled=false;}
  }
  async function open(code,id){
    close();const ticket=generation;overlay.hidden=false;$('locationForm').hidden=true;$('locationTitle').textContent='Cargando destino…';
    try{
      const data=await RutaXAPI.request('package_location_get',{code,id});if(ticket!==generation)return;
      if(data.package.status==='delivered')throw Error('La entrega ya fue completada.');
      context={code,id,version:data.package.locationVersion};$('locationTitle').textContent='Dirección y ubicación';$('locationForm').hidden=false;$('locationError').textContent='';$('locationSave').disabled=false;$('locationSearch').disabled=false;
      $('locationAddress').value=data.package.address||'';$('locationRegion').value=data.region||'';
      map=L.map($('locationMap'),{doubleClickZoom:false}).setView([40.4168,-3.7038],5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
      map.on('click',e=>select(e.latlng));
      if(Number.isFinite(data.package.lat)&&Number.isFinite(data.package.lng)){select({lat:data.package.lat,lng:data.package.lng});map.setView(pin,17);}else{clear();if(data.region)search(true);}
      requestAnimationFrame(()=>{if(map)map.invalidateSize();});$('locationAddress').focus();
    }catch(e){if(ticket===generation){$('locationTitle').textContent=e.message;$('locationForm').hidden=true;}}
  }
  $('locationAddress').addEventListener('input',clear);
  $('locationConfirm').onclick=()=>{if(map)select(map.getCenter());};
  $('locationClear').onclick=clear;$('locationSearch').onclick=()=>search();
  $('locationClose').onclick=close;$('locationCancel').onclick=close;
  overlay.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const elements=[...overlay.querySelectorAll('button,input,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);const first=elements[0],last=elements[elements.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  $('locationForm').onsubmit=async e=>{
    e.preventDefault();if(!context)return;const ticket=generation,editing=context;$('locationSave').disabled=true;$('locationError').textContent='';
    try{const result=await RutaXAPI.request('package_location_save',{code:editing.code,id:editing.id,address:$('locationAddress').value,pin,locationVersion:editing.version});if(ticket!==generation)return;RutaXUI.locationSaved(result.package,editing.code);close();RutaXUI.toast('✓ Dirección y ubicación guardadas');}
    catch(error){if(ticket===generation){$('locationError').textContent=error.message;$('locationSave').disabled=false;}}
  };
  window.addEventListener('rutax:logout',close);
  document.addEventListener('DOMContentLoaded',()=>document.body.append(overlay));
  window.RutaXLocation={open,close};
})();
