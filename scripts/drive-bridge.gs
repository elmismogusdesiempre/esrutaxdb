/** Proyecto Apps Script NUEVO, solo para evidencias. No usa Google Sheets.
 * Propiedades del script: DRIVE_BRIDGE_SECRET (64 caracteres aleatorios), DRIVE_ROOT_FOLDER_ID.
 * Desplegar aplicación web: ejecutar como propietario, acceso cualquiera.
 * La llamada se autentica mediante secreto únicamente desde Vercel.
 */
function doPost(e) {
  try {
    var b=JSON.parse(e.postData.contents),props=PropertiesService.getScriptProperties();
    var secret=props.getProperty('DRIVE_BRIDGE_SECRET');
    if(!secret||String(b.secret)!==secret) throw new Error('No autorizado');
    if(b.action!=='upload') throw new Error('Acción inválida');
    if(!/^[A-Z0-9_-]{1,40}$/.test(b.code)||!/^[-A-Za-z0-9_]{1,120}$/.test(b.id)) throw new Error('Identificador inválido');
    var photos=b.photos||[];if(!Array.isArray(photos)||photos.length>8) throw new Error('Fotos inválidas');
    var root=DriveApp.getFolderById(props.getProperty('DRIVE_ROOT_FOLDER_ID'));
    var it=root.getFoldersByName(b.code),folder=it.hasNext()?it.next():root.createFolder(b.code);
    var lock=LockService.getScriptLock();if(!lock.tryLock(10000)) throw new Error('Servidor ocupado');
    try {
      var urls=[],ids=[];
      for(var i=0;i<photos.length;i++) {var f=rxUpload_(photos[i],folder,'rx-v2_'+b.id+'_'+i+'.jpg');urls.push(f.url);ids.push(f.id);}
      var sig=b.signature?rxUpload_(b.signature,folder,'rx-v2_'+b.id+'_firma.png').url:'';
      return rxJson_({ok:true,photoUrls:urls,photoIds:ids,signature:sig});
    }finally{lock.releaseLock();}
  }catch(err){return rxJson_({ok:false,error:String(err.message||err)});}
}
function rxUpload_(data,folder,name) {
  if(typeof data!=='string'||data.length>900000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) throw new Error('Imagen inválida');
  var files=folder.getFilesByName(name),file;
  if(files.hasNext()) file=files.next(); // Reintentar no duplica fotos.
  else {var comma=data.indexOf(','),mime=data.slice(5,data.indexOf(';'));file=folder.createFile(Utilities.newBlob(Utilities.base64Decode(data.slice(comma+1)),mime,name));}
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
  return {id:file.getId(),url:'https://drive.google.com/thumbnail?id='+file.getId()+'&sz=w1600'};
}
function rxJson_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
/** Ejecutar manualmente una vez para programar la retención de las evidencias NUEVAS.
 * Envía a papelera fotos y firmas rx-v2_ de más de 30 días; no toca históricos anteriores.
 * Drive conserva la papelera hasta 30 días más. Vaciar papelera libera espacio definitivamente.
 */
function activarRetencion30Dias() {
  ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==='limpiarEvidenciasAntiguas')ScriptApp.deleteTrigger(t);});
  ScriptApp.newTrigger('limpiarEvidenciasAntiguas').timeBased().everyDays(1).atHour(3).create();
}
function limpiarEvidenciasAntiguas() {
  var props=PropertiesService.getScriptProperties(),root=DriveApp.getFolderById(props.getProperty('DRIVE_ROOT_FOLDER_ID'));
  var cutoff=new Date(Date.now()-30*86400000),folders=root.getFolders(),count=0,start=Date.now();
  while(folders.hasNext()&&Date.now()-start<250000) {
    var folder=folders.next();
    var query="'"+folder.getId()+"' in parents and trashed = false and title contains 'rx-v2_' and createdDate < '"+cutoff.toISOString()+"'";
    var files=DriveApp.searchFiles(query);
    while(files.hasNext()&&Date.now()-start<250000){files.next().setTrashed(true);count++;}
  }
  console.log('Evidencias enviadas a papelera: '+count);
}
