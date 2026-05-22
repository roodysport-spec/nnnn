/* dukhan_logic.js - النسخة النهائية المطورة (Dukhan Premium Experience) */
// ملاحظة: تم تغيير التسمية لتتوافق مع الهوية الجديدة (دخان)

let userCoords = null;
let allCafes = [];

// === الحصول على الموقع وتحديث المسافات ===
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
        userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        localStorage.setItem('user_lat', userCoords.lat);
        localStorage.setItem('user_lng', userCoords.lng);
        // إعادة تحميل البيانات إذا كنا في الصفحة الرئيسية
        if (window.location.pathname === '/' || window.location.pathname.includes('index.html')) {
            loadHomeData();
        }
    }, err => console.log('Location access denied'));
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(1);
}

// === الصفحة الرئيسية ===
async function loadHomeData() {
    let tries = 0; 
    while (typeof sb === 'undefined' && tries < 20) { 
        await new Promise(r => setTimeout(r, 300)); 
        tries++; 
    }
    if (typeof sb === 'undefined') return;

    try {
        const [{ data: banners, error: bErr }, { data: cafes, error: cErr }, { data: announcements, error: aErr }] = await Promise.all([
            sb.from('global_banners').select('*').eq('is_active', true),
            sb.from('cafes').select('*').eq('is_active', true).order('created_at', { ascending: false }),
            sb.from('announcements').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1)
        ]);

        if (cErr) throw new Error('فشل تحميل قائمة المقاهي: ' + cErr.message);
        if (bErr) console.warn('فشل تحميل البنرات:', bErr.message);

        // 1. الإعلان العالمي
        const annDiv = document.getElementById('globalAnnouncement');
        if (annDiv && announcements && announcements.length > 0) {
            annDiv.style.display = 'block';
            const annText = document.getElementById('announcementText');
            if (annText) annText.innerText = announcements[0].message;
        }

        // 2. البنرات التسويقية
        const bannersDiv = document.getElementById('globalBanners');
        if (bannersDiv && banners && banners.length > 0) {
            bannersDiv.style.display = 'block';
            bannersDiv.innerHTML = `
                <div class="offers-carousel" style="aspect-ratio:21/6; max-height:220px; margin-bottom:0;">
                    <div class="carousel-track" id="homeBannersTrack" style="display:flex; transition: transform 0.5s ease;">
                        ${banners.map(b => `
                            <div class="carousel-slide" style="min-width:100%; height:100%; position:relative;">
                                <img src="${b.image_url}" style="width:100%; height:100%; object-fit:cover;">
                                ${b.title ? `<div class="carousel-overlay"><div class="carousel-title">${b.title}</div></div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            if (banners.length > 1) {
                let idx = 0;
                setInterval(() => {
                    idx = (idx + 1) % banners.length;
                    const track = document.getElementById('homeBannersTrack');
                    if (track) track.style.transform = `translateX(${idx * 100}%)`;
                }, 5000);
            }
        }

        allCafes = cafes || [];
        renderCafes(allCafes);
    } catch (e) { 
        console.error('Home Data Error:', e);
        showToast('حدث خطأ أثناء تحميل البيانات، يرجى التحقق من الاتصال', 'error');
        const grid = document.getElementById('cafesGrid');
        if (grid) grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>عذراً، فشل الاتصال بالخادم</h3><button class="btn btn-accent" onclick="loadHomeData()" style="margin-top:15px;">إعادة المحاولة</button></div>`;
    }
}

function renderCafes(list) {
    const grid = document.getElementById('cafesGrid');
    if (!grid) return;

    const counter = document.getElementById('cafesCount');
    if (counter) counter.textContent = list.length ? `${list.length} مقهى` : '';

    if (list.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>لا توجد مقاهي متاحة حالياً</h3></div>`;
        return;
    }

    // ترتيب حسب المسافة إذا توفر الموقع
    let sorted = [...list];
    if (userCoords) {
        sorted.forEach(c => {
            c.distance = calculateDistance(userCoords.lat, userCoords.lng, c.lat, c.lng) || 9999;
        });
        sorted.sort((a, b) => a.distance - b.distance);
    }

    grid.innerHTML = sorted.map(c => `
      <a href="cafe.html?id=${c.id}" class="cafe-card" onclick="event.preventDefault(); window.location.href='/cafe/${c.id}'">
        ${c.cover_url 
          ? `<img src="${c.cover_url}" class="cafe-cover" alt="${c.name}">`
          : `<div class="cafe-cover">🗺️</div>`
        }
        <div class="cafe-card-body">
          <div class="cafe-logo-sm">
            ${c.logo_url 
              ? `<img src="${c.logo_url}" alt="${c.name}" style="width:100%;height:100%;object-fit:cover; border-radius:14px;">`
              : `<span>☕</span>`
            }
          </div>
          <div class="cafe-info">
            <div class="cafe-name">${c.name}</div>
            ${c.distance && c.distance != 9999
              ? `<div style="font-size:0.85rem; color:var(--accent); font-weight:bold; margin-bottom:4px;">📍 يبعد عنك ${c.distance} كم</div>` 
              : ''}
            <div class="cafe-desc">${c.description || 'منيو متنوع وعروض حصرية'}</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" style="transform:scaleX(-1); opacity:0.8;"><path d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
        </div>
      </a>
    `).join('');
}

function filterCafes(query) {
    const noResults = document.getElementById('noResults');
    if (!query || !query.trim()) {
        renderCafes(allCafes);
        if (noResults) noResults.style.display = 'none';
        return;
    }
    const q = query.trim().toLowerCase();
    const filtered = allCafes.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q)
    );
    renderCafes(filtered);
    if (noResults) noResults.style.display = filtered.length === 0 ? 'block' : 'none';
}

// === صفحة المقهى (للاستخدام من Blazor) ===
async function loadCafePage(id) {
    let tries = 0; 
    while (typeof sb === 'undefined' && tries < 20) { 
        await new Promise(r => setTimeout(r, 300)); 
        tries++; 
    }
    if (typeof sb === 'undefined') return;

    try {
        const { data: cafe, error: cafeErr } = await sb.from('cafes').select('*').eq('id', id).single();
        if (cafeErr) throw new Error('فشل تحميل معلومات المقهى: ' + cafeErr.message);
        
        if (cafe) {
            const h = document.getElementById('cafeHero');
            if (h && cafe.cover_url) {
                h.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.7)), url('${cafe.cover_url}')`;
                h.style.backgroundSize = 'cover';
                h.style.backgroundPosition = 'center';
            }
            const nameEl = document.getElementById('cafeName');
            if (nameEl) nameEl.innerText = cafe.name;
            
            const phoneEl = document.getElementById('cafePhone');
            if (phoneEl) {
                const metaHTML = `
                    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin-top:10px;">
                        <span style="background:rgba(201,168,76,0.15); color:var(--accent); padding:4px 12px; border-radius:12px; font-size:0.85rem; font-weight:700;">📞 ${cafe.phone || 'غير مسجل'}</span>
                        <span style="background:rgba(201,168,76,0.15); color:var(--accent); padding:4px 12px; border-radius:12px; font-size:0.85rem; font-weight:700;">📍 ${cafe.address || 'العراق'}</span>
                        ${cafe.working_hours ? `<span style="background:rgba(201,168,76,0.15); color:var(--accent); padding:4px 12px; border-radius:12px; font-size:0.85rem; font-weight:700;">⏰ ${cafe.working_hours}</span>` : ''}
                    </div>`;
                phoneEl.innerHTML = metaHTML;
            }

            const bookBtn = document.getElementById('bookBtn');
            if (bookBtn) bookBtn.style.display = 'inline-flex';
            window.__currentCafeId = id;
        }

        const [{ data: cats, error: catErr }, { data: products, error: prodErr }, { data: offers, error: offErr }] = await Promise.all([
            sb.from('categories').select('*').eq('cafe_id', id).order('order_index'),
            sb.from('products').select('*').eq('cafe_id', id).eq('is_available', true),
            sb.from('offers').select('*').eq('cafe_id', id).eq('is_active', true)
        ]);

        if (catErr || prodErr) throw new Error('فشل تحميل المنتجات أو الأقسام');

        window.__allProducts = products || [];

        // رندر العروض
        const offSection = document.getElementById('offersSection');
        if (offSection && offers && offers.length > 0) {
            offSection.style.display = 'block';
            offSection.innerHTML = `
                <div class="offers-carousel" style="margin: 0 15px; border-radius:18px; height:160px;">
                    <div id="offersTrack" class="carousel-track" style="display:flex; transition: transform 0.5s ease;">
                        ${offers.map(o => `
                            <div class="carousel-slide" style="min-width:100%; height:160px; position:relative;">
                                <img src="${o.image_url}" style="width:100%; height:100%; object-fit:cover;">
                                <div class="carousel-overlay" style="padding:15px; background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);"><div class="carousel-title" style="font-size:1.1rem; color:#FFF;">🔥 ${o.title}</div></div>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            if (offers.length > 1) {
                let oIdx = 0;
                setInterval(() => {
                    oIdx = (oIdx + 1) % offers.length;
                    const track = document.getElementById('offersTrack');
                    if (track) track.style.transform = `translateX(${oIdx * 100}%)`;
                }, 5000);
            }
        }

        // رندر التبويبات
        const tabs = document.getElementById('catTabs');
        if (tabs) {
            const allBtn = `
                <div onclick="window.__filterCat(null, this)" class="cat-tab active" style="background:var(--accent); color:#000;">
                    <span class="cat-icon">🌟</span>
                    <span>الكل</span>
                </div>`;
            const catBtns = (cats || []).map(c => `
                <div onclick="window.__filterCat('${c.id}', this)" class="cat-tab" style="background:#1A1A1A; color:var(--accent); border:1px solid rgba(201,168,76,0.2);">
                    <span class="cat-icon">${c.icon || '☕'}</span>
                    <span>${c.name}</span>
                </div>
            `).join('');
            tabs.innerHTML = allBtn + catBtns;
        }

        window.__filterCat = function(catId, btn) {
            document.querySelectorAll('#catTabs .cat-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderProducts(catId ? window.__allProducts.filter(p => p.category_id === catId) : window.__allProducts);
        };

        renderProducts(products || []);
    } catch (e) { 
        console.error('Cafe Page Error:', e);
        showToast('فشل تحميل بيانات المقهى، يرجى المحاولة لاحقاً', 'error');
        const grid = document.getElementById('productsGrid');
        if (grid) grid.innerHTML = '<div style="text-align:center; padding:50px; color:#999;"><h3>حدث خطأ غير متوقع</h3><p>يرجى العودة للصفحة الرئيسية والمحاولة مرة أخرى</p></div>';
    }
}

