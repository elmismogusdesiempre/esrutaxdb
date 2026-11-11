// Conserva evidencias pendientes fuera de localStorage hasta confirmar recepción.
(()=>{
  let opened;
  function database(){return opened??=new Promise((resolve,reject)=>{const req=indexedDB.open('rutax-evidencias-v2',1);req.onupgradeneeded=()=>req.result.createObjectStore('pending',{keyPath:'key'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function execute(mode,fn){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('pending',mode),req=fn(tx.objectStore('pending'));let value;req.onsuccess=()=>value=req.result;tx.oncomplete=()=>{resolve(value);if(mode==='readwrite')window.dispatchEvent(new Event('rutax:outbox'));};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  window.RutaXOutbox={put:value=>execute('readwrite',store=>store.put(value)),remove:key=>execute('readwrite',store=>store.delete(key)),list:()=>execute('readonly',store=>store.getAll())};
})();
