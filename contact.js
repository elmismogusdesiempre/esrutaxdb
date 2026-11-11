// Genera enlaces; abrirlos siempre requiere una acción del repartidor.
(function(root){
  function whatsappNumber(value){const raw=String(value||'').trim();let digits=raw.replace(/\D/g,'');if(digits.startsWith('00'))digits=digits.slice(2);if(!digits)return '';if(!raw.startsWith('+')&&!raw.startsWith('00')){if(digits.length===9)digits='34'+digits;else if(digits.length===10)digits='57'+digits;}return /^\d{8,15}$/.test(digits)?digits:'';}
  function dialNumber(value){const raw=String(value||'').trim(),international=whatsappNumber(raw);if(international)return '+'+international;const local=raw.replace(/\D/g,'');return /^\d{3,15}$/.test(local)?local:'';}
  function message(pkg,messenger){return 'Hola '+(pkg.client||'')+', soy '+(messenger.name||'tu repartidor')+' de RutaX España. Tu paquete con número de guía '+(pkg.guide||'sin guía')+' va en camino.';}
  function links(pkg,messenger){const tel=dialNumber(pkg.phone),wa=whatsappNumber(pkg.phone);return {tel:tel?'tel:'+tel:'',whatsapp:wa?'https://wa.me/'+wa+'?text='+encodeURIComponent(message(pkg,messenger)):''};}
  root.RutaXContact={whatsappNumber,dialNumber,message,links};
})(globalThis);
