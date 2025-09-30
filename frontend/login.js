(() => {
  const isDevStatic = /(:5500|:5501)$/.test(location.host);
  const origin = location.origin && location.origin.startsWith('http') ? location.origin : null;
  const API_ORIGIN = window.API_BASE_URL
    ? String(window.API_BASE_URL)
    : (origin && !isDevStatic ? origin : 'http://localhost:3000');
  const API_BASE = API_ORIGIN.replace(/\/$/, '') + '/api';

  const form = document.getElementById('login-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const btn = document.querySelector('.btn-login');

  // Simple state for 2FA
  let txId = null;

  function createParticles() {
    const particlesContainer = document.getElementById('particles');
    if (!particlesContainer) return;
    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.classList.add('particle');
      const size = Math.random() * 20 + 5;
      const posX = Math.random() * 100;
      const delay = Math.random() * 15;
      const duration = Math.random() * 10 + 15;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.left = `${posX}%`;
      particle.style.top = '100vh';
      particle.style.animationDelay = `${delay}s`;
      particle.style.animationDuration = `${duration}s`;
      particle.style.opacity = '0';
      particlesContainer.appendChild(particle);
    }
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error || 'Error de red';
      throw new Error(msg);
    }
    return data;
  }

  function showError(msg) {
    alert(msg);
  }

  function disableForm(disabled) {
    usernameInput.disabled = disabled;
    passwordInput.disabled = disabled;
    btn.disabled = disabled;
  }

  function renderOtpStep() {
    // Avoid duplicating OTP UI if already rendered
    if (document.getElementById('otp')) return;
    // Hide password input and show OTP input + verify button
    const passwordGroup = passwordInput.closest('.input-group');
    if (passwordGroup) passwordGroup.style.display = 'none';

    const otpGroup = document.createElement('div');
    otpGroup.className = 'input-group';
    otpGroup.innerHTML = `
      <label for="otp">Código de verificación (enviado a tu email)</label>
      <input type="text" id="otp" placeholder="Ingresa el código" inputmode="numeric" autocomplete="one-time-code" required>
      <i class="fas fa-shield-alt"></i>
    `;
    // Insert OTP field right before the original submit button (child of form)
    form.insertBefore(otpGroup, btn);

    const verifyBtn = document.createElement('button');
    verifyBtn.type = 'button';
    verifyBtn.className = 'btn-login';
    verifyBtn.textContent = 'Verificar código';
    btn.insertAdjacentElement('afterend', verifyBtn);
    btn.style.display = 'none';

    verifyBtn.addEventListener('click', async () => {
      const otpInput = document.getElementById('otp');
      const code = (otpInput?.value || '').trim();
      if (!code) {
        showError('Ingresa el código de verificación.');
        return;
      }
      verifyBtn.disabled = true;
      verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
      try {
        const data = await postJSON(`${API_BASE}/login-step2`, { txId, code });
        // Store tokens in localStorage
        if (data?.accessToken) localStorage.setItem('accessToken', data.accessToken);
        if (data?.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
        window.location.href = 'admin.html';
      } catch (err) {
        showError(err.message || 'Error al verificar el código.');
      } finally {
        verifyBtn.innerHTML = 'Verificar código';
        verifyBtn.disabled = false;
      }
    });
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (usernameInput.value || '').trim();
    const password = passwordInput.value || '';
    if (!email || !password) return;

    disableForm(true);
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando credenciales...';
    try {
      const data = await postJSON(`${API_BASE}/login-step1`, { email, password });
      if (data?.otpSent && data?.txId) {
        txId = data.txId;
        alert('Contraseña correcta. Te enviamos un código al correo para confirmar.');
        renderOtpStep();
      } else {
        throw new Error('Respuesta inesperada del servidor.');
      }
    } catch (err) {
      showError(err.message || 'Error al iniciar sesión.');
      disableForm(false);
      btn.innerHTML = 'Iniciar Sesión';
    }
  });

  window.addEventListener('load', createParticles);
})();
