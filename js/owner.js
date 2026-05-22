/**
 * js/owner.js - منطق بوابة المالك
 */

// State
let user = null;
let myCafe = null;
let categories = [];
let products = [];
let offers = [];
let isInitializing = false;

// ==========================================
// Auth & Init
// ==========================================
sb.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
        user = session.user;
        
        isInitializing = true;
        const loginScreen = document.getElementById('loginScreen');
        const globalLoader = document.getElementById('globalLoader');
        const dashboardScreen = document.getElementById('dashboardScreen');
        const sidebarCafeName = document.getElementById('sidebarCafeName');

        if (loginScreen) loginScreen.style.display = 'none';
        if (globalLoader) globalLoader.style.display = 'none';
        if (dashboardScreen) dashboardScreen.style.display = 'flex';
        
        if (sidebarCafeName) sidebarCafeName.textContent = 'جارٍ تحميل البيانات...';

        try {
            // 1. جلب الدور وبيانات المقهى معاً لتوفير الوقت (Parallel Fetch)
            const [profileRes, cafeRes] = await Promise.all([
                sb.from('profiles').select('role').eq('id', user.id).single(),
                sb.from('cafes').select('*').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1)
            ]);
            
            const profile = profileRes.data;
            
            if (profile?.role === 'admin') {
                showToast('مرحباً بالمدير! ✨', 'success');
                setTimeout(() => { window.location.replace('admin.html'); }, 800);
                return;
            }

            // 2. تمرير بيانات المقهى المحملة لدالة الاستكمال
            const existingCafe = cafeRes.data && cafeRes.data.length > 0 ? cafeRes.data[0] : null;
            await loadCafeData(existingCafe);
            
            subscribeToBookings(); 
        } catch(e) {
            console.error("Critical Init Error:", e);
            showToast("حدث خطأ أثناء تهيئة البيانات: " + e.message, "error");
        } finally {
            isInitializing = false;
        }
    } else {
        user = null;
        const loginScreen = document.getElementById('loginScreen');
        const dashboardScreen = document.getElementById('dashboardScreen');
        const globalLoader = document.getElementById('globalLoader');

        if (loginScreen) loginScreen.style.display = 'flex';
        if (dashboardScreen) dashboardScreen.style.display = 'none';
        if (globalLoader) globalLoader.style.display = 'none';
    }
});

// --- Realtime Bookings ---
function subscribeToBookings() {
    if (!myCafe) return;
    sb.channel('public:bookings')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings', filter: `cafe_id=eq.${myCafe.id}` }, payload => {
        showToast("🔥 حجز جديد! يرجى مراجعة قائمة الحجوزات لتأكيده.", "success", 8000);
        loadBookings();
        try { new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(()=>{}); } catch(e){}
      })
      .subscribe();
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('loginBtn');
        btn.disabled = true; 
        btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;margin:0 10px 0 0;"></span> جارٍ الدخول...';
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        const loginTimeout = setTimeout(() => {
            if (btn.disabled) {
                btn.disabled = false; btn.textContent = 'تسجيل الدخول';
                showToast("تأخر الرد من السيرفر، يرجى التأكد من اتصال الإنترنت أو تفعيل الحساب من الإيميل.", "warning");
            }
        }, 15000);

        try {
            const { data, error } = await sb.auth.signInWithPassword({ email, password });
            clearTimeout(loginTimeout);
            if (error) {
                let msg = error.message;
                if (msg.includes('Invalid login credentials')) msg = 'الإيميل أو كلمة المرور غير صحيحة';
                else if (msg.includes('Email not confirmed')) msg = 'يرجى تفعيل حسابك أولاً من الرابط المرسل لبريدك';
                showToast(msg, 'error');
            } else {
                showToast('مرحباً بك مجدداً! ✨', 'success');
            }
        } catch(err) {
            clearTimeout(loginTimeout);
            showToast("حدث خطأ في الاتصال: " + err.message, 'error');
        } finally {
            btn.disabled = false; 
            btn.textContent = 'تسجيل الدخول';
        }
    });
}

function openRegisterModal() { 
    const modal = document.getElementById('registerModal');
    if (modal) modal.style.display = 'flex'; 
}

