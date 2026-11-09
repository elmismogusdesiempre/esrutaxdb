// Reemplaza esta URL con la de tu Web App de Google Apps Script (debe terminar en /exec)
const API_URL = 'https://script.google.com/macros/s/AKfycbygLkD16JLojI0_KY2Mu3XT2r5kwfLXwLssaTkfxte4R_aWhKTMiZB3cyuL4sl7HsZz2g/exec'; 
const TOKEN_KEY = 'rutax_token_v1'; // Llave para guardar la sesión en el navegador

// ============================================================
// MOTOR DE PETICIONES (Evita el error CORS de Apps Script)
// ============================================================
async function apiRequest(action, payload = {}, method = 'POST') {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    
    // Si hay token, lo inyectamos automáticamente en el payload
    if (token && !payload.token) {
      payload.token = token;
    }

    let url = `${API_URL}?action=${action}`;
    let options = {};

    if (method === 'GET') {
      // Convertimos el payload a parámetros de URL (?action=...&code=...)
      const params = new URLSearchParams(payload);
      url += '&' + params.toString();
      options = { method: 'GET' };
    } else {
      // POST: CRÍTICO usar 'text/plain' para que Google no bloquee la petición
      options = {
        method: 'POST',
        headers: { 
          'Content-Type': 'text/plain;charset=utf-8' 
        },
        body: JSON.stringify(payload)
      };
    }

    const res = await fetch(url, options);
    if (!res.ok) throw new Error('Error de red (HTTP ' + res.status + ')');
    
    const data = await res.json();
    
    // Si el servidor responde con un error controlado
    if (data && data.ok === false) {
      // Si la sesión expiró, limpiamos el token
      if (data.error === 'Sesión expirada') {
        localStorage.removeItem(TOKEN_KEY);
      }
      throw new Error(data.error || 'Error en el servidor');
    }
    
    return data;
  } catch (err) {
    console.error('API Error [' + action + ']:', err);
    throw err;
  }
}

// ============================================================
// API PÚBLICA (Ruta X)
// ============================================================
window.RutaXAPI = {
  
  // 1. LISTA PÚBLICA DE MENSAJEROS (Login)
  publicList: async function() {
    const data = await apiRequest('public_list', {}, 'GET');
    // El nuevo code.gs devuelve un array directo, validamos ambos formatos por seguridad
    if (Array.isArray(data)) return data;
    return data.messengers || [];
  },

  // 2. LOGIN
  login: async function(code, pin) {
    const data = await apiRequest('login', { code, pin }, 'POST');
    if (data.ok && data.token) {
      localStorage.setItem(TOKEN_KEY, data.token); // Guardamos el token
    }
    return data;
  },

  // 3. CERRAR SESIÓN
  logout: async function() {
    try {
      await apiRequest('logout', {}, 'POST');
    } catch (e) {
      console.warn('Logout falló en el servidor, limpiando localmente');
    }
    localStorage.removeItem(TOKEN_KEY);
  },

  // 4. VERIFICAR SI HAY SESIÓN ACTIVA
  isLoggedIn: function() {
    return !!localStorage.getItem(TOKEN_KEY);
  },

  // 5. LIMPIAR SESIÓN LOCALMENTE (Para el botón de "Cambiar de Mensajero")
  clearSession: function() {
    localStorage.removeItem(TOKEN_KEY);
  },

  // 6. TRAER DATOS (Ruta, Eventos, Settings)
  pull: async function() {
    return await apiRequest('pull', {}, 'GET');
  },

  // ============================================================
  // ACCIONES DEL MENSAJERO
  // ============================================================
  
  // 7. GUARDAR EVENTO (Fotos + Firma)
  saveEvent: async function(event, photos) {
    return await apiRequest('save_event', { event, photos }, 'POST');
  },

  // 8. GUARDAR AJUSTES (Firma, WhatsApp, etc)
  saveSettings: async function(settings) {
    return await apiRequest('save_settings', { settings }, 'POST');
  },

  // 9. AGREGAR PAQUETES MANUALES
  addPackages: async function(packages) {
    return await apiRequest('add_packages', { packages }, 'POST');
  },

  // 10. ANULAR ENTREGA
  undoDelivery: async function(eventId, reason) {
    return await apiRequest('undo_delivery', { eventId, reason }, 'POST');
  },

  // 11. ACTUALIZAR ESTADO DE PAQUETE
  updatePackage: async function(packageId, status) {
    return await apiRequest('update_package', { packageId, status }, 'POST');
  },

  // ============================================================
  // ACCIONES DEL ADMINISTRADOR
  // ============================================================

  // 12. LISTA DE MENSAJEROS
  adminListMessengers: async function() {
    return await apiRequest('admin_list_messengers', {}, 'GET');
  },

  // 13. CREAR MENSAJERO
  adminAddMessenger: async function(payload) {
    return await apiRequest('admin_add_messenger', payload, 'POST');
  },

  // 14. EDITAR MENSAJERO (Nombre, PIN, Activo)
  adminUpdateMessenger: async function(payload) {
    return await apiRequest('admin_update_messenger', payload, 'POST');
  },

  // 15. ASIGNAR RUTA (CSV)
  adminAssignRoute: async function(code, items, mode) {
    return await apiRequest('admin_assign_route', { code, items, mode }, 'POST');
  },

  // 16. MONITOR EN VIVO
  adminLive: async function(since, until) {
    return await apiRequest('admin_live', { since, until }, 'GET');
  },

  // 17. VER RUTAS DE UN MENSAJERO ESPECÍFICO
  adminGetRoutes: async function(code) {
    return await apiRequest('admin_get_routes', { code }, 'GET');
  }
};
