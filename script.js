import { db } from './firebase.js';
import { collection, addDoc, onSnapshot, updateDoc, deleteDoc, doc, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

// ──────────────────────────────
//  STATE
// ──────────────────────────────
let products = [];
let categories = [];
let sortKey = null, sortDir = 1;

function uid() { return Math.random().toString(36).slice(2,10); }

// convert raw key (with underscores) into human-friendly label
function prettifyCategory(str) {
  if (!str) return '';
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function save() {
  // keep a local cache in case the user opens the page offline
  localStorage.setItem('sm_products', JSON.stringify(products));
  localStorage.setItem('sm_categories', JSON.stringify(categories));
}

// keep a live connection to Firestore
function initFirestore() {
  const catCol = collection(db, 'categories');
  onSnapshot(catCol, snap => {
    categories = snap.docs.map(d => d.data().name);
    categories.sort((a,b) => a.localeCompare(b));
    save();
    render();
  });

  const prodCol = collection(db, 'products');
  onSnapshot(prodCol, snap => {
    products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    save();
    render();
  });
}

// ──────────────────────────────
//  RENDER
// ──────────────────────────────
function render() {
  renderCategories();
  renderTable();
  renderStats();
  document.getElementById('total-count').textContent = products.length;
}

function renderCategories() {
  const selectors = ['filter-cat','add-cat','edit-cat'];
  // ensure alphabetical order when rendering
  const sorted = [...categories].sort((a,b) => a.localeCompare(b));
  selectors.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value;
    if (id === 'filter-cat') {
      el.innerHTML = '<option value="">Todas las categorías</option>';
    } else {
      el.innerHTML = '';
    }
    sorted.forEach(c => {
      const o = document.createElement('option');
      o.value = c;
      o.textContent = prettifyCategory(c);
      el.appendChild(o);
    });
    if (val) el.value = val;
  });

  // render categories as a vertical list with edit/delete controls
  const list = document.getElementById('cat-list');
  list.innerHTML = '';
  sorted.forEach(c => {
    const div = document.createElement('div');
    div.className = 'cat-item';
    div.innerHTML = `
      <span class="cat-name">${prettifyCategory(c)}</span>
      <div class="cat-actions">
        <button class="btn btn-edit" onclick="openEditCategory('${c}')">✏️ Editar</button>
        <button class="btn btn-delete" onclick="openDeleteCategory('${c}')">🗑️ Eliminar</button>
      </div>
    `;
    list.appendChild(div);
  });
}

function getFiltered() {
  const cat = document.getElementById('filter-cat').value;
  const search = document.getElementById('filter-search').value.toLowerCase();
  const stockF = document.getElementById('filter-stock').value;

  let list = products.filter(p => {
    if (cat && p.category !== cat) return false;
    if (search && !p.name.toLowerCase().includes(search)) return false;
    if (stockF === 'low' && p.stock >= 10) return false;
    if (stockF === 'mid' && (p.stock < 10 || p.stock > 50)) return false;
    if (stockF === 'high' && p.stock <= 50) return false;
    return true;
  });

  if (sortKey) {
    list = list.sort((a,b) => {
      if (sortKey === 'name') return sortDir * a.name.localeCompare(b.name);
      if (sortKey === 'stock') return sortDir * (a.stock - b.stock);
      return 0;
    });
  }
  return list;
}

function stockClass(s) {
  if (s < 10) return 'stock-low';
  if (s <= 50) return 'stock-mid';
  return 'stock-high';
}

function stockBarColor(s) {
  if (s < 10) return '#dc2626';
  if (s <= 50) return '#d97706';
  return '#059669';
}