function renderProducts(list) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    if (!list || list.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:#999;padding:30px;">لا توجد منتجات في هذه الفئة</p>';
        return;
    }
    grid.innerHTML = `
        <div class="products-grid">
            ${list.map(p => `
                <div class="product-card ${p.display_size === 'large' ? 'large' : ''}" onclick="window.showProductOptions ? window.showProductOptions(${JSON.stringify(p).replace(/"/g, '&quot;')}) : null">
                    ${p.image_url 
                        ? `<img src="${p.image_url}" class="product-img" alt="${p.name}">`
                        : `<div class="product-img">☕</div>`
                    }
                    <div class="product-info">
                        <div class="product-name">${p.name}</div>
                        <div class="product-price">${Number(p.price).toLocaleString('ar-IQ')} د.ع</div>
                    </div>
                </div>
            `).join('')}
        </div>`;
}

// === تحسينات تجربة المستخدم ===
function hideSplash() {
    setTimeout(() => {
        const s = document.getElementById('splashScreen');
        if (s) { s.classList.add('hidden'); setTimeout(() => s.style.display = 'none', 800); }
    }, 3000);
}

function showToast(msg, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
    container.prepend(el);
    setTimeout(() => el.remove(), 3500);
}

// === Booking Global Logic ===
window.openBookingModal = () => { document.getElementById('bookingModal').style.display='flex'; };
window.closeBookingModal = () => { document.getElementById('bookingModal').style.display='none'; };

window.submitBookingFromUI = async () => {
    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    const cafeId = window.__currentCafeId;

    if (!name || !phone) { showToast('يرجى ملء كافة الحقول', 'error'); return; }

    const btn = document.getElementById('confirmBookingBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الإرسال...'; }

    try {
        const { error } = await sb.from('bookings').insert([{
            cafe_id: cafeId,
            customer_name: name,
            customer_phone: phone,
            status: 'pending'
        }]);
        if (error) throw error;

        showToast('تم إرسال طلب الحجز بنجاح! انتظر إشعار التأكيد.', 'success');
        window.closeBookingModal();
    } catch (err) {
        showToast('تعذر إرسال الطلب: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'إرسال طلب الحجز'; }
    }
};
