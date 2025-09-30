// Centralized API base URL configuration
(function () {
  const isDevStatic = /(:5500|:5501)$/.test(location.host);
  // ⬇️ Reemplazá con tu URL real del backend en Render
  const PROD_API = "https://movicel.onrender.com";
  if (!window.API_BASE_URL) {
    window.API_BASE_URL = isDevStatic ? "http://localhost:3000" : PROD_API;
  }
})();
