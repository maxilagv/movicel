(() => {
  const __host = window.location.hostname;
  const __isLocal = ['localhost', '127.0.0.1', '::1'].includes(__host) || window.location.origin.startsWith('file:');
  const BASE_CANDIDATES = [ __isLocal ? 'http://localhost:3000' : window.location.origin ];
  let currentBaseIdx = 0;
  function getBase() { return BASE_CANDIDATES[currentBaseIdx] + '/api'; }

  // Auth helpers
  const getAccess = () => sessionStorage.getItem('accessToken');
  const getRefresh = () => sessionStorage.getItem('refreshToken');
  const setAccess = (t) => sessionStorage.setItem('accessToken', t);

  // In-memory caches for edit prefill
  let categoriesCache = [];
  let productsCache = [];

  async function refreshAccessToken() {
    const rt = getRefresh();
    if (!rt) return false;
    try {
      const res = await fetch(`${getBase()}/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.accessToken) {
        setAccess(data.accessToken);
        return true;
      }
    } catch (_) {}
    return false;
  }

  async function apiFetch(path, opts = {}, retry = true) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = getAccess();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(`${getBase()}${path}`, { ...opts, headers });
    } catch (_) {
      if (currentBaseIdx + 1 < BASE_CANDIDATES.length) {
        currentBaseIdx += 1;
        res = await fetch(`${getBase()}${path}`, { ...opts, headers });
      } else {
        throw new Error('No se pudo conectar con el servidor.');
      }
    }
    if ((res.status === 401 || res.status === 403) && retry) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return apiFetch(path, opts, false);
    }
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok) {
      let msg = (data && (data.error || data.message)) || `Error ${res.status}`;
      if (!data?.error && Array.isArray(data?.errors) && data.errors.length) {
        const first = data.errors[0];
        if (first?.msg) msg = first.msg;
      }
      throw new Error(msg);
    }
    return data;
  }

  function requireAuthOrRedirect() {
    if (!getAccess()) window.location.href = 'login.html';
  }

  // UI helpers
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const val = (id) => (document.getElementById(id)?.value || '').trim();
  const escapeHtml = (str) => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  function showAlert(msg) { alert(msg); }
  function openModal(id) { const m = document.getElementById(id); if (m) m.style.display = 'flex'; }
  function closeModal(id) { const m = document.getElementById(id); if (m) m.style.display = 'none'; }

  function setupModals() {
    const categoryModal = document.getElementById('category-modal');
    const productModal = document.getElementById('product-modal');

    document.getElementById('add-category')?.addEventListener('click', () => openModal('category-modal'));
    document.getElementById('add-product')?.addEventListener('click', () => openModal('product-modal'));

    qsa('.close-modal').forEach(btn => btn.addEventListener('click', () => {
      closeModal('category-modal');
      closeModal('product-modal');
    }));
    window.addEventListener('click', (e) => {
      if (e.target === categoryModal) closeModal('category-modal');
      if (e.target === productModal) closeModal('product-modal');
    });

    const updateImagePreview = (e) => {
      const url = (e.target.value || '').trim();
      const preview = e.target.parentElement.querySelector('.image-preview');
      if (!preview) return;
      if (url && /https?:\/\//i.test(url)) preview.innerHTML = `<img src="${escapeHtml(url)}" alt="Preview">`;
      else preview.innerHTML = '<span>Vista previa de la imagen</span>';
    };
    document.getElementById('category-image')?.addEventListener('input', updateImagePreview);
    document.getElementById('product-image')?.addEventListener('input', updateImagePreview);
  }

  function wireTabs() {
    qsa('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        qsa('.tab').forEach(t => t.classList.remove('active'));
        qsa('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const target = `${tab.dataset.tab}-section`;
        document.getElementById(target)?.classList.add('active');
        // Mantener coherencia con el sidebar
        const navMap = { categories: 'categorias', products: 'productos' };
        const nav = navMap[tab.dataset.tab];
        if (nav) {
          qsa('.sidebar .menu-item').forEach(i => i.classList.remove('active'));
          qs(`.sidebar .menu-item[data-nav="${nav}"]`)?.classList.add('active');
        }
      });
    });
  }

  function setupSidebarNav() {
    const menu = qs('.sidebar .menu');
    if (!menu) return;
    menu.addEventListener('click', async (e) => {
      const a = e.target.closest('a.menu-item');
      if (!a) return;
      e.preventDefault();
      const nav = a.dataset.nav;
      qsa('.sidebar .menu-item').forEach(i => i.classList.remove('active'));
      a.classList.add('active');
      if (nav === 'dashboard') {
        // Ocultar contenidos de pestañas y subir al inicio
        qsa('.tab').forEach(t => t.classList.remove('active'));
        qsa('.tab-content').forEach(c => c.classList.remove('active'));
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (nav === 'categorias') {
        qsa('.tab').forEach(t => t.classList.remove('active'));
        qsa('.tab-content').forEach(c => c.classList.remove('active'));
        qs('.tab[data-tab="categories"]').classList.add('active');
        document.getElementById('categories-section')?.classList.add('active');
        try { await loadCategories(); } catch (_) {}
        document.getElementById('categories-section')?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      if (nav === 'productos') {
        qsa('.tab').forEach(t => t.classList.remove('active'));
        qsa('.tab-content').forEach(c => c.classList.remove('active'));
        qs('.tab[data-tab="products"]').classList.add('active');
        document.getElementById('products-section')?.classList.add('active');
        try { await loadProducts(); } catch (_) {}
        document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      if (nav === 'logout') {
        if (window.confirm('¿Estás seguro que deseas cerrar sesión?')) {
          try { await apiFetch('/logout', { method: 'POST' }); } catch (_) {}
          try {
            sessionStorage.removeItem('accessToken');
            sessionStorage.removeItem('refreshToken');
          } catch (_) {}
          window.location.href = 'login.html';
        }
        return;
      }
    });
  }

  // Data load & render
  async function loadCategories() {
    const cats = await apiFetch('/categorias', { method: 'GET' });
    categoriesCache = Array.isArray(cats) ? cats : [];
    renderCategoriesTable(categoriesCache);
    populateCategorySelect(categoriesCache);
    return categoriesCache;
  }

  function renderCategoriesTable(cats) {
    const tbody = document.getElementById('categories-table') || qs('#categories-section tbody');
    if (!tbody) return;
    if (!Array.isArray(cats)) { tbody.innerHTML = ''; return; }
    tbody.innerHTML = cats.map(c => {
      const safeImg = (c.image_url && String(c.image_url).trim() !== '') ? c.image_url : 'https://placehold.co/40x40';
      return `
      <tr data-id="${c.id}">
        <td>${c.id}</td>
        <td>${escapeHtml(c.name || '')}</td>
        <td><img src="${safeImg}" alt="${escapeHtml(c.name || '')}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;"></td>
        <td>-</td>
        <td>
          <div class="action-buttons">
            <div class="btn-icon btn-edit" title="Editar"><i class="fas fa-edit"></i></div>
            <div class="btn-icon delete-category" data-id="${c.id}" title="Eliminar"><i class="fas fa-trash"></i></div>
          </div>
        </td>
      </tr>
    `;
    }).join('');
  }

  function populateCategorySelect(cats) {
    const sel = document.getElementById('product-category');
    if (!sel) return;
    sel.innerHTML = '<option value="">Seleccionar categoria</option>' +
      (Array.isArray(cats) ? cats.map(c => `
        <option value="${escapeHtml(String(c.id))}">${escapeHtml(c.name || '')}</option>
      `).join('') : '');
  }

  async function loadProducts() {
    const products = await apiFetch('/productos', { method: 'GET' });
    productsCache = Array.isArray(products) ? products : [];
    renderProductsTable(productsCache);
    return productsCache;
  }

  function renderProductsTable(products) {
    const tbody = qs('#products-section tbody');
    if (!tbody) return;
    if (!Array.isArray(products)) { tbody.innerHTML = ''; return; }
    tbody.innerHTML = products.map(p => {
      const safeImg = (p.image_url && String(p.image_url).trim() !== '') ? p.image_url : 'https://placehold.co/40x40';
      return `
      <tr data-id="${p.id}">
        <td>${p.id}</td>
        <td><img src="${safeImg}" alt="Producto" style="width:40px;height:40px;object-fit:cover;border-radius:6px;"></td>
        <td>${escapeHtml(p.name || '')}</td>
        <td>${escapeHtml(p.category_name || '')}</td>
        <td>$${Number(p.price || 0).toFixed(2)}</td>
        <td>${Number(p.stock_quantity ?? 0)}</td>
        <td>
          <div class="action-buttons">
            <div class="btn-icon btn-edit" title="Editar"><i class="fas fa-edit"></i></div>
            <div class="btn-icon delete-product" data-id="${p.id}" title="Eliminar"><i class="fas fa-trash"></i></div>
          </div>
        </td>
      </tr>
    `;
    }).join('');
  }

  // Handlers
  async function onDeleteCategory(e) {
    const tr = e.currentTarget.closest('tr');
    const id = tr?.dataset?.id;
    if (!id) return;
    if (!confirm('Eliminar la categoria seleccionada?')) return;
    try {
      await apiFetch(`/categorias/${id}`, { method: 'DELETE' });
      await loadCategories();
    } catch (err) {
      showAlert(err.message || 'No se pudo eliminar la categoria.');
    }
  }

  async function onDeleteProduct(e) {
    const tr = e.currentTarget.closest('tr');
    const id = tr?.dataset?.id;
    if (!id) return;
    if (!confirm('Eliminar el producto seleccionado?')) return;
    try {
      await apiFetch(`/productos/${id}`, { method: 'DELETE' });
      await loadProducts();
    } catch (err) {
      showAlert(err.message || 'No se pudo eliminar el producto.');
    }
  }

  // Forms (standardized payloads)
  function setupForms() {
    // Helpers to reset forms/modals state
    const resetCategoryForm = () => {
      const form = document.getElementById('category-form');
      if (!form) return;
      form.reset();
      delete form.dataset.editId;
      const header = form.closest('.modal-content')?.querySelector('.modal-header h2');
      if (header) header.textContent = 'Nueva Categoría';
      const submit = form.querySelector('button[type="submit"]');
      if (submit) submit.textContent = 'Guardar Categoría';
    };
    const resetProductForm = () => {
      const form = document.getElementById('product-form');
      if (!form) return;
      form.reset();
      delete form.dataset.editId;
      const header = form.closest('.modal-content')?.querySelector('.modal-header h2');
      if (header) header.textContent = 'Nuevo Producto';
      const submit = form.querySelector('button[type="submit"]');
      if (submit) submit.textContent = 'Guardar Producto';
    };

    // Categoria
    document.getElementById('category-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = val('category-name');
      const imagen = val('category-image');
      const description = val('category-description');
      if (!nombre || !imagen) { showAlert('Completa nombre e imagen.'); return; }
      try {
        const form = e.currentTarget;
        const editId = form.dataset.editId;
        const payload = { name: nombre, description, image_url: imagen };
        if (editId) {
          await apiFetch(`/categorias/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          await apiFetch('/categorias', { method: 'POST', body: JSON.stringify(payload) });
        }
        closeModal('category-modal');
        resetCategoryForm();
        await loadCategories();
      } catch (err) {
        showAlert(err.message || 'No se pudo crear la categoria.');
      }
    });

    // Producto
    document.getElementById('product-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = val('product-name');
      const categoryIdStr = val('product-category');
      const precioStr = val('product-price');
      const stockStr = val('product-stock');
      const imagen = val('product-image');
      const descripcion = val('product-description');
      const specsStr = val('product-specs');

      if (!nombre || !categoryIdStr || !precioStr || !imagen) {
        showAlert('Completa nombre, categoria, precio e imagen.');
        return;
      }
      const precio = Number(precioStr);
      const stock = Number.isFinite(Number(stockStr)) ? Number(stockStr) : 0;
      if (!Number.isFinite(precio) || precio <= 0) { showAlert('Precio invalido.'); return; }

      const body = {
        name: nombre,
        description: descripcion,
        price: precio,
        image_url: imagen,
        category_id: Number(categoryIdStr),
        stock_quantity: stock,
        specifications: (specsStr || '').trim() || null,
      };

      try {
        const form = e.currentTarget;
        const editId = form.dataset.editId;
        console.log('Payload que se envía:', body);
        if (editId) {
          await apiFetch(`/productos/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          await apiFetch('/productos', { method: 'POST', body: JSON.stringify(body) });
        }
        closeModal('product-modal');
        resetProductForm();
        await loadProducts();
      } catch (err) {
        showAlert(err.message || 'No se pudo crear el producto.');
      }
    });

    // Reset forms when closing modals
    document.querySelectorAll('#category-modal .close-modal')
      .forEach(btn => btn.addEventListener('click', resetCategoryForm));
    document.querySelectorAll('#product-modal .close-modal')
      .forEach(btn => btn.addEventListener('click', resetProductForm));
  }

  async function init() {
    requireAuthOrRedirect();
    wireTabs();
    setupSidebarNav();
    setupModals();
    setupForms();
    // Delegated delete handlers for products and categories
    document.addEventListener('click', async (e) => {
      const delCatBtn = e.target.closest('.delete-category');
      if (delCatBtn) {
        const id = delCatBtn.dataset.id || delCatBtn.closest('tr')?.dataset?.id;
        if (!id) return;
        if (!window.confirm('Eliminar la categoria seleccionada?')) return;
        try {
          await apiFetch(`/categorias/${id}`, { method: 'DELETE' });
          await loadCategories();
        } catch (err) {
          showAlert(err.message || 'No se pudo eliminar la categoria.');
        }
        return;
      }

      const delProdBtn = e.target.closest('.delete-product');
      if (delProdBtn) {
        const id = delProdBtn.dataset.id || delProdBtn.closest('tr')?.dataset?.id;
        if (!id) return;
        if (!window.confirm('Eliminar el producto seleccionado?')) return;
        try {
          await apiFetch(`/productos/${id}`, { method: 'DELETE' });
          await loadProducts();
        } catch (err) {
          showAlert(err.message || 'No se pudo eliminar el producto.');
        }
        return;
      }

      // Edit handlers (categories and products)
      const editBtn = e.target.closest('.btn-edit');
      if (editBtn) {
        const tr = editBtn.closest('tr');
        const id = tr?.dataset?.id;
        if (!id) return;
        // Category edit
        if (editBtn.closest('#categories-section')) {
          const cat = categoriesCache.find(c => String(c.id) === String(id));
          const form = document.getElementById('category-form');
          if (form && cat) {
            // Mark edit mode
            form.dataset.editId = String(id);
            const header = form.closest('.modal-content')?.querySelector('.modal-header h2');
            if (header) header.textContent = 'Editar Categoría';
            const submit = form.querySelector('button[type="submit"]');
            if (submit) submit.textContent = 'Actualizar Categoría';
            // Prefill
            const nameEl = document.getElementById('category-name');
            const imgEl = document.getElementById('category-image');
            const descEl = document.getElementById('category-description');
            if (nameEl) nameEl.value = cat.name || '';
            if (imgEl) imgEl.value = cat.image_url || '';
            if (descEl) descEl.value = cat.description || '';
            openModal('category-modal');
          }
          return;
        }
        // Product edit
        if (editBtn.closest('#products-section')) {
          const prod = productsCache.find(p => String(p.id) === String(id));
          const form = document.getElementById('product-form');
          if (form && prod) {
            // Mark edit mode
            form.dataset.editId = String(id);
            const header = form.closest('.modal-content')?.querySelector('.modal-header h2');
            if (header) header.textContent = 'Editar Producto';
            const submit = form.querySelector('button[type="submit"]');
            if (submit) submit.textContent = 'Actualizar Producto';
            // Prefill
            const nameEl = document.getElementById('product-name');
            const catSel = document.getElementById('product-category');
            const priceEl = document.getElementById('product-price');
            const stockEl = document.getElementById('product-stock');
            const imgEl = document.getElementById('product-image');
            const descEl = document.getElementById('product-description');
            const specsEl = document.getElementById('product-specs');
            if (nameEl) nameEl.value = prod.name || '';
            if (catSel) catSel.value = String(prod.category_id || '');
            if (priceEl) priceEl.value = (Number(prod.price || 0)).toString();
            if (stockEl) stockEl.value = String(Number.isFinite(Number(prod.stock_quantity)) ? Number(prod.stock_quantity) : 0);
            if (imgEl) imgEl.value = prod.image_url || '';
            if (descEl) descEl.value = prod.description || '';
            if (specsEl) specsEl.value = prod.specifications || '';
            openModal('product-modal');
          }
          return;
        }
      }
    });
    await Promise.all([loadCategories(), loadProducts()]);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
