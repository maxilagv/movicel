// Optional override for API base (only sets a default in local dev)
if (typeof window !== 'undefined' && typeof window.API_BASE_URL === 'undefined') {
  window.API_BASE_URL = 'http://localhost:3000';
}
