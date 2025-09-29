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
  }

  function removeFromCart(productId) {
    const index = state.cart.findIndex(item => item.id === productId);
    if (index > -1) {
      state.cart.splice(index, 1);
      saveCart();
    }
  }

  function changeCartQuantity(productId, delta) {
    const item = state.cart.find(i => i.id === productId);
    if (item) {
      item.qty += delta;
      if (item.qty <= 0) {
        removeFromCart(productId);
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

  function showProductDetail(product) {
    state.currentProduct = product;
    detailName.textContent = product.name;
    detailPrice.textContent = formatCurrency(product.price);
    const imageUrl = getSafeImageUrl(product.image_url || product.imageUrl, 'https://placehold.co/800x600/1f2937/d1d5db?text=Sin+Imagen');
    detailImage.src = imageUrl;
    detailImage.alt = product.name;
    detailStock.textContent = product.stock > 0 ? `Stock: ${product.stock}` : 'Agotado';
    detailStock.className = `text-sm font-medium ${product.stock > 0 ? 'text-green-500' : 'text-red-500'}`;

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
        const frag = sanitizeHTMLToFragment(possibleSpecs) || document.createTextNode(possibleSpecs);
        detailDescription.appendChild(specsTitle);
        detailDescription.appendChild(frag);
        specsRendered = true;
      } else if (Array.isArray(possibleSpecs)) {
        const ul = document.createElement('ul');
        ul.className = 'list-disc pl-6 space-y-1 text-gray-300';
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
          li.innerHTML = label ? `<span class="text-gray-400">${label}:</span> ${decodeEntities(String(value || ''))}` : decodeEntities(String(value || label || ''));
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
          const dl = document.createElement('dl');
          dl.className = 'grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2';
          entries.forEach(([k, v]) => {
            const dt = document.createElement('dt');
            dt.className = 'text-gray-400';
            dt.textContent = k;
            const dd = document.createElement('dd');
            dd.className = 'text-gray-300';
            dd.textContent = typeof v === 'string' ? v : JSON.stringify(v);
            dl.appendChild(dt);
            dl.appendChild(dd);
          });
          detailDescription.appendChild(specsTitle);
          detailDescription.appendChild(dl);
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
    detailAddToCartBtn.disabled = product.stock <= 0;
    detailAddToCartBtn.textContent = product.stock <= 0 ? 'Agotado' : 'Agregar al Carrito';

    // Mostrar modal y activar animaciones/data-attrs para que sea visible
    detailModal.classList.remove('hidden');
    detailModal.setAttribute('data-visible', 'true');
    const panel = detailModal.firstElementChild;
    if (panel) panel.setAttribute('data-visible', 'true');
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
    cartModal.classList.remove('hidden');
  });

  closeCartModalBtn?.addEventListener('click', () => {
    cartModal.classList.add('hidden');
  });

  cartModal?.addEventListener('click', (e) => {
    if (e.target === cartModal) {
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
          toast.className = 'fixed bottom-5 left-1/2 transform -translate-x-1/2 bg-teal-600 text-gray-900 px-6 py-3 rounded-full shadow-xl opacity-0 transition-opacity duration-300 z-[200] font-semibold';
          document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.style.opacity = '1';
      
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => {
          toast.style.opacity = '0';
      }, 3000);
  }

  // --- Product Rendering ---
  /**
   * Genera el HTML para una tarjeta de producto con diseño moderno.
   * @param {object} product - Objeto producto con id, name, price, stock, description, category, imageUrl.
   * @returns {string} HTML de la tarjeta.
   */
  function renderProductCard(product) {
    const imageUrl = getSafeImageUrl(product.image_url || product.imageUrl, 'https://placehold.co/400x300/1f2937/d1d5db?text=Sin+Imagen');

    // Obtenemos un fragmento de la descripción para mostrar en la tarjeta
    const shortDescription = product.description 
        ? product.description.substring(0, 80) + '...' 
        : 'Sin descripción.';

    return `
      <div class="product-card bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col hover:border-teal-500 transition-all duration-300">
        <div class="h-48 overflow-hidden">
            <img 
                src="${imageUrl}" 
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
              ${product.stock <= 0 ? 'disabled' : ''}
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
        class="category-card bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col transition-all duration-500 cursor-pointer hover:border-teal-500 hover:scale-[1.02] active:scale-[0.98]"
        data-slug="${categorySlug}"
      >
        <div class="h-40 overflow-hidden relative">
            <img 
                src="${imageUrl}" 
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
  
  checkoutBtn?.addEventListener('click', checkout);

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
