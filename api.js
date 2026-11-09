/**
 * Ruta X · Cliente de API
 * v15 · Con anulación de entrega
 */
(function () {
  'use strict';

var API_URL = 'https://script.google.com/macros/s/AKfycbwdKi0AopAS6V2ySrBhaYV4HuHNgRuhsYbHMOsJqK2D81WKvz2deD1faT61zYNDPwgNwQ/exec';

  var TOKEN_KEY = 'rutax_token';
  var ROLE_KEY = 'rutax_role';

  var token = localStorage.getItem(TOKEN_KEY) || null;
  var role = localStorage.getItem(ROLE_KEY) || null;

  function setSession(t, r) {
    token = t;
    role = r;
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
    if (r) localStorage.setItem(ROLE_KEY, r);
    else localStorage.removeItem(ROLE_KEY);
  }

  function clearSession() { setSession(null, null); }

  async function call(action, payload) {
    var body = Object.assign({ action: action, token: token }, payload || {});
    var resp = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'Error del servidor');
    return data;
  }

  async function publicList() {
    var r = await fetch(API_URL + '?action=publicList');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Error');
    return data.messengers || [];
  }

  async function login(codigo, pin) {
    var data = await call('login', { codigo: codigo, pin: pin });
    if (data.ok && data.token) setSession(data.token, data.role);
    return data;
  }

  async function pull() { return call('pull', {}); }

  async function saveEvent(evt, photosBase64) {
    var lightEvent = Object.assign({}, evt);
    lightEvent.signed = !!evt.signature;
    delete lightEvent.signature;
    delete lightEvent.photos;
    delete lightEvent.photo;
    return call('saveEvent', { event: lightEvent, photosBase64: photosBase64 || [] });
  }

  async function addPackages(packages) { return call('addPackages', { packages: packages }); }
  async function saveSettings(settings) { return call('saveSettings', { settings: settings }); }
  async function resetRoute() { return call('resetRoute', {}); }

  async function undoDelivery(eventId, reason) {
    return call('undoDelivery', { eventId: eventId, reason: reason });
  }

  async function updatePackage(rutaId, estado) {
    return call('updatePackage', { rutaId: rutaId, estado: estado });
  }

  async function adminListMessengers() { return call('adminListMessengers', {}); }
  async function adminUpdateMessenger(mm) { return call('adminUpdateMessenger', { messenger: mm }); }
  async function adminAddMessenger(mm) { return call('adminAddMessenger', { messenger: mm }); }

  async function adminLive(since, until) {
    var payload = {};
    if (since !== undefined && since !== null) payload.since = since;
    if (until !== undefined && until !== null) payload.until = until;
    return call('adminLive', payload);
  }

  async function adminGetRoutes(messengerCode) {
    return call('adminGetRoutes', { messengerCode: messengerCode });
  }

  async function adminAssignRoute(messengerCode, items, mode) {
    return call('adminAssignRoute', {
      messengerCode: messengerCode,
      items: items,
      mode: mode || 'append'
    });
  }

  window.RutaXAPI = {
    API_URL: API_URL,
    setSession: setSession,
    clearSession: clearSession,
    getToken: function () { return token; },
    getRole: function () { return role; },
    isLoggedIn: function () { return !!token; },
    publicList: publicList,
    login: login,
    pull: pull,
    saveEvent: saveEvent,
    addPackages: addPackages,
    saveSettings: saveSettings,
    resetRoute: resetRoute,
    undoDelivery: undoDelivery,
    updatePackage: updatePackage,
    adminListMessengers: adminListMessengers,
    adminUpdateMessenger: adminUpdateMessenger,
    adminAddMessenger: adminAddMessenger,
    adminLive: adminLive,
    adminGetRoutes: adminGetRoutes,
    adminAssignRoute: adminAssignRoute
  };
})();