function openPrivacy() { 
    const modal = document.getElementById('privacyModal');
    if (modal) modal.style.display = 'flex'; 
}

function openTerms() { 
    const modal = document.getElementById('termsModal');
    if (modal) modal.style.display = 'flex'; 
}

const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('regBtn');
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;

        btn.disabled = true; btn.textContent = 'جاري الإنشاء...';
        
        const regTimeout = setTimeout(() => {
            if (btn.disabled) {
                btn.disabled = false; btn.textContent = 'إنشاء الحساب';
                alert("⚠️ يبدو أن الاتصال بطيء جداً أو مقطوع.");
            }
        }, 15000);

        try {
            const { data, error } = await sb.auth.signUp({ email, password });
            if (error) {
                let msg = error.message;
                if (msg.includes('User already registered')) msg = 'هذا الحساب مسجل مسبقاً! جرب تسجيل الدخول';
                else if (msg.includes('Password should be')) msg = 'يجب أن تكون كلمة المرور 6 أحرف على الأقل';
                showToast(msg, 'error');
            } else {
                if (data.user && data.user.identities && data.user.identities.length === 0) {
                    showToast('هذا الحساب مسجل مسبقاً!', 'info');
                    closeModal('registerModal');
                } else if (data.user && !data.session) {
                    showToast('تم إنشاء الحساب! يرجى تفعيله من الإيميل.', 'success');
                    closeModal('registerModal');
                } else {
                    showToast('تم إنشاء الحساب بنجاح! 🎉', 'success');
                    closeModal('registerModal');
                }
            }
        } catch(err) {
            showToast('حدث خطأ فني: ' + err.message, 'error');
        } finally {
            clearTimeout(regTimeout);
            btn.disabled = false; btn.textContent = 'إنشاء الحساب';
        }
    });
}

async function doSignOut() { 
    try { await sb.auth.signOut(); } catch(e) {}
    try {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('sb-')) localStorage.removeItem(key);
        });
        sessionStorage.removeItem('supabase.auth.token'); 
    } catch(e) {}
    window.location.replace('index.html'); 
}