function renderTable() {
  const list = getFiltered();
  const tbody = document.getElementById('product-tbody');
  const empty = document.getElementById('empty-state');

  if (list.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = list.map((p, i) => {
    const sc = stockClass(p.stock);
    const maxStock = Math.max(...products.map(x=>x.stock), 1);
    const pct = Math.round((p.stock / maxStock) * 100);
    const emoji = '<span>📦</span>';
    const thumbContent = p.img
      ? `<img src="${p.img}" alt="${p.name}" onerror="this.onerror=null;this.style.display='none';this.parentNode.innerHTML='${emoji}'">`
      : emoji;
    return `
    <tr style="animation-delay:${i*40}ms">
      <td>
        <div class="product-name">${p.name}</div>
        <div class="product-cat">${prettifyCategory(p.category)}</div>
      </td>
      <td>
        <div class="img-preview-wrap" data-img="${p.img || ''}" data-name="${p.name}">
          <div class="product-img">${thumbContent}</div>
        </div>
      </td>
      <td>
        <span class="stock-badge ${sc}">${p.stock}</span>
        <div class="stock-bar-wrap">
          <div class="stock-bar" style="width:${pct}%;background:${stockBarColor(p.stock)};"></div>
        </div>
      </td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-edit" onclick="openEdit('${p.id}')">✏️ Editar</button>
          <button class="btn btn-delete" onclick="openDelete('${p.id}')">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderStats() {
  const total = products.reduce((a,b) => a + b.stock, 0);
  const lowProducts = products.filter(p => p.stock < 10);
  const catCount = categories.length;
  document.getElementById('stats-content').innerHTML = `
    <div class="stats-row" style="flex-direction:column;gap:.6rem;">
      <div class="stat-pill stat-clickable" onclick="statAction('total')">
        <span class="dot" style="background:#2754e6"></span>
        <span style="color:var(--muted)">Total unidades</span>
        <strong style="margin-left:auto">${total}</strong>
        <span class="stat-arrow">›</span>
      </div>
      <div class="stat-pill stat-clickable ${lowProducts.length > 0 ? 'stat-alert' : ''}" onclick="statAction('low')">
        <span class="dot" style="background:#c8172f"></span>
        <span style="color:var(--muted)">Stock bajo</span>
        <strong style="margin-left:auto;color:#c8172f">${lowProducts.length}</strong>
        <span class="stat-arrow">›</span>
      </div>
      <div class="stat-pill stat-clickable" onclick="statAction('cats')">
        <span class="dot" style="background:#7c3aed"></span>
        <span style="color:var(--muted)">Categorías</span>
        <strong style="margin-left:auto">${catCount}</strong>
        <span class="stat-arrow">›</span>
      </div>
      <div class="stat-pill stat-clickable" onclick="statAction('all')">
        <span class="dot" style="background:#0f7a5a"></span>
        <span style="color:var(--muted)">Productos</span>
        <strong style="margin-left:auto">${products.length}</strong>
        <span class="stat-arrow">›</span>
      </div>
    </div>
    <div id="low-stock-panel" style="display:none;margin-top:1rem;"></div>`;
}

function statAction(type) {
  if (type === 'low') {
    const panel = document.getElementById('low-stock-panel');
    if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
    const lowProducts = products.filter(p => p.stock < 10);
    if (lowProducts.length === 0) { toast('¡No hay productos con stock bajo! 🎉', 'success'); return; }
    panel.style.display = 'block';
    panel.innerHTML = `
      <div style="font-family:'Syne',sans-serif;font-size:.72rem;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:.6rem;">
        ⚠️ Productos con stock bajo
      </div>
      ${lowProducts.map(p => {
        const imgContent = p.img
          ? `<img src="${p.img}" style="width:32px;height:32px;border-radius:6px;object-fit:cover;border:1px solid var(--border);" onerror="this.style.display='none'">`
          : `<div style="width:32px;height:32px;border-radius:6px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:.9rem;">📦</div>`;
        return `<div class="low-stock-row" onclick="openEdit('${p.id}')">${imgContent}
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
            <div style="font-size:.72rem;color:var(--muted);font-family:'Syne',sans-serif;">${prettifyCategory(p.category)}</div>
          </div>
          <span style="background:#ffe4e6;color:#9f1239;border:1px solid #fca5a5;border-radius:999px;padding:.2rem .6rem;font-size:.8rem;font-weight:700;font-family:'Syne',sans-serif;white-space:nowrap;">${p.stock} uds</span>
        </div>`;
      }).join('')}`;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  if (type === 'total') {
    // Show breakdown by category in a modal
    const breakdown = categories.map(c => {
      const units = products.filter(p => p.category === c).reduce((a,b) => a + b.stock, 0);
      return { cat: c, units };
    }).filter(x => x.units > 0).sort((a,b) => b.units - a.units);
    const total = products.reduce((a,b) => a + b.stock, 0);
    const maxU = breakdown[0]?.units || 1;
    openInfoModal('📦 Total de unidades', `
      <p style="color:var(--muted);font-size:.88rem;margin-bottom:1.2rem;">Distribución del stock por categoría</p>
      ${breakdown.length === 0 ? '<p style="color:var(--muted);text-align:center;">Sin datos</p>' :
        breakdown.map(b => {
          const pct = Math.round((b.units / maxU) * 100);
          return `<div style="margin-bottom:.85rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem;">
              <span style="font-family:'Syne',sans-serif;font-size:.85rem;font-weight:600;text-transform:capitalize;">${b.cat}</span>
              <strong style="font-size:.9rem;">${b.units} <span style="color:var(--muted);font-weight:400;font-size:.78rem;">uds</span></strong>
            </div>
            <div style="background:var(--surface2);border-radius:999px;height:8px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;border-radius:999px;background:linear-gradient(90deg,#2754e6,#6d9fff);transition:width .4s;"></div>
            </div>
          </div>`;
        }).join('')
      }
      <div style="border-top:1px solid var(--border);margin-top:.5rem;padding-top:.75rem;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-family:'Syne',sans-serif;font-size:.82rem;color:var(--muted);">TOTAL GLOBAL</span>
        <strong style="font-size:1.1rem;color:var(--accent);">${total} uds</strong>
      </div>
    `);
    return;
  }

  if (type === 'cats') {
    // Show categories with product count and total stock per cat
    const data = categories.map(c => {
      const prods = products.filter(p => p.category === c);
      return { cat: c, count: prods.length, units: prods.reduce((a,b)=>a+b.stock,0) };
    }).sort((a,b) => b.count - a.count);
    openInfoModal('🏷️ Categorías', `
      <p style="color:var(--muted);font-size:.88rem;margin-bottom:1.2rem;">${categories.length} categorías · haz clic para filtrar por categoría</p>
      <div style="display:flex;flex-direction:column;gap:.5rem;">
        ${data.map(d => `
          <div onclick="filterByCategory('${d.cat}')" style="display:flex;align-items:center;gap:.75rem;padding:.65rem .85rem;background:var(--surface2);border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:background .15s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='var(--surface2)'">
            <div style="width:36px;height:36px;border-radius:8px;background:#ede9fe;display:flex;align-items:center;justify-content:center;font-size:1rem;">🏷️</div>
            <div style="flex:1;">
              <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:.88rem;text-transform:capitalize;">${d.cat}</div>
              <div style="font-size:.75rem;color:var(--muted);">${d.count} producto${d.count!==1?'s':''}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:700;font-size:.88rem;">${d.units}</div>
              <div style="font-size:.72rem;color:var(--muted);">uds</div>
            </div>
          </div>`).join('')}
      </div>
    `);
    return;
  }

  if (type === 'all') {
    // Top 5 products by stock
    const sorted = [...products].sort((a,b) => b.stock - a.stock);
    const top = sorted.slice(0, 5);
    const total = products.length;
    openInfoModal('📊 Resumen de productos', `
      <p style="color:var(--muted);font-size:.88rem;margin-bottom:1.2rem;">${total} productos en inventario · top por stock</p>
      <div style="display:flex;flex-direction:column;gap:.5rem;">
        ${top.map((p, i) => {
          const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
          const sc = p.stock < 10 ? '#9f1239' : p.stock <= 50 ? '#78350f' : '#065f46';
          const imgContent = p.img
            ? `<img src="${p.img}" style="width:36px;height:36px;border-radius:8px;object-fit:cover;border:1px solid var(--border);">`
            : `<div style="width:36px;height:36px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;">📦</div>`;
          return `<div onclick="openEdit('${p.id}')" style="display:flex;align-items:center;gap:.75rem;padding:.6rem .85rem;background:var(--surface2);border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:background .15s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='var(--surface2)'">
            <span style="font-size:1.1rem;width:20px;text-align:center;">${medals[i]}</span>
            ${imgContent}
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
              <div style="font-size:.73rem;color:var(--muted);font-family:'Syne',sans-serif;">${prettifyCategory(p.category)}</div>
            </div>
            <strong style="color:${sc};font-family:'Syne',sans-serif;">${p.stock}</strong>
          </div>`;
        }).join('')}
      </div>
    `);
    return;
  }
}

function openInfoModal(title, bodyHtml) {
  document.getElementById('info-modal-title').textContent = title;
  document.getElementById('info-modal-body').innerHTML = bodyHtml;
  document.getElementById('info-modal').classList.add('open');
}

function filterByCategory(cat) {
  closeModal();
  document.getElementById('filter-cat').value = cat;
  document.getElementById('filter-stock').value = '';
  document.getElementById('filter-search').value = '';
  renderTable();
  document.querySelector('.table-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  toast(`Filtrando por "${cat}"`, 'info');
}

// ──────────────────────────────
//  ACTIONS
// ──────────────────────────────
async function addProduct() {
  const cat   = document.getElementById('add-cat').value;
  const name  = document.getElementById('add-name').value.trim();
  const img   = document.getElementById('add-img').value.trim();
  const stock = parseInt(document.getElementById('add-stock').value) || 0;

  if (!name) { toast('Escribe un nombre de producto', 'error'); return; }
  if (!cat)  { toast('Selecciona una categoría', 'error'); return; }

  try {
    await addDoc(collection(db, 'products'), { name, category: cat, img, stock });
    document.getElementById('add-name').value = '';
    document.getElementById('add-img').value = '';
    document.getElementById('add-stock').value = '0';
    toast(`"${name}" añadido al inventario ✓`, 'success');
  } catch (e) {
    console.error('Firestore add error', e);
    toast('Error al agregar producto', 'error');
  }
}

async function addCategory() {
  const input = document.getElementById('new-cat-name');
  const name = input.value.trim().toLowerCase();
  if (!name) { toast('Escribe un nombre de categoría', 'error'); return; }
  if (categories.includes(name)) { toast('Esa categoría ya existe', 'error'); return; }
  try {
    await addDoc(collection(db, 'categories'), { name });
    input.value = '';
    toast(`Categoría "${name}" creada`, 'info');
  } catch (e) {
    console.error('Firestore add category error', e);
    toast('Error al crear categoría', 'error');
  }
}

async function deleteCategory(name) {
  const inUse = products.some(p => p.category === name);
// category names are raw here, prettify only affects display
  if (inUse) { toast(`No puedes borrar "${name}": tiene productos asignados`, 'error'); return; }
  try {
    const q = query(collection(db, 'categories'), where('name', '==', name));
    const snap = await getDocs(q);
    snap.forEach(d => {
      deleteDoc(doc(db, 'categories', d.id));
    });
    toast(`Categoría "${name}" eliminada`, 'info');
  } catch (e) {
    console.error('Firestore delete category error', e);
    toast('Error al eliminar categoría', 'error');
  }
}

// open delete confirmation modal for a category
function openDeleteCategory(name) {
  document.getElementById('delete-cat-old').value = name;
  document.getElementById('delete-cat-name').textContent = prettifyCategory(name);
  document.getElementById('delete-cat-modal').classList.add('open');
}

// handle confirmation click
async function confirmDeleteCategory() {
  const name = document.getElementById('delete-cat-old').value;
  closeModal();
  await deleteCategory(name);
}

// display modal for editing a category
function openEditCategory(oldName) {
  document.getElementById('edit-cat-old').value = oldName;
  const nameInput = document.getElementById('edit-cat-name');
  nameInput.value = prettifyCategory(oldName);
  document.getElementById('edit-category-modal').classList.add('open');
  setTimeout(() => {
    nameInput.focus();
    nameInput.select();
  }, 0);
}

// helper kept for backward compatibility; opens the modal
function renameCategory(oldName) {
  openEditCategory(oldName);
}

// save changes made in category edit modal
async function saveCategoryEdit() {
  const oldName = document.getElementById('edit-cat-old').value;
  const pretty = document.getElementById('edit-cat-name').value.trim();
  const newName = pretty.toLowerCase();
  if (!newName) { toast('El nombre no puede quedarse vacío', 'error'); return; }
  if (newName === oldName) { closeModal(); return; }
  if (categories.includes(newName)) { toast('Esa categoría ya existe', 'error'); return; }
  try {
    // update category document
    const q = query(collection(db, 'categories'), where('name', '==', oldName));
    const snap = await getDocs(q);
    let docId = null;
    snap.forEach(d => { docId = d.id; });
    if (docId) {
      await updateDoc(doc(db, 'categories', docId), { name: newName });
    }
    // update products
    const prodQ = query(collection(db, 'products'), where('category', '==', oldName));
    const prodSnap = await getDocs(prodQ);
    const updates = [];
    prodSnap.forEach(d => {
      updates.push(updateDoc(doc(db, 'products', d.id), { category: newName }));
    });
    if (updates.length) await Promise.all(updates);
    toast(`Categoría renombrada a "${newName}"`, 'info');
  } catch (e) {
    console.error('Firestore rename category error', e);
    toast('Error al renombrar categoría', 'error');
  }
  closeModal();
}

function openEdit(id) {
  const p = products.find(x=>x.id===id);
  if (!p) return;
  document.getElementById('edit-id').value = id;
  document.getElementById('edit-name').value = p.name;
  document.getElementById('edit-img').value = p.img;
  document.getElementById('edit-stock').value = p.stock;
  renderCategories();
  document.getElementById('edit-cat').value = p.category;
// inputs keep raw values for correct saving
  document.getElementById('edit-modal').classList.add('open');
}

async function saveEdit() {
  const id    = document.getElementById('edit-id').value;
  const name  = document.getElementById('edit-name').value.trim();
  const img   = document.getElementById('edit-img').value.trim();
  const stock = parseInt(document.getElementById('edit-stock').value) || 0;
  const cat   = document.getElementById('edit-cat').value;
  if (!name) { toast('El nombre no puede estar vacío', 'error'); return; }
  try {
    const docRef = doc(db, 'products', id);
    await updateDoc(docRef, { name, img, stock, category: cat });
    closeModal();
    toast(`"${name}" actualizado ✓`, 'success');
  } catch (e) {
    console.error('Firestore update error', e);
    toast('Error al actualizar producto', 'error');
  }
}

function openDelete(id) {
  const p = products.find(x=>x.id===id);
  if (!p) return;
  document.getElementById('delete-id').value = id;
  document.getElementById('delete-name').textContent = p.name;
  document.getElementById('delete-modal').classList.add('open');
}

async function confirmDelete() {
  const id = document.getElementById('delete-id').value;
  const p = products.find(x=>x.id===id);
  try {
    await deleteDoc(doc(db, 'products', id));
    closeModal();
    toast(`"${p?.name}" eliminado`, 'info');
  } catch (e) {
    console.error('Firestore delete error', e);
    toast('Error al eliminar producto', 'error');
  }
}

function closeModal() {
  document.querySelectorAll('.modal-overlay').forEach(m=>m.classList.remove('open'));
}

function toggleSort(key) {
  if (sortKey === key) sortDir *= -1;
  else { sortKey = key; sortDir = 1; }
  document.querySelectorAll('.sort-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('sort-' + key)?.classList.add('active');
  renderTable();
}

function printLowStock() {
  // use jsPDF to build file directly
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const low = products.filter(p => p.stock <= 10)
    .sort((a,b)=> a.category.localeCompare(b.category) || a.stock - b.stock || a.name.localeCompare(b.name));

  if (low.length === 0) {
    toast('No hay productos con stock bajo', 'info');
    doc.setFontSize(22);
    doc.setTextColor('#000');
    doc.text('La Tienda del Humor', 105, 30, { align: 'center' });
    doc.setFontSize(16);
    doc.setTextColor('#333');
    doc.text('No hay productos con stock bajo', 105, 50, { align: 'center' });
    doc.save('stock_bajo.pdf');
    return;
  }

  // group products by category
  const groups = {};
  low.forEach(p => {
    groups[p.category] = groups[p.category] || [];
    groups[p.category].push(p);
  });

  doc.setFontSize(22);
  doc.setTextColor('#000');
  doc.text('La Tienda del Humor', 105, 20, { align: 'center' });
  doc.setFontSize(16);
  doc.setTextColor('#333');
  doc.text('Productos con stock bajo', 105, 30, { align: 'center' });

  let y = 40;
  Object.keys(groups).forEach(cat => {
    const rows = groups[cat]
      .sort((a,b)=> a.stock - b.stock || a.name.localeCompare(b.name))
      .map(p => [p.name, prettifyCategory(p.category), String(p.stock)]);

    // table for this category (no title)
    doc.autoTable({
      startY: y,
      head: [['Producto', 'Categoría', 'Stock']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [200,200,200] },
      alternateRowStyles: { fillColor: [240,240,240] },
      styles: { fontSize: 10, textColor: 20 },
      margin: { left: 14, right: 14 }
    });

    y = doc.lastAutoTable.finalY + 10;
  });

  doc.save('stock_bajo.pdf');
}


// ──────────────────────────────
//  TOAST
// ──────────────────────────────
function toast(msg, type='info') {
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  const container = document.getElementById('toast-container');
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ──────────────────────────────
//  EVENTS
// ──────────────────────────────
document.getElementById('filter-cat').addEventListener('change', renderTable);
document.getElementById('filter-search').addEventListener('input', renderTable);
document.getElementById('filter-stock').addEventListener('change', renderTable);

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) closeModal(); });
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ──────────────────────────────
//  GLOBAL IMAGE TOOLTIP
// ──────────────────────────────
const gTooltip = document.getElementById('global-img-tooltip');
const gInner = gTooltip.querySelector('.img-tooltip-inner');
const OFFSET = 16;

document.addEventListener('mouseover', e => {
  const wrap = e.target.closest('.img-preview-wrap');
  if (!wrap) return;
  const imgSrc = wrap.dataset.img;
  const name = wrap.dataset.name || '';
  const emoji = '<span>📦</span>';
  gInner.innerHTML = imgSrc
    ? `<img src="${imgSrc}" alt="${name}" onerror="this.style.display='none';this.parentNode.innerHTML='${emoji}'">`
    : `<div class="no-img-preview">${emoji}<span>Sin imagen</span></div>`;
  gTooltip.classList.add('visible');
});

document.addEventListener('mouseout', e => {
  const wrap = e.target.closest('.img-preview-wrap');
  if (!wrap) return;
  gTooltip.classList.remove('visible');
});

document.addEventListener('mousemove', e => {
  if (!gTooltip.classList.contains('visible')) return;
  const tw = 172, th = 172;
  let x = e.clientX + OFFSET;
  let y = e.clientY - th / 2;
  if (x + tw > window.innerWidth - 8) x = e.clientX - tw - OFFSET;
  if (y < 8) y = 8;
  if (y + th > window.innerHeight - 8) y = window.innerHeight - th - 8;
  gTooltip.style.left = x + 'px';
  gTooltip.style.top  = y + 'px';
});

// ──────────────────────────────
//  INIT
// ──────────────────────────────
initFirestore();
render();

// ──────────────────────────────
//  EXPORT GLOBALS (for inline onclicks in HTML)
// ──────────────────────────────
window.addProduct = addProduct;
window.addCategory = addCategory;
window.toggleSort = toggleSort;
window.openEdit = openEdit;
window.openDelete = openDelete;
window.closeModal = closeModal;
window.saveEdit = saveEdit;
window.confirmDelete = confirmDelete;
window.deleteCategory = deleteCategory;
window.openDeleteCategory = openDeleteCategory;
window.confirmDeleteCategory = confirmDeleteCategory;
window.renameCategory = renameCategory;
window.openEditCategory = openEditCategory;
window.saveCategoryEdit = saveCategoryEdit;
window.statAction = statAction;
window.filterByCategory = filterByCategory;
window.printLowStock = printLowStock;