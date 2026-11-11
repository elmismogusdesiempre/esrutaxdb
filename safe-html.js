// El HTML heredado usa innerHTML para pintar datos de CSV y clientes.
// Centraliza su saneamiento mientras se conservan sus componentes originales.
(()=>{
  const original=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  let sanitizing=false;
  Object.defineProperty(Element.prototype,'innerHTML',{
    configurable:true,enumerable:original.enumerable,get:original.get,
    set(value){
      if(sanitizing) return original.set.call(this,value);
      if(!window.DOMPurify) throw new Error('No se pudo iniciar el filtro HTML');
      sanitizing=true;
      let clean;
      try {clean=DOMPurify.sanitize(String(value),{ADD_ATTR:['target'],FORBID_TAGS:['style','script','iframe','object','embed'],FORBID_ATTR:['srcdoc']});}
      finally{sanitizing=false;}
      original.set.call(this,clean);
    }
  });
})();