async function doDeleteAccount() {
    if (!user || !myCafe) return showToast("تعذر العثور على بيانات المستخدم", "error");
    if (!confirm("⚠️ تحذير نهائي: هل أنت متأكد من حذف الحساب؟")) return;
    if (!confirm("🚨 تنبيه: سيتم حذف المقهى الخاص بك وكل بياناته نهائياً. هل تود الاستمرار؟")) return;

    const loader = document.getElementById('globalLoader');
    if (loader) {
        loader.style.display = 'flex';
        loader.querySelector('p').textContent = 'جارٍ حذف كافة بياناتك...';
    }

    try {
        const cafeId = myCafe.id;
        const userId = user.id;

        await sb.from('bookings').delete().eq('cafe_id', cafeId);
        await sb.from('offers').delete().eq('cafe_id', cafeId);
        await sb.from('products').delete().eq('cafe_id', cafeId);
        await sb.from('categories').delete().eq('cafe_id', cafeId);
        await sb.from('cafes').delete().eq('id', cafeId);
        await sb.from('profiles').delete().eq('id', userId);

        showToast("تم حذف الحساب بنجاح", "success");
        setTimeout(async () => {
            await sb.auth.signOut();
            window.location.replace('index.html');
        }, 1500);
    } catch (err) {
        showToast("حدث خطأ أثناء محاولة الحذف: " + err.message, "error");
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

// ==========================================
// UI Tabs Navigation
// ==========================================
function switchTab(tabId) {
    document.querySelectorAll('.sidebar-item, .bottom-nav-item').forEach(i => {
        i.classList.toggle('active', i.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    const tab = document.getElementById('tab-' + tabId);
    if (tab) tab.style.display = 'block';
    if (window.innerWidth <= 768) window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.sidebar-item, .bottom-nav-item').forEach(item => {
    item.addEventListener('click', () => {
        if (item.dataset.tab) switchTab(item.dataset.tab);
    });
});

const captureBtn = document.getElementById('captureLocationBtn');
if (captureBtn) {
    captureBtn.addEventListener('click', () => {
        if (!navigator.geolocation) return showToast('المتصفح لا يدعم تحديد الموقع', 'error');
        captureBtn.textContent = '⏳ جاري التحديد...';
        captureBtn.disabled = true;

        navigator.geolocation.getCurrentPosition((pos) => {
            document.getElementById('cafeLatInput').value = pos.coords.latitude;
            document.getElementById('cafeLngInput').value = pos.coords.longitude;
            showToast('تم التقاط الموقع بنجاح', 'success');
            captureBtn.textContent = '📍 تحديث الموقع';
            captureBtn.disabled = false;
        }, (err) => {
            showToast('فشل التقاط الموقع: ' + err.message, 'error');
            captureBtn.textContent = '📍 تحديد موقعي الآن';
            captureBtn.disabled = false;
        }, { enableHighAccuracy: true, timeout: 10000 });
    });
}

// ==========================================
// Data Loading
// ==========================================
async function loadCafeData(existingCafe) {
    try {
        if (!myCafe && !existingCafe) {
            const { data: newCafes, error: insertErr } = await sb.from('cafes').insert([{
                name: 'مقهى جديد', 
                owner_id: user.id
            }]).select();
            if (insertErr) throw insertErr;
            myCafe = newCafes[0];
        } else if (existingCafe) {
            myCafe = existingCafe;
        }
        
        if (!myCafe) throw new Error("فشل في تهيئة المقهى");

        const results = await Promise.allSettled([
            sb.from('categories').select('*').eq('cafe_id', myCafe.id).order('order_index'),
            sb.from('products').select('*').eq('cafe_id', myCafe.id).order('created_at', {ascending: false}),
            sb.from('offers').select('*').eq('cafe_id', myCafe.id).order('created_at', {ascending: false}),
            sb.from('bookings').select('*').eq('cafe_id', myCafe.id).order('created_at', {ascending: false})
        ]);

        const catsRes = results[0].value || { data: [] };
        const prodsRes = results[1].value || { data: [] };
        const offsRes = results[2].value || { data: [] };
        const bookingsRes = results[3].value || { data: [] };

        categories = catsRes.data || [];
        if (categories.length === 0) {
            await seedCategories(myCafe.id);
            const { data: refreshedCats } = await sb.from('categories').select('*').eq('cafe_id', myCafe.id).order('order_index');
            categories = refreshedCats || [];
        }

        products = prodsRes.data || [];
        offers = offsRes.data || [];

        const sidebarName = document.getElementById('sidebarCafeName');
        if (sidebarName) sidebarName.textContent = myCafe.name;
        
        const nameInput = document.getElementById('cafeNameInput');
        if (nameInput) nameInput.value = myCafe.name;

        if (document.getElementById('cafeDescInput')) document.getElementById('cafeDescInput').value = myCafe.description || 'مختلط';
        if (document.getElementById('cafeAddressInput')) document.getElementById('cafeAddressInput').value = myCafe.address || '';
        if (document.getElementById('cafePhoneInput')) document.getElementById('cafePhoneInput').value = myCafe.phone || '';
        if (document.getElementById('cafeHoursInput')) document.getElementById('cafeHoursInput').value = myCafe.working_hours || '';
        if (document.getElementById('cafeMapInput')) document.getElementById('cafeMapInput').value = myCafe.map_url || '';
        if (document.getElementById('cafeLatInput')) document.getElementById('cafeLatInput').value = myCafe.lat || '';
        if (document.getElementById('cafeLngInput')) document.getElementById('cafeLngInput').value = myCafe.lng || '';
        if (document.getElementById('cafeActiveToggle')) document.getElementById('cafeActiveToggle').checked = myCafe.is_active;
        
        if (myCafe.features) {
            const features = Array.isArray(myCafe.features) ? myCafe.features : [];
            document.querySelectorAll('.feature-check').forEach(ck => ck.checked = features.includes(ck.value));
        }
        
        if (myCafe.cover_url) previewImageURL(myCafe.cover_url, 'coverPreview');
        
        populateCategorySelect();
        renderProducts();
        renderOffers();
        updateStats();
        renderBookingsUI(bookingsRes.data || []);

    } catch (err) {
        console.error("Load Error:", err);
        showToast("خطأ في التحميل: " + err.message, "error");
    }
}

function renderBookingsUI(data) {
    const tbody = document.getElementById('bookingsTableBody');
    if (!tbody) return;
    if(!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;opacity:0.6;">لا توجد حجوزات حالياً</td></tr>';
        document.getElementById('pendingBookingsBadge').textContent = '0 طلبات جديدة';
        return;
    }

    const pendingCount = data.filter(b => b.status === 'pending').length;
    const badge = document.getElementById('pendingBookingsBadge');
    if (badge) {
        badge.textContent = `${pendingCount} طلبات جديدة`;
        badge.className = pendingCount > 0 ? 'badge badge-danger' : 'badge badge-primary';
    }

    tbody.innerHTML = data.map(b => `
      <tr>
        <td data-label="الزبون" style="font-weight:600;">${b.customer_name}</td>
        <td data-label="الهاتف" dir="ltr">${b.customer_phone}</td>
        <td data-label="الوقت" style="font-size:0.85rem;">${new Date(b.created_at).toLocaleString('ar-IQ')}</td>
        <td data-label="الحالة">
          <span class="badge ${b.status === 'confirmed' ? 'badge-success' : (b.status === 'pending' ? 'badge-warning' : 'badge-danger')}">
            ${b.status === 'confirmed' ? 'مؤكد' : (b.status === 'pending' ? 'بانتظار الموافقة' : 'مرفوض')}
          </span>
        </td>
        <td data-label="إجراءات">
          ${b.status === 'pending' ? `
            <button class="btn btn-success btn-sm" onclick="updateBookingStatus('${b.id}', 'confirmed')">تأكيد</button>
            <button class="btn btn-outline btn-sm" onclick="updateBookingStatus('${b.id}', 'rejected')">رفض</button>
          ` : `
            <button class="btn btn-danger btn-sm" onclick="deleteBooking('${b.id}')">حذف</button>
          `}
        </td>
      </tr>
    `).join('');
}

async function loadBookings() {
    if(!myCafe) return;
    const { data, error } = await sb.from('bookings').select('*').eq('cafe_id', myCafe.id).order('created_at', {ascending: false});
    if(!error) renderBookingsUI(data);
}

async function updateBookingStatus(id, status) {
    const { error } = await sb.from('bookings').update({ status }).eq('id', id);
    if(error) showToast("فشل التحديث", "error");
    else {
        showToast(status === 'confirmed' ? "تم تأكيد الحجز بنجاح" : "تم رفض الحجز", "success");
        loadBookings();
    }
}

async function deleteBooking(id) {
    if(!confirm("هل أنت متأكد من حذف هذا السجل؟")) return;
    const { error } = await sb.from('bookings').delete().eq('id', id);
    if(!error) loadBookings();
}

async function seedCategories(cafeId) {
    const defaultCats = [
        { cafe_id: cafeId, name: 'الأراكيل', icon: '💨', order_index: 1 },
        { cafe_id: cafeId, name: 'المشروبات الحارة', icon: '♨️', order_index: 2 },
        { cafe_id: cafeId, name: 'المشروبات الباردة', icon: '🧊', order_index: 3 },
        { cafe_id: cafeId, name: 'ماكولات', icon: '🍔', order_index: 4 },
        { cafe_id: cafeId, name: 'التحلية', icon: '🍰', order_index: 5 }
    ];
    await sb.from('categories').insert(defaultCats);
}

function updateStats() {
    if (document.getElementById('statProducts')) document.getElementById('statProducts').textContent = products.length;
    if (document.getElementById('statOffers')) document.getElementById('statOffers').textContent = offers.filter(o => o.is_active).length;
}

function populateCategorySelect() {
    const sel = document.getElementById('prodCategory');
    if (!sel) return;
    sel.options.length = 0;
    if (!categories || categories.length === 0) {
        sel.add(new Option('(لا توجد أقسام)', ''));
    } else {
        categories.forEach(c => {
            sel.add(new Option(`${c.icon || ''} ${c.name || 'بدون اسم'}`, c.id));
        });
    }
}

function renderProducts() {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;
    tbody.innerHTML = products.map(p => `
      <tr>
        <td data-label="الصورة">
          ${p.image_url 
             ? `<img src="${p.image_url}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:8px;">` 
             : `<div style="width:48px;height:48px;background:#f5f5f5;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">☕</div>`
          }
        </td>
        <td data-label="اسم المنتج" style="font-weight:600;">${p.name}</td>
        <td data-label="القسم"><span class="badge badge-primary">${categories.find(c=>c.id===p.category_id)?.name||'-'}</span></td>
        <td data-label="السعر">${Number(p.price).toLocaleString('ar-IQ')} د.ع</td>
        <td data-label="الحالة">
          ${p.is_available ? '<span class="badge badge-success">متاح</span>' : '<span class="badge badge-danger">نفذ</span>'}
        </td>
        <td data-label="إجراءات">
          <button class="btn btn-outline btn-sm" onclick='editProduct(${JSON.stringify(p)})'>تعديل</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">حذف</button>
        </td>
      </tr>
    `).join('');
}

function openProductModal() {
    document.getElementById('prodName').value = '';
    document.getElementById('prodDesc').value = '';
    document.getElementById('prodPrice').value = '';
    document.getElementById('prodId').value = '';
    document.getElementById('prodImgPreview').style.display = 'none';
    document.getElementById('productModalTitle').textContent = 'إضافة منتج جديد';
    const catSel = document.getElementById('prodCategory');
    if (catSel && catSel.options.length > 0) catSel.selectedIndex = 0;
    document.getElementById('productModal').style.display = 'flex';
}

function editProduct(p) {
    document.getElementById('prodId').value = p.id;
    document.getElementById('prodName').value = p.name;
    document.getElementById('prodDesc').value = p.description || '';
    document.getElementById('prodPrice').value = p.price;
    document.getElementById('prodCategory').value = p.category_id;
    document.getElementById('prodAvailable').checked = p.is_available;
    document.getElementById('prodOldImg').value = p.image_url || '';
    const radios = document.getElementsByName('prodSize');
    radios.forEach(r => { if(r.value === (p.display_size || 'small')) r.checked = true; });
    if (p.image_url) previewImageURL(p.image_url, 'prodImgPreview');
    else document.getElementById('prodImgPreview').style.display = 'none';
    document.getElementById('productModalTitle').textContent = 'تعديل منتج';
    document.getElementById('productModal').style.display = 'flex';
}

async function saveProduct() {
    const form = document.getElementById('productForm');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const btn = document.getElementById('saveProductBtn');
    btn.disabled = true; btn.textContent = 'جارٍ الحفظ...';
    try {
        const id = document.getElementById('prodId').value;
        const file = document.getElementById('prodImg').files[0];
        const size = document.querySelector('input[name="prodSize"]:checked').value;
        let imageUrl = document.getElementById('prodOldImg').value || null;
        if (file) {
            const u = await uploadImage(file, 'products');
            if (u) { if (imageUrl) deleteImage(imageUrl); imageUrl = u; }
            else throw new Error("فشل رفع الصورة");
        }
        const payload = {
            cafe_id: myCafe.id,
            name: document.getElementById('prodName').value,
            description: document.getElementById('prodDesc').value,
            price: document.getElementById('prodPrice').value,
            category_id: document.getElementById('prodCategory').value,
            is_available: document.getElementById('prodAvailable').checked,
            display_size: size,
            image_url: imageUrl
        };
        if (id) await sb.from('products').update(payload).eq('id', id);
        else await sb.from('products').insert([payload]);
        showToast('تم الحفظ', 'success');
        closeModal('productModal');
        loadCafeData();
    } catch (err) {
        showToast('خطأ: ' + err.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'حفظ المنتج';
    }
}

async function deleteProduct(id) {
    if (confirm('حذف المنتج؟')) {
        const p = products.find(x => x.id === id);
        if (p?.image_url) deleteImage(p.image_url);
        await sb.from('products').delete().eq('id', id);
        loadCafeData();
    }
}

function renderOffers() {
    const tbody = document.getElementById('offersTableBody');
    if (!tbody) return;
    tbody.innerHTML = offers.map(o => `
      <tr>
        <td data-label="الصورة"><img src="${o.image_url}" style="width:80px;height:40px;object-fit:cover;border-radius:4px;"></td>
        <td data-label="العنوان">${o.title || '-'}</td>
        <td data-label="التاريخ">${o.start_date||'-'} / ${o.end_date||'-'}</td>
        <td data-label="الحالة">${o.is_active ? '<span class="badge badge-success">نشط</span>' : '<span class="badge badge-warning">معطل</span>'}</td>
        <td data-label="إجراءات">
          <button class="btn btn-outline btn-sm" onclick='editOffer(${JSON.stringify(o)})'>تعديل</button>
          <button class="btn btn-danger btn-sm" onclick="deleteOffer('${o.id}')">حذف</button>
        </td>
      </tr>
    `).join('');
}

function openOfferModal() {
    document.getElementById('offerForm').reset();
    document.getElementById('offerId').value = '';
    document.getElementById('offerImgPreview').style.display = 'none';
    document.getElementById('offerModal').style.display = 'flex';
}

function editOffer(o) {
    document.getElementById('offerId').value = o.id;
    document.getElementById('offerTitle').value = o.title || '';
    document.getElementById('offerStart').value = o.start_date || '';
    document.getElementById('offerEnd').value = o.end_date || '';
    document.getElementById('offerActive').checked = o.is_active;
    document.getElementById('offerOldImg').value = o.image_url;
    previewImageURL(o.image_url, 'offerImgPreview');
    document.getElementById('offerModal').style.display = 'flex';
}

async function saveOffer() {
    const form = document.getElementById('offerForm');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const id = document.getElementById('offerId').value;
    const file = document.getElementById('offerImg').files[0];
    let imageUrl = document.getElementById('offerOldImg').value;
    if (!id && !file) return showToast('الصورة مطلوبة', 'error');
    const btn = document.getElementById('saveOfferBtn');
    btn.disabled = true; btn.textContent = 'جارٍ الحفظ...';
    try {
        if (file) {
            const u = await uploadImage(file, 'offers');
            if (u) { if (imageUrl) deleteImage(imageUrl); imageUrl = u; }
        }
        const payload = {
            cafe_id: myCafe.id,
            title: document.getElementById('offerTitle').value,
            start_date: document.getElementById('offerStart').value,
            end_date: document.getElementById('offerEnd').value,
            is_active: document.getElementById('offerActive').checked,
            image_url: imageUrl
        };
        if (id) await sb.from('offers').update(payload).eq('id', id);
        else await sb.from('offers').insert([payload]);
        showToast('تم الحفظ', 'success');
        closeModal('offerModal');
        loadCafeData();
    } catch (err) {
        showToast('خطأ: ' + err.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'حفظ العرض';
    }
}

async function deleteOffer(id) {
    if (confirm('حذف العرض؟')) {
        const o = offers.find(x => x.id === id);
        if (o?.image_url) deleteImage(o.image_url);
        await sb.from('offers').delete().eq('id', id);
        loadCafeData();
    }
}

const cafeForm = document.getElementById('cafeForm');
if (cafeForm) {
    cafeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!myCafe) return showToast('بيانات المقهى غير متوفرة', 'error');
        const btn = document.getElementById('saveCafeBtn');
        const progressContainer = document.getElementById('uploadProgressContainer');
        const progressBar = document.getElementById('uploadProgressBar');
        const percentageText = document.getElementById('uploadPercentage');
        const statusText = document.getElementById('uploadStatusText');

        btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...';
        if (progressContainer) progressContainer.style.display = 'block';

        try {
            let coverUrl = myCafe.cover_url;
            let promoVideoUrl = myCafe.promo_video_url;
            const coverFile = document.getElementById('coverUpload').files[0];
            const promoVideoFile = document.getElementById('promoVideoUpload').files[0];
            
            let coverProgress = 0;
            let videoProgress = 0;

            const updateProgress = () => {
                let total = 0, count = 0;
                if (coverFile) { total += coverProgress; count++; }
                if (promoVideoFile) { total += videoProgress; count++; }
                if (count > 0 && progressBar) {
                    const overall = Math.round(total / count);
                    progressBar.style.width = overall + '%';
                    percentageText.textContent = overall + '%';
                }
            };

            const tasks = [];
            if (coverFile) {
                tasks.push(uploadImage(coverFile, 'cafes', p => { coverProgress = p; updateProgress(); })
                    .then(url => { if(url) { if(coverUrl) deleteImage(coverUrl); coverUrl = url; } }));
            }
            if (promoVideoFile) {
                tasks.push(uploadImage(promoVideoFile, 'videos', p => { videoProgress = p; updateProgress(); })
                    .then(url => { if(url) { if(promoVideoUrl) deleteImage(promoVideoUrl); promoVideoUrl = url; } }));
            }
            if (tasks.length > 0) await Promise.all(tasks);

            const features = Array.from(document.querySelectorAll('.feature-check:checked')).map(ck => ck.value);
            const { error } = await sb.from('cafes').update({
                name: document.getElementById('cafeNameInput').value,
                description: document.getElementById('cafeDescInput').value,
                address: document.getElementById('cafeAddressInput').value,
                phone: document.getElementById('cafePhoneInput').value,
                working_hours: document.getElementById('cafeHoursInput').value,
                map_url: document.getElementById('cafeMapInput').value,
                lat: document.getElementById('cafeLatInput').value ? parseFloat(document.getElementById('cafeLatInput').value) : null,
                lng: document.getElementById('cafeLngInput').value ? parseFloat(document.getElementById('cafeLngInput').value) : null,
                is_active: document.getElementById('cafeActiveToggle').checked,
                cover_url: coverUrl,
                promo_video_url: promoVideoUrl,
                features: features
            }).eq('id', myCafe.id);

            if (error) throw error;
            showToast('تم التحديث بنجاح ✨', 'success');
            loadCafeData();
            setTimeout(() => { if(progressContainer) progressContainer.style.display = 'none'; }, 3000);
        } catch (err) {
            showToast('خطأ: ' + err.message, 'error');
        } finally {
            btn.disabled = false; btn.textContent = 'حفظ التغييرات';
        }
    });
}

// ==========================================
// Utils & Debugging
// ==========================================
async function testSupabaseConnection() {
    let report = "--- تقرير فحص الاتصال ---\n";
    if (typeof supabase === 'undefined') report += "❌ مكتبة Supabase لم يتم تحميلها!\n";
    else report += "✅ مكتبة Supabase محملة.\n";
    if (typeof sb === 'undefined') report += "❌ الكائن 'sb' غير معرف!\n";
    else report += "✅ الكائن 'sb' جاهز.\n";
    try {
        const { error } = await sb.from('profiles').select('count', { count: 'exact', head: true });
        if (error) report += "❌ فشل الاتصال بقاعدة البيانات: " + error.message + "\n";
        else report += "✅ تم الاتصال بقاعدة البيانات بنجاح.\n";
    } catch (e) { report += "❌ خطأ غير متوقع: " + e.message + "\n"; }
    alert(report);
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function previewImg(input, previewId) {
    const preview = document.getElementById(previewId);
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function previewVideo(input, previewId) {
    const preview = document.getElementById(previewId);
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.size > 50 * 1024 * 1024) return showToast("الفيديو كبير جداً (حد أقصى 50MB)", "warning");
        preview.src = URL.createObjectURL(file);
        preview.style.display = 'block';
    }
}

function previewImageURL(url, previewId) {
    const img = document.getElementById(previewId);
    if (img) { img.src = url; img.style.display = 'block'; }
}

// Global Exports
window.openRegisterModal = openRegisterModal;
window.openPrivacy = openPrivacy;
window.openTerms = openTerms;
window.doSignOut = doSignOut;
window.doDeleteAccount = doDeleteAccount;
window.switchTab = switchTab;
window.updateBookingStatus = updateBookingStatus;
window.deleteBooking = deleteBooking;
window.editProduct = editProduct;
window.saveProduct = saveProduct;
window.deleteProduct = deleteProduct;
window.editOffer = editOffer;
window.saveOffer = saveOffer;
window.deleteOffer = deleteOffer;
window.openProductModal = openProductModal;
window.openOfferModal = openOfferModal;
window.loadBookings = loadBookings;
window.loadCafeData = loadCafeData;
window.testSupabaseConnection = testSupabaseConnection;
window.closeModal = closeModal;
window.previewImg = previewImg;
window.previewVideo = previewVideo;
window.previewImageURL = previewImageURL;
