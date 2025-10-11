// Frontend -> Backend integration for Tecnocel
// Loads categories and products from the API and renders them.

(() => {
  // CONFIGURACIÓN CRÍTICA:
  // Si tu backend no está en http://localhost:3000, ¡CAMBIA ESTA LÍNEA!
  const isDevStatic = /(:5500|:5501)$/.test(location.host);
  const API_ORIGIN = window.API_BASE_URL
    ? String(window.API_BASE_URL)
    : (isDevStatic ? 'http://localhost:3000' : window.location.origin);
  const API_BASE = API_ORIGIN.replace(/\/$/, '') + '/api';
  try { document.title = (document.title || '').replace(/Tecnocel/gi, 'Movicel'); } catch {}

  // Simple state
  const state = {
    categories: [],
    products: [],
    cart: [],
    // Nuevo estado para el producto actualmente visible en el modal
    currentProduct: null, 
  };

  // Helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const slug = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'general';
  const formatCurrency = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(n || 0));

  // Normaliza cantidad de stock a partir de distintas claves posibles del producto.
  function getStockQty(product) {
    if (!product || typeof product !== 'object') return 0;
    const candidates = [product.stock, product.stock_quantity];
    for (const v of candidates) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  }

  // --- Mobile menu: inject button + menu and handle toggle ---
  try {
    const header = document.querySelector('header');
    const nav = header ? header.querySelector('nav') : null;
    if (nav) {
      // Ensure Contacto link goes to contact.html (desktop links)
      $$('a', nav).forEach(a => {
        const txt = (a.textContent || '').trim().toLowerCase();
        if (txt.includes('contacto')) a.setAttribute('href', 'contact.html');
      });

        // Add hamburger styles once
        if (!document.getElementById('hamburger-style')) {
          const style = document.createElement('style');
          style.id = 'hamburger-style';
          style.textContent = `
            /* Animated hamburger icon */
            .hamburger-line{position:absolute;left:0;right:0;height:2px;background:#fff;border-radius:9999px;transition:transform .25s ease,opacity .2s ease,background-color .2s ease,width .25s ease;transform-origin:left center}
            #menu-toggle .hamburger-line:nth-child(1){top:0}
            #menu-toggle .hamburger-line:nth-child(2){top:50%;transform:translateY(-50%)}
            #menu-toggle .hamburger-line:nth-child(3){bottom:0}
            #menu-toggle.open .hamburger-line:nth-child(1){transform:translateY(8px) rotate(45deg);width:110%}
            #menu-toggle.open .hamburger-line:nth-child(2){opacity:0}
            #menu-toggle.open .hamburger-line:nth-child(3){transform:translateY(-8px) rotate(-45deg);width:110%}
            #menu-toggle:hover .hamburger-line{background:#5eead4}
            /* Mobile menu slide / fade */
            #mobile-menu{transition:transform .25s ease,opacity .25s ease}
            #mobile-menu.open{transform:translateY(0);opacity:1}
            /* Accordion panels */
            .mm-panel{overflow:hidden;max-height:0;opacity:.0;transition:max-height .3s ease,opacity .25s ease}
            .mm-panel.open{max-height:999px;opacity:1}
            .mm-toggle .mm-chev{transition:transform .25s ease}
            .mm-toggle.open .mm-chev{transform:rotate(180deg)}
          `;
          document.head.appendChild(style);
        }

      // Right-side container (cart + links)
      let right = nav.querySelector('.flex.items-center.space-x-6');
      if (!right) {
        const candidates = $$('.flex.items-center', nav);
        right = candidates[candidates.length - 1] || null;
      }

      const cartBtn = $('#cart-btn', nav);
      if (right && cartBtn && !$('#menu-toggle', nav)) {
        // Create hamburger button
        const btn = document.createElement('button');
        btn.id = 'menu-toggle';
        btn.setAttribute('aria-label', 'Abrir menú');
        btn.setAttribute('aria-controls', 'mobile-menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.className = 'md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2 focus:ring-offset-gray-900';
        btn.innerHTML = '<span class="sr-only">Abrir menú</span>' +
          '<div class="relative w-6 h-4">' +
          '  <span class="hamburger-line" style="top:0"></span>' +
          '  <span class="hamburger-line" style="top:50%;transform:translateY(-50%)"></span>' +
          '  <span class="hamburger-line" style="bottom:0"></span>' +
          '</div>';

        // Insert button right after cart
        cartBtn.insertAdjacentElement('afterend', btn);

        // Create mobile menu container if not exists
        const headerEl = header;
        let mobileMenu = document.getElementById('mobile-menu');
          if (!mobileMenu && headerEl) {
            mobileMenu = document.createElement('div');
            mobileMenu.id = 'mobile-menu';
            mobileMenu.className = 'md:hidden hidden border-t border-gray-800 bg-gray-900/95';
            mobileMenu.innerHTML = '<div class="px-6 py-3 space-y-3" id="mobile-menu-items"></div>';
            headerEl.appendChild(mobileMenu);
          }

          // Build mobile menu structure (accordion with Productos and Contacto)
          const itemsWrap = $('#mobile-menu-items');
          if (itemsWrap) {
            itemsWrap.innerHTML = `
              <div>
                <button id="mm-products-toggle" class="mm-toggle w-full flex items-center justify-between text-white font-medium py-2">
                  <span>Productos</span>
                  <svg class="mm-chev w-4 h-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.11l3.71-3.88a.75.75 0 111.08 1.04l-4.25 4.45a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>
                </button>
                <div id="mm-products-panel" class="mm-panel pl-2">
                  <a id="mm-all-products" class="block py-2 text-gray-200 hover:text-teal-400" href="#categorias">Ver todo (menu principal)</a>
                  <div id="mm-categories-list" class="my-1 text-gray-300">
                    <div class="py-1 text-gray-400">Cargando categorias...</div>
                  </div>
                </div>
              </div>
              <a class="block text-white hover:text-teal-400 transition-colors py-2" href="contact.html">Contacto</a>
            `;

            const productsToggle = document.getElementById('mm-products-toggle');
            const productsPanel = document.getElementById('mm-products-panel');
            const allProducts = document.getElementById('mm-all-products');

            const togglePanel = (toggleEl, panelEl) => {
              if (!panelEl) return;
              const isOpen = panelEl.classList.contains('open');
              panelEl.classList.toggle('open', !isOpen);
              if (toggleEl) toggleEl.classList.toggle('open', !isOpen);
            };
            productsToggle?.addEventListener('click', () => togglePanel(productsToggle, productsPanel));
            allProducts?.addEventListener('click', (e) => {
              try {
                const url = new URL(window.location.href);
                url.searchParams.delete('categoria');
                url.searchParams.delete('min');
                url.searchParams.delete('max');
                history.pushState({}, '', url);
              } catch {}
              filterProductSectionsBySlug(null);
              updateCategoryUIForFilter(null);
              closeMenu();
            });
          }

          // Toggle logic
          const openMenu = () => {
            if (!mobileMenu) return;
            mobileMenu.classList.remove('hidden');
            mobileMenu.classList.add('open');
            btn.classList.add('open');
            btn.setAttribute('aria-expanded', 'true');
          };
          const closeMenu = () => {
            if (!mobileMenu) return;
            mobileMenu.classList.add('hidden');
            mobileMenu.classList.remove('open');
            btn.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
          };
        btn.addEventListener('click', () => {
          const expanded = btn.getAttribute('aria-expanded') === 'true';
          expanded ? closeMenu() : openMenu();
        });
        document.addEventListener('click', (e) => {
          if (!mobileMenu) return;
          if (!mobileMenu.contains(e.target) && !btn.contains(e.target)) closeMenu();
        });
        window.addEventListener('resize', () => { if (window.innerWidth >= 768) closeMenu(); });
          $$('#mobile-menu a').forEach(a => a.addEventListener('click', closeMenu));
        }
      }
    } catch {}

    // Build categories submenu inside mobile menu once data is loaded
    function populateMobileCategoriesMenu() {
      const list = document.getElementById('mm-categories-list');
      if (!list) return;
      const cats = Array.isArray(state.categories) ? state.categories : [];
      if (!cats.length) {
        list.innerHTML = '<div class="py-1 text-gray-400">No hay categorias.</div>';
        return;
      }
      list.innerHTML = '';
      cats.forEach(cat => {
        const catSlug = slug(cat.name);
        const count = state.products.filter(p => String(getProductCategoryId(p)) === String(cat.id)).length;
        const wrap = document.createElement('div');
        wrap.className = 'border-b border-gray-800 last:border-b-0';
        const btn = document.createElement('button');
        btn.className = 'mm-toggle w-full flex items-center justify-between text-gray-200 hover:text-teal-400 py-2';
        btn.innerHTML = `<span>${decodeEntities(cat.name)} <span class="text-xs text-gray-500">(${count})</span></span>
                         <svg class="mm-chev w-4 h-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.11l3.71-3.88a.75.75 0 111.08 1.04l-4.25 4.45a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>`;
        const panel = document.createElement('div');
        panel.className = 'mm-panel pl-3';
        const link = document.createElement('a');
        link.href = '#categorias';
        link.className = 'block py-2 text-gray-300 hover:text-teal-400';
        link.textContent = 'Ver categoria';
        link.addEventListener('click', (e) => {
          e.preventDefault();
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('categoria', catSlug);
            history.pushState({}, '', url);
          } catch {}
          applyCategoryFilterFromURL();
          const mt = document.getElementById('menu-toggle');
          if (mt && mt.getAttribute('aria-expanded') === 'true') mt.click();
        });
        panel.appendChild(link);
        btn.addEventListener('click', () => {
          const isOpen = panel.classList.contains('open');
          panel.classList.toggle('open', !isOpen);
          btn.classList.toggle('open', !isOpen);
        });
        wrap.appendChild(btn);
        wrap.appendChild(panel);
        list.appendChild(wrap);
      });
    }

  // --- Safe description rendering (allow images from admin) ---
  function decodeEntities(str) {
    const txt = document.createElement('textarea');
    txt.innerHTML = String(str || '');
    return txt.value;
  }

  // Normaliza URLs de imagenes que puedan venir con entidades HTML u otros artefactos.
  function getSafeImageUrl(input, fallback) {
    const decoded = decodeEntities(input || '');
    let s = decoded.trim();
    if (!s) return fallback;
    // Corrige casos como "https://&/" producidos por doble escape
    s = s.replace('://&/', '://');
    // Si quedó "&//cdn..." (de "&/#x2F;&#x2F;cdn...") quitar el & inicial
    if (s.startsWith('&//')) s = s.slice(1);
    // Maneja URLs relativas al protocolo
    if (s.startsWith('//')) s = 'https:' + s;
    // Asegura exactamente dos barras tras el esquema
    s = s.replace(/^(https?:)\/+/, '$1//');
    // Permite solo http/https
    if (!/^https?:\/\//i.test(s)) return fallback;
    // Evita espacios u otros caracteres problemáticos
    if (/\s/.test(s)) return fallback;
    return s;
  }

  // Redefinición para soportar rutas relativas del backend y URLs http(s)
  function getSafeImageUrl(input, fallback) {
    const decoded = decodeEntities(input || '');
    let s = decoded.trim();
    if (!s) return fallback;
    s = s.replace('://&/', '://');
    if (s.startsWith('&//')) s = s.slice(1);
    if (s.startsWith('//')) s = 'https:' + s;
    s = s.replace(/^(https?:)\/+/, '$1//');
    if (/^https?:\/\//i.test(s)) {
      if (/\s/.test(s)) return fallback;
      return s;
    }
    if (s.startsWith('/')) {
      return API_ORIGIN.replace(/\/$/, '') + s;
    }
    if (s.startsWith('./')) s = s.slice(2);
    if (!s.includes('://')) {
      return API_ORIGIN.replace(/\/$/, '') + '/' + s.replace(/^\/+/, '');
    }
    if (/\s/.test(s)) return fallback;
    return s;
  }

  /**
   * Limpia y sanitiza el HTML de entrada para mostrar solo tags seguros (p, img, li, etc.).
   * @param {string} input - La descripción del producto (puede contener HTML).
   * @returns {DocumentFragment | null} Un fragmento DOM limpio o null.
   */
  function sanitizeHTMLToFragment(input) {
    const decoded = decodeEntities(input);
    if (!decoded) return null;
    const parser = new DOMParser();
    const doc = parser.parseFromString(decoded, 'text/html');
    const frag = document.createDocumentFragment();
    // Tags permitidos para la descripción extendida. Añadimos 'div' y 'span' para flexibilidad.
    const ALLOWED = new Set(['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'h3', 'h4', 'img', 'div', 'span']);
    
    // Función recursiva para limpiar nodos
    function cleanNode(node) {
      if (node.nodeType === 1) { // Element node
        const tagName = node.tagName.toLowerCase();
        if (ALLOWED.has(tagName)) {
          // Si es una imagen, solo permitimos el src y alt
          if (tagName === 'img') {
            const safeNode = document.createElement('img');
            safeNode.src = node.getAttribute('src') || '';
            safeNode.alt = node.getAttribute('alt') || '';
            // Clases de diseño Tailwind para imágenes dentro de la descripción
            safeNode.className = 'w-full h-auto object-cover rounded-lg my-4 shadow-md'; 
            return safeNode;
          }
          // Para otros elementos, clonamos y limpiamos recursivamente
          const safeNode = document.createElement(tagName);
          Array.from(node.childNodes).forEach(child => {
            const cleaned = cleanNode(child);
            if (cleaned) safeNode.appendChild(cleaned);
          });
          return safeNode;
        } else {
          // Si no está permitido, intentamos limpiar sus hijos
          const container = document.createDocumentFragment();
          Array.from(node.childNodes).forEach(child => {
            const cleaned = cleanNode(child);
            if (cleaned) container.appendChild(cleaned);
          });
          return container;
        }
      } else if (node.nodeType === 3) { // Text node
        return document.createTextNode(node.nodeValue);
      }
      return null;
    }

    Array.from(doc.body.childNodes).forEach(child => {
      const cleaned = cleanNode(child);
      if (cleaned) frag.appendChild(cleaned);
    });

    // Si no se pudo limpiar nada, devolvemos null
    if (frag.childNodes.length === 0 && decoded) {
        // Si hay texto decodificado pero no se generaron nodos, devolvemos el texto plano
        const p = document.createElement('p');
        p.textContent = decoded;
        frag.appendChild(p);
    } else if (frag.childNodes.length === 0) {
        return null;
    }
    return frag;
  }

  // --- API Calls ---
  async function fetchJSON(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      let msg = `Error ${res.status} al acceder a ${url}`;
      try {
        const data = await res.json();
        msg = data.message || msg;
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  }

  // --- Cart Logic ---
  const cartModal = $('#cart-modal');
  const cartBtn = $('#cart-btn');
  const closeCartModalBtn = $('#close-cart-modal');
  const cartCountEl = $('#cart-count');
  const cartItemsContainer = $('#cart-items-container');
  const cartTotalEl = $('#cart-total');
  const emptyCartMessage = $('#empty-cart-message');
  const checkoutBtn = $('#checkout-btn');
  // Checkout (modal de datos del comprador)
  const checkoutModal = $('#checkout-modal');
  const closeCheckoutModalBtn = $('#close-checkout-modal');
  const checkoutForm = $('#checkout-form');
  const buyerEmailInput = $('#buyer-email');
  const buyerPhoneInput = $('#buyer-phone');
  const buyerCodeInput = $('#buyer-code');
  const confirmCheckoutBtn = $('#confirm-checkout-btn');

  function saveCart() {
    try {
      localStorage.setItem('tecnocel_cart', JSON.stringify(state.cart));
    } catch {}
    updateCartUI();
  }

  function loadCart() {
    try {
      const saved = localStorage.getItem('tecnocel_cart');
      if (saved) state.cart = JSON.parse(saved);
    } catch {
      state.cart = [];
    }
    updateCartUI();
  }

  function addToCart(product) {
    const existing = state.cart.find(item => item.id === product.id);
    if (existing) {
      existing.qty += 1;
    } else {
      state.cart.push({ ...product, qty: 1 });
    }
    saveCart();
    // Mensaje temporal de feedback
    showTempMessage(`"${product.name}" agregado al carrito.`);
    // Bump animation on cart count
    try {
      if (cartCountEl) {
        cartCountEl.classList.remove('count-bump');
        void cartCountEl.offsetWidth; // restart animation
        cartCountEl.classList.add('count-bump');
      }
    } catch {}
  }

  function removeFromCart(productId) {
    const pid = String(productId);
    const index = state.cart.findIndex(item => String(item.id) === pid);
    if (index > -1) {
      state.cart.splice(index, 1);
      saveCart();
    }
  }

  function changeCartQuantity(productId, delta) {
    const pid = String(productId);
    const item = state.cart.find(i => String(i.id) === pid);
    if (item) {
      item.qty += delta;
      if (item.qty <= 0) {
        removeFromCart(pid);
      } else {
        saveCart();
      }
    }
  }

  function calculateCartTotal() {
    return state.cart.reduce((total, item) => total + (item.price * item.qty), 0);
  }

  function updateCartUI() {
    const total = calculateCartTotal();
    cartCountEl.textContent = state.cart.reduce((sum, item) => sum + item.qty, 0);
    cartTotalEl.textContent = formatCurrency(total);
    
    // Renderiza los items del carrito
    cartItemsContainer.innerHTML = '';
    if (state.cart.length === 0) {
      emptyCartMessage.style.display = 'block';
      checkoutBtn.disabled = true;
    } else {
      emptyCartMessage.style.display = 'none';
      checkoutBtn.disabled = false;
      state.cart.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'flex items-center justify-between p-3 bg-gray-700 rounded-lg shadow';
        itemEl.innerHTML = `
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-white truncate">${item.name}</p>
            <p class="text-xs text-teal-400">${formatCurrency(item.price)} c/u</p>
          </div>
          <div class="flex items-center space-x-2 ml-4">
            <button class="qty-change-btn text-gray-400 hover:text-white transition-colors" data-id="${item.id}" data-delta="-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" /></svg>
            </button>
            <span class="text-sm font-medium text-white">${item.qty}</span>
            <button class="qty-change-btn text-gray-400 hover:text-white transition-colors" data-id="${item.id}" data-delta="1">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
            </button>
            <button class="remove-from-cart-btn text-red-400 hover:text-red-500 transition-colors ml-3" data-id="${item.id}">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        `;
        cartItemsContainer.appendChild(itemEl);
      });
    }

    // Agregar listeners a los botones dentro del modal
    $$('.qty-change-btn', cartItemsContainer).forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const delta = parseInt(btn.dataset.delta, 10);
        changeCartQuantity(id, delta);
      });
    });

    $$('.remove-from-cart-btn', cartItemsContainer).forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        removeFromCart(id);
      });
    });
  }

  // --- Product Detail Modal Logic ---
  const detailModal = $('#product-detail-modal');
  const closeDetailModalBtn = $('#close-detail-modal');
  const detailName = $('#detail-name');
  const detailPrice = $('#detail-price');
  const detailImage = $('#detail-image');
  const detailDescription = $('#detail-description');
  const detailStock = $('#detail-stock');
  const detailAddToCartBtn = $('#detail-add-to-cart-btn');

  // Related products (same category)
  function renderRelatedProducts(baseProduct) {
    try {
      if (!detailModal) return;
      const panel = detailModal.firstElementChild || detailModal;
      if (!panel) return;

      let section = panel.querySelector('#related-products-section');
      if (!section) {
        section = document.createElement('div');
        section.id = 'related-products-section';
        section.className = 'mt-10';
        section.innerHTML = '<h3 class="text-2xl md:text-3xl font-bold text-white mb-6">Productos relacionados</h3>' +
                            '<div id="related-products-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"></div>';
        panel.appendChild(section);
      }

      const grid = section.querySelector('#related-products-grid');
      if (!grid) return;

      const baseCat = String(getProductCategoryId(baseProduct) || '');
      const related = state.products
        .filter(p => String(getProductCategoryId(p)) === baseCat && String(p.id) !== String(baseProduct.id))
        .slice(0, 6);

      if (!related.length) {
        section.classList.add('hidden');
        grid.innerHTML = '';
        return;
      }

      section.classList.remove('hidden');
      grid.innerHTML = related.map(renderProductCard).join('');
      try { setupScrollReveal(); } catch {}
      try { grid.querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible')); } catch {}
    } catch (err) {
      console.error('Error rendering related products', err);
    }
  }

  function showProductDetail(product) {
    state.currentProduct = product;
    detailName.textContent = product.name;
    detailPrice.textContent = formatCurrency(product.price);
    const imageUrl = getSafeImageUrl(product.image_url || product.imageUrl, 'https://placehold.co/800x600/1f2937/d1d5db?text=Sin+Imagen');
    detailImage.src = imageUrl;
    detailImage.alt = product.name;
    const stockQty = getStockQty(product);
    detailStock.textContent = stockQty > 0 ? `Stock: ${stockQty}` : 'Agotado';
    detailStock.className = `text-sm font-medium ${stockQty > 0 ? 'text-green-500' : 'text-red-500'}`;

    // Limpiar y renderizar la descripción y especificaciones
    detailDescription.innerHTML = '';
    // Sección Descripción
    const descTitle = document.createElement('h3');
    descTitle.className = 'text-2xl font-bold text-white mt-2 mb-3';
    descTitle.textContent = 'Descripción';
    detailDescription.appendChild(descTitle);

    const descriptionFragment = sanitizeHTMLToFragment(product.description);
    if (descriptionFragment) {
        detailDescription.appendChild(descriptionFragment);
    } else if (product.description) {
        const p = document.createElement('p');
        p.className = 'text-gray-300';
        p.textContent = String(product.description);
        detailDescription.appendChild(p);
    } else {
        const p = document.createElement('p');
        p.className = 'text-gray-400 italic';
        p.textContent = 'No hay descripción detallada disponible.';
        detailDescription.appendChild(p);
    }

    // Sección Especificaciones
    const specsTitle = document.createElement('h3');
    specsTitle.className = 'text-2xl font-bold text-white mt-6 mb-3';
    specsTitle.textContent = 'Especificaciones';

    // Intentar diferentes campos posibles para especificaciones
    const possibleSpecs = product.specs || product.specifications || product.especificaciones || product.attributes || null;
    let specsRendered = false;
    if (possibleSpecs) {
      if (typeof possibleSpecs === 'string') {
        // Convertir cadena libre en lista de items legibles
        const raw = decodeEntities(String(possibleSpecs || ''));
        const normalized = raw
          .replace(/<[^>]+>/g, ' ')        // quitar HTML
          .replace(/[•\*\-]\s+/g, '\n') // bullets comunes -> nueva línea
          .replace(/\s*;\s*/g, '\n')     // ; como separador
          .replace(/\s*\|\s*/g, '\n');  // | como separador
        const items = normalized
          .split(/\r?\n+/)
          .map(s => s.trim())
          .filter(Boolean);
        const ul = document.createElement('ul');
        ul.className = 'space-y-2 mt-3';
        items.forEach(txt => {
          const li = document.createElement('li');
          li.className = 'flex items-center text-gray-300 transition-transform hover:translate-x-0.5';
          li.innerHTML = `<span class=\"text-teal-400 mr-2\">✔</span>${decodeEntities(txt)}`;
          ul.appendChild(li);
        });
        detailDescription.appendChild(specsTitle);
        detailDescription.appendChild(ul);
        specsRendered = true;
      } else if (Array.isArray(possibleSpecs)) {
        const ul = document.createElement('ul');
        ul.className = 'space-y-2 mt-3';
        possibleSpecs.forEach(item => {
          let label = '';
          let value = '';
          if (typeof item === 'string') {
            value = item;
          } else if (item && typeof item === 'object') {
            label = item.name || item.key || '';
            value = item.value || item.val || item.descripcion || '';
          }
          const li = document.createElement('li');
          li.className = 'flex items-center text-gray-300 transition-transform hover:translate-x-0.5';
          const content = label ? `<span class=\"text-gray-400\">${label}:</span> ${decodeEntities(String(value || ''))}` : decodeEntities(String(value || label || ''));
          li.innerHTML = `<span class=\"text-teal-400 mr-2\">✔</span>${content}`;
          ul.appendChild(li);
        });
        if (ul.childNodes.length) {
          detailDescription.appendChild(specsTitle);
          detailDescription.appendChild(ul);
          specsRendered = true;
        }
      } else if (typeof possibleSpecs === 'object') {
        const entries = Object.entries(possibleSpecs);
        if (entries.length) {
          const ul = document.createElement('ul');
          ul.className = 'space-y-2 mt-3';
          entries.forEach(([k, v]) => {
            const li = document.createElement('li');
            li.className = 'flex items-center text-gray-300 transition-transform hover:translate-x-0.5';
            const val = typeof v === 'string' ? v : JSON.stringify(v);
            li.innerHTML = `<span class=\"text-teal-400 mr-2\">✔</span><span class=\"text-gray-400\">${decodeEntities(k)}:</span> ${decodeEntities(val)}`;
            ul.appendChild(li);
          });
          detailDescription.appendChild(specsTitle);
          detailDescription.appendChild(ul);
          specsRendered = true;
        }
      }
    }
    if (!specsRendered) {
      // Si no hay especificaciones, deja el título fuera y muestra un texto gris suave
      const p = document.createElement('p');
      p.className = 'text-gray-400 italic mt-6';
      p.textContent = 'No hay especificaciones disponibles.';
      detailDescription.appendChild(specsTitle);
      detailDescription.appendChild(p);
    }

    // Configurar botón de añadir al carrito en el modal
    detailAddToCartBtn.dataset.id = product.id;
    detailAddToCartBtn.disabled = stockQty <= 0;
    detailAddToCartBtn.textContent = stockQty <= 0 ? 'Agotado' : 'Agregar al Carrito';

    // Render related products
    renderRelatedProducts(product);

    // Mostrar modal y activar animaciones/data-attrs para que sea visible
    detailModal.classList.remove('hidden');
    detailModal.setAttribute('data-visible', 'true');
    // Overlay fade-in animation (CSS keyframes)
    detailModal.classList.add('modal-overlay-open');
    // Remove animation flag after it runs to allow retrigger next time
    setTimeout(() => detailModal.classList.remove('modal-overlay-open'), 350);
    // Panel pop-in animation
    const panel = detailModal.firstElementChild;
    if (panel) {
      panel.setAttribute('data-visible', 'true');
      // Ensure visibility even if Tailwind data-variant isn't active
      panel.classList.remove('opacity-0', 'scale-95');
      // Retrigger CSS animation
      panel.classList.remove('modal-pop-in');
      // Force reflow to restart animation
      void panel.offsetWidth;
      panel.classList.add('modal-pop-in');
    }
  }

  function closeProductDetail() {
    // Desactivar data-attrs y ocultar
    const panel = detailModal?.firstElementChild;
    if (panel) panel.removeAttribute('data-visible');
    detailModal?.removeAttribute('data-visible');
    detailModal.classList.add('hidden');
    state.currentProduct = null;
  }

  // Evento para cerrar el modal de detalles
  closeDetailModalBtn?.addEventListener('click', closeProductDetail);
  detailModal?.addEventListener('click', (e) => {
    if (e.target === detailModal) {
      closeProductDetail();
    }
  });

  // Evento para añadir al carrito desde el modal de detalles
  detailAddToCartBtn?.addEventListener('click', (e) => {
    const id = e.target.dataset.id;
    const product = state.products.find(p => String(p.id) === String(id));
    if (product) {
        addToCart(product);
    }
  });


  // --- UI Interactions (Cart) ---
  cartBtn?.addEventListener('click', () => {
    if (!cartModal) return;
    cartModal.classList.remove('hidden');
    cartModal.setAttribute('data-visible', 'true');
    const panel = cartModal.firstElementChild;
    if (panel) {
      panel.setAttribute('data-visible', 'true');
      // Asegura visibilidad aunque el variant de Tailwind no aplique
      panel.classList.remove('opacity-0', 'scale-95');
    }
  });
  
  closeCartModalBtn?.addEventListener('click', () => {
    if (!cartModal) return;
    const panel = cartModal.firstElementChild;
    if (panel) {
      panel.removeAttribute('data-visible');
      panel.classList.add('opacity-0', 'scale-95');
    }
    cartModal.removeAttribute('data-visible');
    cartModal.classList.add('hidden');
  });
  
  cartModal?.addEventListener('click', (e) => {
    if (!cartModal) return;
    if (e.target === cartModal) {
      const panel = cartModal.firstElementChild;
      if (panel) {
        panel.removeAttribute('data-visible');
        panel.classList.add('opacity-0', 'scale-95');
      }
      cartModal.removeAttribute('data-visible');
      cartModal.classList.add('hidden');
    }
  });

  // Delegación de eventos para agregar al carrito (desde tarjeta)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.add-to-cart-btn');
    if (btn) {
      const productId = btn.dataset.id;
      const product = state.products.find(p => String(p.id) === String(productId));
      if (product) {
        addToCart(product);
      }
    }

    // Delegación de eventos para ver detalles (desde tarjeta)
    const detailBtn = e.target.closest('.view-details-btn');
    if (detailBtn) {
        const productId = detailBtn.dataset.id;
        const product = state.products.find(p => String(p.id) === String(productId));
        if (product) {
            showProductDetail(product);
        }
    }
    
    // Delegación de eventos para ir a la sección de productos desde la tarjeta de categoría
    const categoryCard = e.target.closest('.category-card');
    if (categoryCard) {
        const categorySlug = categoryCard.dataset.slug;
        const target = $(`#cat-${categorySlug}`);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    }
  });

  // Mensaje temporal (simula un toast/snackbar)
  function showTempMessage(message) {
      let toast = $('#temp-message');
      if (!toast) {
          toast = document.createElement('div');
          toast.id = 'temp-message';
          toast.className = 'fixed bottom-5 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-teal-400 to-cyan-400 text-gray-900 px-6 py-3 rounded-full shadow-xl opacity-0 transition-opacity duration-300 z-[200] font-semibold';
          document.body.appendChild(toast);
      }
      toast.innerHTML = `✅ ${message}`;
      toast.style.opacity = '1';
      
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => {
          toast.style.opacity = '0';
      }, 3000);
  }

  // Scroll reveal: anima elementos con clase .reveal al entrar en viewport
  function setupScrollReveal() {
    const elements = $$('.reveal');
    if (!elements.length) return;
    if (!('IntersectionObserver' in window)) {
      elements.forEach(el => el.classList.add('is-visible'));
      return;
    }
    const seen = new WeakSet();
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          seen.add(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });
    elements.forEach(el => { if (!seen.has(el)) io.observe(el); });
  }

  // Ensure category click sets URL filter and applies it
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.category-card');
    if (!card) return;
    const categorySlug = card.dataset.slug;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('categoria', categorySlug);
      history.pushState({}, '', url);
      applyCategoryFilterFromURL();
    } catch {}
  });

  // --- Product Rendering ---
  /**
   * Genera el HTML para una tarjeta de producto con diseño moderno.
   * @param {object} product - Objeto producto con id, name, price, stock, description, category, imageUrl.
   * @returns {string} HTML de la tarjeta.
   */
  function renderProductCard(product) {
    const imageUrl = getSafeImageUrl(product.image_url || product.imageUrl, 'https://placehold.co/400x300/1f2937/d1d5db?text=Sin+Imagen');
    const stockQty = getStockQty(product);
    const inStock = stockQty > 0;
    const stockBadge = `<span class="absolute top-2 left-2 px-2.5 py-1 rounded-full text-xs font-semibold ${inStock ? 'bg-green-500 text-gray-900' : 'bg-red-500 text-white'}">${inStock ? 'En stock' : 'Agotado'}</span>`;
    const btnDisabledAttr = inStock ? '' : 'disabled';

    // Obtenemos un fragmento de la descripción para mostrar en la tarjeta
    const shortDescription = product.description 
        ? product.description.substring(0, 80) + '...' 
        : 'Sin descripción.';

    return `
      <div class="reveal product-card bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col hover:border-teal-500 transition-all duration-300" data-price="${Number(product.price) || 0}">
        <div class="relative h-48 overflow-hidden">
            ${stockBadge}
            <img 
                src="${imageUrl}" loading="lazy" decoding="async"
                alt="${product.name}" 
                class="w-full h-full object-cover transform transition-transform duration-500 hover:scale-110"
                onerror="this.onerror=null; this.src='https://placehold.co/400x300/1f2937/d1d5db?text=Error+al+Cargar'" 
            />
        </div>
        <div class="p-6 flex flex-col flex-grow">
          <h3 class="text-xl font-bold mb-2 text-teal-400">${product.name}</h3>
          <p class="text-2xl font-extrabold text-white mb-4">${formatCurrency(product.price)}</p>
          <div class="text-gray-400 text-sm mb-4 flex-grow">
              ${shortDescription}
          </div>
          <div class="flex flex-col sm:flex-row justify-between items-center gap-2 pt-4 border-t border-gray-700">
            <button 
              class="view-details-btn text-teal-500 hover:text-teal-400 border border-teal-500 hover:border-teal-400 font-semibold py-2 px-4 rounded-full transition-colors duration-200 w-full sm:w-auto"
              data-id="${product.id}"
            >
                Detalles
            </button>
            <button 
              class="add-to-cart-btn bg-teal-500 hover:bg-teal-600 text-gray-900 font-bold py-2 px-4 rounded-full transition-all duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed w-full sm:w-auto" 
              data-id="${product.id}"
              ${btnDisabledAttr}
            >
              Agregar
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // --- Category Rendering (New Visual Cards) ---

  /**
   * Genera el HTML para una tarjeta de categoría visual.
   * @param {object} category - Objeto categoría.
   * @returns {string} HTML de la tarjeta de categoría.
   */
  function renderCategoryCard(category) {
    const categorySlug = slug(category.name);
    // Intentamos encontrar el primer producto de esta categoría para usar su imagen
    const firstProduct = state.products.find(p => String(getProductCategoryId(p)) === String(category.id));
    // Usamos la imagen de la categoría o la del producto, o un placeholder.
    const imageUrl = getSafeImageUrl(
      category.image_url || category.imageUrl || firstProduct?.image_url || firstProduct?.imageUrl,
      'https://placehold.co/600x400/1f2937/d1d5db?text=Ver+Categor%C3%ADa'
    );
    const description = category.description || 'Explora todos los productos disponibles en esta sección.';

    return `
      <div 
        class="reveal category-card bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col transition-all duration-500 cursor-pointer hover:border-teal-500 hover:scale-[1.02] active:scale-[0.98]"
        data-slug="${categorySlug}"
      >
        <div class="h-40 overflow-hidden relative">
            <img 
                src="${imageUrl}" loading="lazy" decoding="async"
                alt="${category.name}" 
                class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                onerror="this.onerror=null; this.src='https://placehold.co/600x400/1f2937/d1d5db?text=Error+al+Cargar'" 
            />
            <!-- Overlay oscuro para mejor legibilidad del texto -->
            <div class="absolute inset-0 bg-gray-900 opacity-30 transition-opacity duration-300"></div>
        </div>
        <div class="p-6 flex flex-col flex-grow">
          <h3 class="text-2xl font-bold mb-2 text-teal-400">${category.name}</h3>
          <p class="text-gray-400 text-sm mb-4 flex-grow">${description}</p>
          <button 
            class="text-teal-500 hover:text-teal-400 font-semibold py-2 px-4 rounded-full transition-colors duration-200 self-start border border-teal-500 hover:border-teal-400"
          >
              Ver Categoría
          </button>
        </div>
      </div>
    `;
  }

  // --- Product Category Helper ---
  /**
   * Intenta obtener el ID de categoría de un producto, manejando diferentes formatos.
   * @param {object} product 
   * @returns {string | null}
   */
  function getProductCategoryId(product) {
    // Si viene como category_id (lo que el log muestra)
    if (typeof product.category_id === 'number' || typeof product.category_id === 'string') return String(product.category_id);
    
    // Antiguas verificaciones
    if (typeof product.category === 'string') return product.category;
    if (typeof product.categoryId === 'string') return product.categoryId;
    if (typeof product.category === 'object' && product.category?.id) return product.category.id;
    return null;
  }

  // Category filtering via URL (?categoria=slug | id)
  function normalizeToCategorySlug(input) {
    const raw = String(input || '').trim().toLowerCase();
    if (!raw) return null;
    const bySlug = state.categories.find(c => slug(c.name) === raw);
    if (bySlug) return slug(bySlug.name);
    const byId = state.categories.find(c => String(c.id) === raw);
    if (byId) return slug(byId.name);
    return raw;
  }

  function getCategoryBySlug(catSlug) {
    if (!catSlug) return null;
    return state.categories.find(c => slug(c.name) === String(catSlug));
  }

  function readCategorySlugFromURL() {
    try {
      const u = new URL(window.location.href);
      const v = u.searchParams.get('categoria') || u.searchParams.get('category') || u.searchParams.get('cat');
      let val = v;
      if (!val && window.location.hash) {
        const m = window.location.hash.match(/categoria=([A-Za-z0-9_-]+)/i);
        if (m) val = m[1];
      }
      return normalizeToCategorySlug(val);
    } catch {
      return null;
    }
  }

  function filterProductSectionsBySlug(catSlug) {
    const container = $('#product-grid-container');
    if (!container) return;
    const sections = $$('.category-section', container);
    if (!sections.length) return;

    if (!catSlug) {
      sections.forEach(sec => { sec.style.display = ''; });
      return;
    }
    let target = null;
    sections.forEach(sec => {
      const isTarget = sec.id === `cat-${catSlug}`;
      sec.style.display = isTarget ? '' : 'none';
      if (isTarget) target = sec;
    });
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    } else {
      // If slug not found, show all back
      sections.forEach(sec => { sec.style.display = ''; });
    }
  }

  function applyCategoryFilterFromURL() {
    const slugSel = readCategorySlugFromURL();
    filterProductSectionsBySlug(slugSel);
    updateCategoryUIForFilter(slugSel);
    // Apply price filter from URL if present
    if (slugSel) {
      const pf = readPriceFilterFromURL();
      if (pf) filterCurrentCategoryByPrice(slugSel, pf.min, pf.max);
    }
  }

  function updateCategoryUIForFilter(catSlug) {
    const cardsContainer = document.getElementById('category-cards-container');
    const productGridContainer = document.getElementById('product-grid-container');
    if (!productGridContainer) return;

    let banner = document.getElementById('category-filter-banner');
    if (!catSlug) {
      if (cardsContainer) cardsContainer.style.display = '';
      if (banner) banner.remove();
      return;
    }

    // Hide category cards
    if (cardsContainer) cardsContainer.style.display = 'none';

    // Build banner
    const cat = getCategoryBySlug(catSlug);
    const catName = cat ? cat.name : catSlug;
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'category-filter-banner';
      banner.className = 'flex items-center justify-between bg-gray-900/80 border border-teal-500/30 text-white rounded-lg px-4 py-3 mb-6';
      productGridContainer.insertAdjacentElement('beforebegin', banner);
    }
    banner.innerHTML = `
      <div><span class="text-gray-300">Mostrando categoría:</span> <span class="font-bold text-teal-400">${decodeEntities(catName)}</span></div>
      <button id="clear-category-filter" class="text-sm text-gray-200 hover:text-white bg-gray-700 hover:bg-gray-600 rounded px-3 py-1">Ver todas</button>
    `;
    const clearBtn = banner.querySelector('#clear-category-filter');
    clearBtn?.addEventListener('click', () => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('categoria');
        url.searchParams.delete('min');
        url.searchParams.delete('max');
        history.pushState({}, '', url);
      } catch {}
      // Show all
      filterProductSectionsBySlug(null);
      updateCategoryUIForFilter(null);
    });

    // Add price controls (once)
    try { banner.classList.add('flex-col', 'gap-3', 'md:flex-row', 'md:items-center'); } catch {}

    if (!document.getElementById('price-controls')) {
      const controls = document.createElement('div');
      controls.id = 'price-controls';
      controls.className = 'w-full md:w-auto';
      controls.innerHTML = `
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <span class="text-gray-300 font-medium">Precio</span>
          <div class="flex items-center gap-2">
            <div class="relative">
              <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input type="number" id="price-min" class="w-32 md:w-36 bg-gray-800/70 border border-gray-700/70 rounded-lg pl-7 pr-3 py-2 text-gray-100 placeholder-gray-400 shadow-inner focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-500 transition" placeholder="Min" min="0" step="1000" inputmode="numeric" aria-label="Precio minimo" title="Precio minimo" />
            </div>
            <span class="text-gray-400">—</span>
            <div class="relative">
              <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input type="number" id="price-max" class="w-32 md:w-36 bg-gray-800/70 border border-gray-700/70 rounded-lg pl-7 pr-3 py-2 text-gray-100 placeholder-gray-400 shadow-inner focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-500 transition" placeholder="Max" min="0" step="1000" inputmode="numeric" aria-label="Precio maximo" title="Precio maximo" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button id="apply-price-filter" class="text-sm bg-teal-500 hover:bg-teal-400 text-gray-900 font-semibold rounded-lg px-4 py-2 shadow transition">Aplicar</button>
            <button id="clear-price-filter" class="text-sm bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 rounded-lg px-4 py-2 transition">Limpiar</button>
          </div>
        </div>`;
      // Insert before the "Ver todas" button if present; otherwise append
      if (clearBtn) banner.insertBefore(controls, clearBtn);
      else banner.appendChild(controls);

      const $min = controls.querySelector('#price-min');
      const $max = controls.querySelector('#price-max');
      const pf = readPriceFilterFromURL() || {};
      if ($min && typeof pf.min === 'number' && Number.isFinite(pf.min)) $min.value = String(pf.min);
      if ($max && typeof pf.max === 'number' && Number.isFinite(pf.max)) $max.value = String(pf.max);

      const apply = () => {
        const minVal = $min && $min.value !== '' ? Number($min.value) : null;
        const maxVal = $max && $max.value !== '' ? Number($max.value) : null;
        let a = Number.isFinite(minVal) ? minVal : null;
        let b = Number.isFinite(maxVal) ? maxVal : null;
        if (a !== null && b !== null && a > b) { const t = a; a = b; b = t; }
        updatePriceFilterInURL(a, b);
        filterCurrentCategoryByPrice(catSlug, a, b);
      };
      const clearPrice = () => {
        if ($min) $min.value = '';
        if ($max) $max.value = '';
        updatePriceFilterInURL(null, null);
        filterCurrentCategoryByPrice(catSlug, null, null);
      };
      controls.querySelector('#apply-price-filter')?.addEventListener('click', apply);
      controls.querySelector('#clear-price-filter')?.addEventListener('click', clearPrice);
      [$min, $max].forEach(inp => inp && inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); }));

      if (pf && (Number.isFinite(pf.min) || Number.isFinite(pf.max))) {
        filterCurrentCategoryByPrice(catSlug, pf.min, pf.max);
      }
    }
  }

  // --- Price filter helpers ---
  function readPriceFilterFromURL() {
    try {
      const u = new URL(window.location.href);
      const rawMin = u.searchParams.get('min') || u.searchParams.get('precioMin') || u.searchParams.get('minimo');
      const rawMax = u.searchParams.get('max') || u.searchParams.get('precioMax') || u.searchParams.get('maximo');
      const min = rawMin !== null ? Number(rawMin) : null;
      const max = rawMax !== null ? Number(rawMax) : null;
      const out = {};
      out.min = Number.isFinite(min) ? min : null;
      out.max = Number.isFinite(max) ? max : null;
      if (out.min === null && out.max === null) return null;
      return out;
    } catch {
      return null;
    }
  }

  function updatePriceFilterInURL(min, max) {
    try {
      const url = new URL(window.location.href);
      if (min === null || min === undefined) url.searchParams.delete('min'); else url.searchParams.set('min', String(min));
      if (max === null || max === undefined) url.searchParams.delete('max'); else url.searchParams.set('max', String(max));
      history.pushState({}, '', url);
    } catch {}
  }

  function filterCurrentCategoryByPrice(catSlug, min, max) {
    if (!catSlug) return;
    const sec = document.getElementById(`cat-${catSlug}`);
    if (!sec) return;
    const cards = $$('.product-card', sec);
    cards.forEach(card => {
      const price = Number(card.dataset.price || '0');
      const passMin = (min !== null && min !== undefined && Number.isFinite(min)) ? (price >= min) : true;
      const passMax = (max !== null && max !== undefined && Number.isFinite(max)) ? (price <= max) : true;
      card.style.display = (passMin && passMax) ? '' : 'none';
    });
  }

  // --- FUNCIÓN PRINCIPAL DE RENDERIZADO (MODIFICADA) ---
  function renderCategoriesAndProducts() {
    // 1. Renderizar las Tarjetas de Categoría al principio de la sección
    const categoryCardsContainer = $('#category-cards-container');
    const productGridContainer = $('#product-grid-container');

    if (categoryCardsContainer) {
        // Renderizar las tarjetas visuales de categorías (todas las categorías, tengan o no productos)
        const categoriesToShow = state.categories;
        categoryCardsContainer.innerHTML = (categoriesToShow.length
          ? categoriesToShow.map(renderCategoryCard).join('')
          : '<div class="category-card bg-gray-900 h-64 rounded-xl flex items-center justify-center text-gray-500">No hay categorías disponibles.</div>');
    }


    // 2. Renderizar las secciones de productos (ocultas por defecto o debajo)
    if (productGridContainer) {
        productGridContainer.innerHTML = ''; // Limpiar productos anteriores
        
        state.categories.forEach(category => {
          // Usamos String(category.id) para asegurar que la comparación sea entre tipos iguales (category_id puede ser string o number)
          const productsInCategory = state.products.filter(p => String(getProductCategoryId(p)) === String(category.id));
          
          // Ocultar la sección si no hay productos
          if (productsInCategory.length === 0) return; 

          const categorySlug = slug(category.name);

          const sectionHTML = `
            <div id="cat-${categorySlug}" class="category-section mb-20 pt-16 -mt-16">
              <h3 class="text-3xl font-bold mb-10 text-center text-white border-b-2 border-teal-500 pb-3">${category.name}</h3>
              <!-- Cuadrícula responsiva para productos -->
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                ${productsInCategory.map(renderProductCard).join('')}
              </div>
            </div>
          `;
          // Insertamos en el contenedor de la cuadrícula de productos
          productGridContainer.insertAdjacentHTML('beforeend', sectionHTML);
        });
    }
  }

  // --- Data Loading ---
  async function loadData() {
    const sec = $('#categorias');
    const productGridContainer = $('#product-grid-container');
    if (!sec || !productGridContainer) return;

    // Mostrar un spinner de carga
    const spinner = document.createElement('div');
    spinner.id = 'loading-spinner';
    spinner.className = 'flex justify-center items-center py-10';
    spinner.innerHTML = `
      <div class="spinner w-10 h-10 border-4 border-gray-700 border-t-4 rounded-full mr-3 animate-spin border-teal-500"></div>
      <span class="text-xl text-teal-400">Cargando productos desde ${API_BASE}...</span>
    `;
    productGridContainer.appendChild(spinner);

    try {
      // Cargar categorías
      const catRes = await fetchJSON(`${API_BASE}/categorias`);
      state.categories = Array.isArray(catRes) ? catRes : (catRes.categories || []); 

      // Cargar productos
      const prodRes = await fetchJSON(`${API_BASE}/productos`);
      state.products = Array.isArray(prodRes) ? prodRes : (prodRes.products || []);

      // Renderizar categorías (tarjetas) y secciones de productos
        renderCategoriesAndProducts();
        applyCategoryFilterFromURL();
        try { populateMobileCategoriesMenu(); } catch {}
        try { setupScrollReveal(); } catch {}

    } catch (e) {
      console.error('Error al cargar datos:', e);
      // Mostrar mensaje de error más visible
      if (productGridContainer.lastElementChild === spinner) {
        spinner.remove();
        const errorEl = document.createElement('p');
        errorEl.className = 'text-center text-xl font-bold p-6 bg-red-900 text-red-300 rounded-lg mx-auto max-w-lg';
        errorEl.textContent = `❌ ERROR DE CONEXIÓN: No se pudieron cargar datos desde ${API_BASE}. Verifique que el backend esté encendido y que esta URL sea correcta.`;
        productGridContainer.appendChild(errorEl);
      }
    } finally {
      if (spinner.parentNode) spinner.remove();
    }
  }

  // Optional: simple checkout using public endpoint
  async function checkout() {
    if (!state.cart.length) {
      showTempMessage('El carrito está vacío');
      return;
    }

    // Desactivar el botón para evitar doble click
    checkoutBtn.disabled = true;
    const originalText = checkoutBtn.textContent;
    checkoutBtn.textContent = 'Procesando...';

    try {
      const res = await fetchJSON(`${API_BASE}/checkout`, {
        method: 'POST',
        body: JSON.stringify({
          buyer: { name: 'Cliente Web', email: null, phone: null },
          items: state.cart.map(i => ({ productId: i.id, quantity: i.qty })),
        }),
      });
      // En lugar de alert, usamos el mensaje temporal
      showTempMessage(`¡Orden #${res.orderNumber || res.orderId || 'OK'} creada con éxito!`);
      
      // Limpiar carrito
      state.cart = [];
      try { localStorage.removeItem('tecnocel_cart'); } catch {}
      updateCartUI();
      cartModal.classList.add('hidden'); // Cerrar modal

    } catch (e) {
      console.error('Checkout error', e);
      // Usamos el mensaje temporal para el error
      showTempMessage(`No se pudo completar la compra: ${e.message || 'Error desconocido'}`);
    } finally {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = originalText;
    }
  }
  
  // Override: abrir modal de checkout en lugar de enviar directo
  checkoutBtn?.addEventListener('click', () => {
    try {
      const savedCode = localStorage.getItem('tecnocel_buyer_code');
      if (savedCode && buyerCodeInput) buyerCodeInput.value = savedCode;
    } catch {}
    if (!state.cart.length) { showTempMessage('El carrito está vacío'); return; }
    if (checkoutModal) {
      checkoutModal.classList.remove('hidden');
      checkoutModal.setAttribute('data-visible', 'true');
      const panel = checkoutModal.firstElementChild;
      if (panel) { panel.setAttribute('data-visible', 'true'); panel.classList.remove('opacity-0', 'scale-95'); }
    }
  });

  // Cierre del modal de checkout
  closeCheckoutModalBtn?.addEventListener('click', () => {
    if (!checkoutModal) return;
    const panel = checkoutModal.firstElementChild;
    if (panel) { panel.removeAttribute('data-visible'); panel.classList.add('opacity-0', 'scale-95'); }
    checkoutModal.removeAttribute('data-visible');
    checkoutModal.classList.add('hidden');
  });
  checkoutModal?.addEventListener('click', (e) => { if (e.target === checkoutModal) {
    const panel = checkoutModal.firstElementChild;
    if (panel) { panel.removeAttribute('data-visible'); panel.classList.add('opacity-0', 'scale-95'); }
    checkoutModal.removeAttribute('data-visible');
    checkoutModal.classList.add('hidden');
  }});

  // Confirmación de checkout (envío al backend)
  checkoutForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.cart.length) { showTempMessage('El carrito está vacío'); return; }
    const email = (buyerEmailInput?.value || '').trim();
    const phone = (buyerPhoneInput?.value || '').trim();
    const codeRaw = (buyerCodeInput?.value || '').trim();
    if (!email || !phone) { showTempMessage('Completá email y teléfono'); return; }
    if (confirmCheckoutBtn) { confirmCheckoutBtn.disabled = true; confirmCheckoutBtn.textContent = 'Procesando...'; }
    try {
      const payload = { buyer: { name: 'Cliente Web', email, phone, ...(codeRaw ? { code: codeRaw } : {}) }, items: state.cart.map(i => ({ productId: i.id, quantity: i.qty })) };
      const res = await fetchJSON(`${API_BASE}/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const orderNum = res.orderNumber || res.orderId || 'OK';
      const buyerCode = res.buyerCode || codeRaw || null;
      showTempMessage(`Orden #${orderNum} creada con éxito`);
      if (buyerCode) { try { localStorage.setItem('tecnocel_buyer_code', String(buyerCode)); } catch {} }
      // Limpiar carrito y cerrar modales
      state.cart = [];
      try { localStorage.removeItem('tecnocel_cart'); } catch {}
      updateCartUI();
      // Cerrar checkout modal
      const panel = checkoutModal?.firstElementChild;
      if (panel) { panel.removeAttribute('data-visible'); panel.classList.add('opacity-0', 'scale-95'); }
      checkoutModal?.removeAttribute('data-visible');
      checkoutModal?.classList.add('hidden');
      // Cerrar cart modal si estuviera abierto
      if (cartModal) {
        const p2 = cartModal.firstElementChild;
        if (p2) { p2.removeAttribute('data-visible'); p2.classList.add('opacity-0', 'scale-95'); }
        cartModal.removeAttribute('data-visible');
        cartModal.classList.add('hidden');
      }
    } catch (err) {
      console.error('Checkout error', err);
      showTempMessage(`No se pudo completar la compra: ${err.message || 'Error desconocido'}`);
    } finally {
      if (confirmCheckoutBtn) { confirmCheckoutBtn.disabled = false; confirmCheckoutBtn.textContent = 'Confirmar compra'; }
    }
  });

  function exposeForDebug() {
    // Expose minimal API for quick testing in console
    window.tecnocel = {
      state,
      reload: loadData,
      checkout,
    };
  }

  function init() {
    loadCart();
    loadData();
    exposeForDebug();
    // Apply filter on browser navigation
    window.addEventListener('popstate', applyCategoryFilterFromURL);

    // Inyectar el HTML del modal de detalles (solo si no existe)
    // Deshabilitado: usamos el modal estático definido en index.html
    if (false && !detailModal) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="product-detail-modal" class="hidden fixed inset-0 z-[100] bg-gray-900 bg-opacity-90 flex items-center justify-center p-4 transition-opacity duration-300">
                <div class="bg-gray-800 rounded-xl shadow-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto transform transition-transform duration-300 scale-95 opacity-0 data-[visible='true']:scale-100 data-[visible='true']:opacity-100">
                    <div class="p-6 md:p-10 relative">
                        <!-- Botón de Cerrar -->
                        <button id="close-detail-modal" class="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>

                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <!-- Columna de Imagen/Precio -->
                            <div class="lg:sticky lg:top-0">
                                <img id="detail-image" src="https://placehold.co/800x600/1f2937/d1d5db?text=Cargando..." alt="Producto Detalle" class="w-full h-auto object-cover rounded-lg mb-6 shadow-xl border border-gray-700">
                                
                                <p class="text-4xl font-extrabold text-teal-400 mb-4" id="detail-price">Cargando...</p>
                                <span id="detail-stock" class="text-sm font-medium">Cargando...</span>

                                <button 
                                    id="detail-add-to-cart-btn" 
                                    data-id="" 
                                    class="mt-6 w-full bg-teal-500 hover:bg-teal-600 text-gray-900 font-bold py-3 px-4 rounded-full transition-all duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed text-lg shadow-lg hover:shadow-xl"
                                >
                                    Agregar al Carrito
                                </button>
                            </div>

                            <!-- Columna de Detalles/Descripción -->
                            <div>
                                <h2 class="text-3xl md:text-4xl font-extrabold text-white mb-4" id="detail-name">Cargando Nombre del Producto...</h2>
                                
                                <div id="detail-description" class="text-gray-300 space-y-4 leading-relaxed border-t border-gray-700 pt-6">
                                    <!-- Descripción dinámica, incluyendo HTML limpio -->
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `);

        // Re-asignar las referencias después de inyectar el HTML
        const detailModalEl = $('#product-detail-modal');
        const closeDetailModalBtnEl = $('#close-detail-modal');
        const detailAddToCartBtnEl = $('#detail-add-to-cart-btn');

        // Re-agregar listeners si se inyectó el HTML
        if (detailModalEl) {
             detailModalEl.addEventListener('click', (e) => {
                if (e.target === detailModalEl) {
                  closeProductDetail();
                }
             });
        }
        if (closeDetailModalBtnEl) {
            closeDetailModalBtnEl.addEventListener('click', closeProductDetail);
        }
        if (detailAddToCartBtnEl) {
            detailAddToCartBtnEl.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                const product = state.products.find(p => p.id === id);
                if (product) {
                    addToCart(product);
                }
                closeProductDetail(); // Opcional: Cerrar después de agregar
            });
        }
    }
  }

  init();
})();
