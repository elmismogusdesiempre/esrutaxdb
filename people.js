// Una sola representación del perfil para selección, PIN, repartidor y administración.
(()=>{
  const profiles=new Map(),failedImages=new Set();
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function person(value,name){const input=typeof value==='string'?{code:value,name}:value||{};return {...profiles.get(input.code),...Object.fromEntries(Object.entries(input).filter(([,v])=>v!==undefined))};}
  function initials(p){const words=String(p.name||p.code||'?').trim().split(/\s+/).filter(Boolean);return (words.length>1?words[0][0]+words[words.length-1][0]:(words[0]||'?').slice(0,2)).toUpperCase();}
  function validPhoto(src){return typeof src==='string'&&!failedImages.has(src)&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src);}
  function contents(p){return validPhoto(p.avatar)?`<img src="${p.avatar}" alt="" loading="lazy" decoding="async">`:`<span aria-hidden="true">${escape(initials(p))}</span>`;}
  function paint(node,value){if(!node)return;const p=person(value);node.classList.add('rx-person-avatar');node.dataset.profileCode=p.code||'';node.dataset.profileName=p.name||p.code||'';node.setAttribute('role','img');node.setAttribute('aria-label',validPhoto(p.avatar)?'Foto de '+(p.name||p.code):'Iniciales de '+(p.name||p.code||'usuario'));node.innerHTML=contents(p);}
  function avatar(value,classes=''){const p=person(value);return `<span class="rx-person-avatar ${escape(classes)}" data-profile-code="${escape(p.code)}" data-profile-name="${escape(p.name||p.code)}" role="img" aria-label="${escape((validPhoto(p.avatar)?'Foto de ':'Iniciales de ')+(p.name||p.code||'usuario'))}">${contents(p)}</span>`;}
  function identity(value,name){const p=person(value,name);return `<span class="rx-identity">${avatar(p)}<span class="rx-person-name">${escape(p.name||p.code||'Usuario')}</span></span>`;}
  function remember(values){const list=Array.isArray(values)?values:[values];const changed=new Set();for(const p of list){if(!p||!p.code)continue;profiles.set(p.code,{...profiles.get(p.code),...p});changed.add(p.code);}if(changed.size)document.querySelectorAll('[data-profile-code]').forEach(node=>{if(changed.has(node.dataset.profileCode))paint(node,node.dataset.profileCode);});}
  document.addEventListener('error',event=>{const img=event.target;if(img.tagName!=='IMG')return;const host=img.closest('.rx-person-avatar');if(host){failedImages.add(img.getAttribute('src'));paint(host,person(host.dataset.profileCode,host.dataset.profileName));}},true);
  window.RutaXPeople={remember,avatar,identity,paint,get:person};
})();
