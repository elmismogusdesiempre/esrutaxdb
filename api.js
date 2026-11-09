const API_URL = 'https://script.google.com/macros/s/AKfycbygLkD16JLojI0_KY2Mu3XT2r5kwfLXwLssaTkfxte4R_aWhKTMiZB3cyuL4sl7HsZz2g/exec'; 
const TOKEN_KEY = 'rutax_token_v1';

async function apiRequest(action, payload = {}, method = 'POST') {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && !payload.token) payload.token = token;

    let url = `${API_URL}?action=${action}`;
    let options = {};

    if (method === 'GET') {
      const params = new URLSearchParams(payload);
      url += '&' + params.toString();
      options = { method: 'GET' };
    } else {
      options = {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      };
    }

    const res = await fetch(url, options);
    if (!res.ok) throw new Error('Error de red (HTTP ' + res.status + ')');
    const data = await res.json();
    
    if (data && data.ok === false) {
      if (data.error === 'Sesión expirada') localStorage.removeItem(TOKEN_KEY);
      throw new Error(data.error || 'Error en el servidor');
    }
    return data;
  } catch (err) {
    console.error('API Error [' + action + ']:', err);
    throw err;
  }
}

window.RutaXAPI = {
  publicList: async function() {
    const data = await apiRequest('public_list', {}, 'GET');
    return Array.isArray(data) ? data : (data.messengers || []);
  },
  login: async function(code, pin) {
    const data = await apiRequest('login', { code, pin }, 'POST');
    if (data.ok && data.token) localStorage.setItem(TOKEN_KEY, data.token);
    return data;
  },
  logout: async function() {
    try { await apiRequest('logout', {}, 'POST'); } catch (e) {}
    localStorage.removeItem(TOKEN_KEY);
  },
  isLoggedIn: function() { return !!localStorage.getItem(TOKEN_KEY); },
  clearSession: function() { localStorage.removeItem(TOKEN_KEY); },
  pull: async function() { return await apiRequest('pull', {}, 'GET'); },
  
  saveEvent: async function(event, photos) { return await apiRequest('save_event', { event, photos }, 'POST'); },
  saveSettings: async function(settings) { return await apiRequest('save_settings', { settings }, 'POST'); },
  addPackages: async function(packages) { return await apiRequest('add_packages', { packages }, 'POST'); },
  undoDelivery: async function(eventId, reason) { return await apiRequest('undo_delivery', { eventId, reason }, 'POST'); },
  updatePackage: async function(packageId, status) { return await apiRequest('update_package', { packageId, status }, 'POST'); },
  deletePackage: async function(packageId) { return await apiRequest('delete_package', { packageId }, 'POST'); },

  adminListMessengers: async function() { return await apiRequest('admin_list_messengers', {}, 'GET'); },
  adminAddMessenger: async function(payload) { return await apiRequest('admin_add_messenger', payload, 'POST'); },
  adminUpdateMessenger: async function(payload) { return await apiRequest('admin_update_messenger', payload, 'POST'); },
  adminDeleteMessenger: async function(code) { return await apiRequest('admin_delete_messenger', { code }, 'POST'); },
  adminAssignRoute: async function(code, items, mode) { return await apiRequest('admin_assign_route', { code, items, mode }, 'POST'); },
  adminLive: async function(since, until) { return await apiRequest('admin_live', { since, until }, 'GET'); },
  adminGetRoutes: async function(code) { return await apiRequest('admin_get_routes', { code }, 'GET'); }
};
