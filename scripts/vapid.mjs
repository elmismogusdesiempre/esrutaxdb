import webpush from 'web-push';
const keys=webpush.generateVAPIDKeys();
console.log('Configura estas claves en Variables de entorno de Vercel. No las subas al repositorio.');
console.log('VAPID_PUBLIC_KEY='+keys.publicKey+'\nVAPID_PRIVATE_KEY='+keys.privateKey);
