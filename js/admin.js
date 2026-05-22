let user = null;
let allCafes = [];

// ==========================================
// Auth Functions
// ==========================================
const form = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const signUpBtn = document.getElementById('signUpBtn');
const loadingStatus = document.getElementById('loadingStatus');

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginBtn.disabled = true; loginBtn.textContent = 'جارٍ الدخول...';
    try {
      const { error } = await sb.auth.signInWithPassword({
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value
      });
      if (error) throw error;
    } catch(err) {
      showToast(err.message, 'error');
      loginBtn.disabled = false; loginBtn.textContent = 'دخول المستودع';
    }
  });
}

if (signUpBtn) {
  signUpBtn.addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) { showToast("يرجى إدخال البريد وكلمة المرور", "warning"); return; }
    
    signUpBtn.disabled = true; signUpBtn.textContent = 'جارٍ التسجيل...';
    try {
      // 1. إنشاء الحساب الأساسي
      const { data, error: signUpError } = await sb.auth.signUp({ email, password });
      if (signUpError) throw signUpError;

      const newUser = data.user;
      if (newUser) {
        // 2. استخدام upsert لضمان كتابة الرتبة الصحيحة حتى لو تدخل الـ Trigger مسبقاً
        const { error: profileError } = await sb.from('profiles').upsert({
          id: newUser.id,
          email: newUser.email,
          role: 'admin'
        }, { onConflict: 'id' });
        
        if (profileError) {
           console.warn("تحديث البروفايل لم ينجح، قد يتطلب الأمر تحديثاً يدوياً لاحقاً:", profileError);
        }
      }

      showToast("تم إنشاء حسابك بنجاح! جاري تسجيل دخولك كمدير...", "success");
    } catch(err) {
      showToast(err.message, 'error');
      signUpBtn.disabled = false; signUpBtn.textContent = 'إنشاء حساب مدير جديد';
    }
  });
}

let isInitializing = false;
sb.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    if (isInitializing) return;
    isInitializing = true;
    user = session.user;
    if (form) form.style.display = 'none';
    if (loadingStatus) loadingStatus.style.display = 'block';
    let retryCount = 0;
    
    const checkProfile = async () => {
      try {
        const { data: profile, error } = await sb.from('profiles').select('role').eq('id', user.id).single();
        
        if (error) {
          // المحاولة مجدداً في حال تأخر الـ Trigger في Supabase
          if (retryCount < 4) {
            console.log("Profile check attempt " + (retryCount+1));
            retryCount++;
            setTimeout(checkProfile, 1500);
            return;
          }
          throw error;
        }

        if (profile?.role === 'admin') {
          const loginScreen = document.getElementById('loginScreen');
          const dashboardScreen = document.getElementById('dashboardScreen');
          if (loginScreen) loginScreen.style.display = 'none';
          if (dashboardScreen) dashboardScreen.style.display = 'flex';
          initTabs(); 
          loadAllCafes(); 
          loadAllBanners(); 
          loadVideoAds();
          loadAnnouncements(); 
          loadAdSettings();
          loadGlobalBookings();
          loadSupportData();
          subscribeGlobalBookings();
        } else {
          showToast('عذراً، هذا الحساب رتبته (' + (profile?.role || 'غير محدد') + ') وليس لديه صلاحيات مدير (Admin).', 'error');
          await sb.auth.signOut();
          isInitializing = false;
          setTimeout(() => window.location.replace('index.html'), 1500);
        }
      } catch (err) {
        console.error("Profile check failed:", err);
        showToast("فشل التحقق من الصلاحيات: " + (err.message || "المستخدم غير موجود في جدول profiles"), "error");
        await sb.auth.signOut();
        isInitializing = false;
      }
    };

    checkProfile();
  } else {
    user = null;
    const loginScreen = document.getElementById('loginScreen');
    const dashboardScreen = document.getElementById('dashboardScreen');
    if (loginScreen) loginScreen.style.display = 'flex';
    if (dashboardScreen) dashboardScreen.style.display = 'none';
    if (form) form.style.display = 'block';
    if (loadingStatus) loadingStatus.style.display = 'none';
    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'دخول المستودع'; }
    if (signUpBtn) { signUpBtn.disabled = false; signUpBtn.textContent = 'إنشاء حساب مدير جديد'; }
  }
});

async function doSignOut() { 
  try { 
    await sb.auth.signOut(); 
  } catch(e) { console.warn(e); }
  
  try {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-')) localStorage.removeItem(key);
    });
    sessionStorage.clear();
  } catch(e) { console.warn(e); }

  window.location.replace('index.html'); 
}

// ==========================================
// Tabs Logic
// ==========================================
function switchTab(tabId) {
  document.querySelectorAll('.sidebar-item, .bottom-nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
  
  const section = document.getElementById(tabId + 'Section');
  if (section) section.style.display = 'block';
  
  if (window.innerWidth <= 768) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initTabs() {
  document.querySelectorAll('.sidebar-item, .bottom-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (item.dataset.tab) switchTab(item.dataset.tab);
    });
  });
}

// ==========================================
// Banners Management
// ==========================================
async function loadAllBanners() {
  const { data, error } = await sb.from('global_banners').select('*').order('created_at', { ascending: false });
  if (error) return;
  const grid = document.getElementById('bannersGrid');
  if (!grid) return;
  grid.innerHTML = (data || []).map(b => `
    <div class="card" style="background:#2C1810; padding:10px; border:1px solid rgba(255,255,255,0.1)">
      <img src="${b.image_url}" style="width:100%; height:120px; object-fit:cover; border-radius:8px;">
      <div style="margin-top:10px; color:#FFF; font-weight:bold;">${b.title || 'بدون عنوان'}</div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
        <span class="badge ${b.is_active ? 'badge-success' : 'badge-warning'}">${b.is_active ? 'نشط' : 'متوقف'}</span>
        <button class="btn btn-outline btn-sm" onclick="deleteBanner('${b.id}')" style="color:var(--danger)">حذف</button>
      </div>
    </div>
  `).join('');
}

async function showAddBannerModal() {
  const title = prompt("عنوان الإعلان (اختياري):");
  const durationInput = prompt("زمن عرض البنر بالثواني (مثال: 5):", "5");
  const slide_duration = Math.max(1, parseInt(durationInput) || 5);
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = 'image/*';
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    showToast("جارٍ رفع الصورة...", "info");
    const fileName = `${Date.now()}-${file.name}`;
    const { data, error: uploadErr } = await sb.storage.from(STORAGE_BUCKET).upload(`banners/${fileName}`, file);
    if (uploadErr) { showToast("فشل الرفع", "error"); return; }
    const { data: { publicUrl } } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(`banners/${fileName}`);
    const { error: dbErr } = await sb.from('global_banners').insert([{ image_url: publicUrl, title, slide_duration }]);
    if (dbErr) { showToast("فشل الحفظ", "error"); return; }
    showToast(`✅ تمت الإضافة بنجاح! (زمن العرض: ${slide_duration}ث)`, "success");
    loadAllBanners();
  };
  fileInput.click();
}

async function deleteBanner(id) {
  if (!confirm("هل أنت متأكد من حذف هذا الإعلان؟")) return;
  const { error } = await sb.from('global_banners').delete().eq('id', id);
  if (error) showToast("فشل الحذف", "error");
  else loadAllBanners();
}

// ==========================================
// Video Ads Management
// ==========================================
async function loadVideoAds() {
  const { data, error } = await sb.from('video_ads').select('*').order('created_at', { ascending: false });
  if (error) return;
  const grid = document.getElementById('videoAdsGrid');
  if (!grid) return;
  
  const adTypeNames = {
    banner: "إعلان بانر (Banner)",
    interstitial: "إعلان بيني (Interstitial)",
    native: "إعلان مدمج (Native)",
    app_open: "إعلان فتح التطبيق (App Open)",
    video: "إعلان فيديو (Video)",
    playable: "إعلان تفاعلي (Playable)"
  };

  grid.innerHTML = (data || []).map(v => {
    let previewHtml = '';
    if (v.media_type === 'video') {
      previewHtml = `<video src="${v.video_url}" style="width:100%; height:150px; object-fit:cover; border-radius:8px;" muted loop onmouseover="this.play()" onmouseout="this.pause()"></video>`;
    } else if (v.media_type === 'image') {
      previewHtml = `<img src="${v.video_url}" style="width:100%; height:150px; object-fit:cover; border-radius:8px;">`;
    } else {
      previewHtml = `<div style="width:100%; height:150px; background:rgba(255,255,255,0.05); border-radius:8px; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:10px;">
        <span style="font-size:2rem;">🌐</span>
        <span style="font-size:0.8rem; opacity:0.6; word-break:break-all; padding: 0 10px;">${v.video_url}</span>
      </div>`;
    }

    return `
      <div class="card" style="background:#2C1810; padding:15px; border:1px solid rgba(255,255,255,0.1); display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          ${previewHtml}
          <div style="margin-top:10px; color:#FFF; font-weight:bold;">${v.title || 'إعلان مخصص'}</div>
          <div style="margin-top:5px; font-size:0.8rem; display:flex; gap:5px; flex-wrap:wrap;">
            <span class="badge" style="background:var(--accent); color:#000;">${adTypeNames[v.ad_type] || v.ad_type}</span>
            ${v.click_url ? `<span class="badge" style="background:rgba(255,255,255,0.1); color:#FFF; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:150px;">🔗 ${v.click_url}</span>` : ''}
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px;">
          <span class="badge ${v.is_active ? 'badge-success' : 'badge-warning'}">${v.is_active ? 'نشط' : 'متوقف'}</span>
          <button class="btn btn-outline btn-sm" onclick="deleteVideoAd('${v.id}')" style="color:var(--danger)">حذف الإعلان</button>
        </div>
      </div>
    `;
  }).join('');
  if (data.length === 0) grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; opacity:0.5; padding:20px;">لا توجد إعلانات مخصصة حالياً</p>';
}

function showAddAdModal() {
  const overlay = document.getElementById('addAdOverlay');
  if (overlay) overlay.style.display = 'flex';
}

function closeAddAdModal() {
  const overlay = document.getElementById('addAdOverlay');
  if (overlay) overlay.style.display = 'none';
  document.getElementById('addAdForm')?.reset();
  onAdTypeChange();
}

function onAdTypeChange() {
  const adType = document.getElementById('adTypeSelect').value;
  const mediaSelect = document.getElementById('adMediaSelect');
  
  if (adType === 'video') {
    mediaSelect.value = 'video';
    mediaSelect.disabled = true;
  } else if (adType === 'playable') {
    mediaSelect.value = 'html';
    mediaSelect.disabled = true;
  } else {
    mediaSelect.disabled = false;
    if (mediaSelect.value === 'video' || mediaSelect.value === 'html') {
      mediaSelect.value = 'image';
    }
  }
  onMediaSelectChange();
}

function onMediaSelectChange() {
  const mediaType = document.getElementById('adMediaSelect').value;
  const uploadGroup = document.getElementById('adFileUploadGroup');
  const urlGroup = document.getElementById('adPlayableUrlGroup');
  const fileInput = document.getElementById('adFileInput');
  const fileLabel = document.getElementById('adFileLabel');

  if (mediaType === 'html') {
    uploadGroup.style.display = 'none';
    urlGroup.style.display = 'block';
    fileInput.required = false;
  } else {
    uploadGroup.style.display = 'block';
    urlGroup.style.display = 'none';
    fileInput.required = true;
    fileLabel.textContent = mediaType === 'video' ? 'اختر ملف الفيديو (MP4)' : 'اختر صورة الإعلان';
    fileInput.accept = mediaType === 'video' ? 'video/mp4' : 'image/*';
  }
}

async function saveCustomAd(e) {
  e.preventDefault();
  const btn = document.getElementById('saveAdBtn');
  const originalText = btn.textContent;
  
  const title = document.getElementById('adTitle').value.trim();
  const adType = document.getElementById('adTypeSelect').value;
  const mediaType = document.getElementById('adMediaSelect').value;
  const clickUrl = document.getElementById('adClickUrl').value.trim();
  const slide_duration = Math.max(1, parseInt(document.getElementById('adSlideDuration')?.value) || 5);
  
  btn.disabled = true; btn.textContent = 'جاري المعالجة...';
  
  try {
    let adUrl = '';
    
    if (mediaType === 'html') {
      adUrl = document.getElementById('adPlayableUrlInput').value.trim();
      if (!adUrl) throw new Error("يرجى إدخال رابط الإعلان التفاعلي");
    } else {
      const fileInput = document.getElementById('adFileInput');
      const file = fileInput.files[0];
      if (!file) throw new Error("يرجى اختيار ملف للإعلان");
      
      showToast("جارٍ رفع الملف الإعلاني...", "info");
      const folder = mediaType === 'video' ? 'videos' : 'banners';
      const prefix = mediaType === 'video' ? 'video_' : 'ad_';
      const fileName = `${prefix}${Date.now()}_${file.name}`;
      
      const { data: uploadData, error: uploadErr } = await sb.storage.from(STORAGE_BUCKET).upload(`${folder}/${fileName}`, file);
      if (uploadErr) throw uploadErr;
      
      const { data: { publicUrl } } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(`${folder}/${fileName}`);
      adUrl = publicUrl;
    }
    
    const { error: dbErr } = await sb.from('video_ads').insert([{
      title,
      video_url: adUrl,
      ad_type: adType,
      media_type: mediaType,
      click_url: clickUrl || null,
      slide_duration,
      is_active: true
    }]);
    
    if (dbErr) throw dbErr;
    
    showToast(`✅ تم نشر وحفظ الإعلان المخصص بنجاح! (زمن العرض: ${slide_duration}ث)`, "success");
    closeAddAdModal();
    loadVideoAds();
  } catch(err) {
    showToast("خطأ: " + err.message, "error");
    console.error(err);
  } finally {
    btn.disabled = false; btn.textContent = originalText;
  }
}

async function deleteVideoAd(id) {
  if (!confirm("هل أنت متأكد من حذف هذا الفيديو؟")) return;
  const { error } = await sb.from('video_ads').delete().eq('id', id);
  if (error) showToast("فشل الحذف", "error");
  else loadVideoAds();
}

// ==========================================
// Push Notifications (Firebase Cloud Messaging)
// ==========================================
async function sendPushNotification() {
  const titleInput = document.getElementById('pushTitle');
  const bodyInput = document.getElementById('pushBody');
  if (!titleInput || !bodyInput) return;

  const title = titleInput.value.trim();
  const message = bodyInput.value.trim();
  if (!title || !message) { showToast("يرجى ملء جميع الحقول", "error"); return; }
  
  const sendBtn = document.querySelector('button[onclick="sendPushNotification()"]');
  if(sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'جاري الإرسال عبر الخادم...'; }
  
  try {
    showToast("🚀 جاري إرسال التنبيه الفوري بشكل آمن...", "info");
    
    const { data, error } = await sb.functions.invoke('send-notification', {
      body: {
        topic: "all_users",
        title: title,
        body: message
      }
    });

    if (error) throw error;
    
    // تسجيل في السجل
    await sb.from('announcements').insert([{ message: `${title}: ${message}`, type: 'promo' }]);
    
    showToast("✅ تم إرسال التنبيه بنجاح لجميع المستخدمين!", "success");
    titleInput.value = '';
    bodyInput.value = '';
    loadAnnouncements();
    
  } catch (e) {
    console.error(e);
    showToast("فشل الإرسال: " + (e.message || "تأكد من تشغيل الـ Edge Function"), "error");
  } finally {
    if(sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'نشر الإشعار الآن 🚀'; }
  }
}

// ==========================================
// Push History & AdMob Settings Logic
// ==========================================

let allAnnouncements = [];

async function loadAnnouncements() {
  const { data, error } = await sb.from('announcements').select('*').order('created_at', { ascending: false });
  if(error) return;
  allAnnouncements = data || [];
  renderAnnouncements();
}

function renderAnnouncements() {
  const tbody = document.getElementById('announcementsTableBody');
  if(!tbody) return;
  tbody.innerHTML = allAnnouncements.map(a => `
    <tr>
      <td style="padding:12px;">
        <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:6px; font-size:0.9rem;">
          ${a.message}
        </div>
      </td>
      <td style="font-size:0.85rem; opacity:0.7; padding:12px; text-align:right;" dir="ltr">
        ${new Date(a.created_at).toLocaleString('ar-IQ')}
      </td>
      <td style="border-bottom:1px solid rgba(255,255,255,0.1); padding:12px; text-align:center;">
        <button class="btn btn-outline btn-sm" style="color:var(--danger); border-color:var(--danger);" onclick="deleteAnnouncement('${a.id}')">حذف السجل</button>
      </td>
    </tr>
  `).join('');
  if(allAnnouncements.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; opacity:0.5; padding:20px;">لا يوجد سجل للإشعارات السابقة</td></tr>`;
  }
}

async function deleteAnnouncement(id) {
  if(!confirm("هل أنت متأكد من حذف هذا السجل بشكل دائم؟")) return;
  await sb.from('announcements').delete().eq('id', id);
  showToast('تم الحذف بنجاح', 'success');
  loadAnnouncements();
}

async function loadAdSettings() {
  try {
    const { data, error } = await sb.from('global_settings').select('*');
    if(error || !data) return;
    
    const enabledSetting = data.find(s => s.setting_key === 'admob_enabled');
    const bannerIdSetting = data.find(s => s.setting_key === 'admob_banner_id');
    
    if(enabledSetting) {
      const el = document.getElementById('adEnabled');
      if (el) el.value = enabledSetting.setting_value;
    }
    if(bannerIdSetting) {
      const el = document.getElementById('adBannerId');
      if (el) el.value = bannerIdSetting.setting_value;
    }
  } catch(err) {
    console.warn("Table global_settings may not exist yet in your schema.", err);
  }
}

async function saveAdSettings(event) {
  const btn = event?.target || document.querySelector('#adsSection .btn-success');
  if (!btn) return;
  let prevText = btn.textContent;
  btn.disabled = true; btn.textContent = "جاري حفظ الإعدادات...";
  
  const enabledEl = document.getElementById('adEnabled');
  const bannerIdEl = document.getElementById('adBannerId');
  if (!enabledEl || !bannerIdEl) {
    btn.disabled = false; btn.textContent = prevText;
    return;
  }

  const isEnabled = enabledEl.value;
  const bannerId = bannerIdEl.value.trim();
  
  try {
    for (const [key, val] of Object.entries({admob_enabled: isEnabled, admob_banner_id: bannerId})) {
      const { data } = await sb.from('global_settings').select('id').eq('setting_key', key).single();
      if(data) {
        await sb.from('global_settings').update({setting_value: val, updated_at: new Date()}).eq('id', data.id);
      } else {
        await sb.from('global_settings').insert([{setting_key: key, setting_value: val}]);
      }
    }
    showToast("✅ تم حفظ إعدادات إعلانات AdMob والتطبيق بنجاح!", "success");
  } catch(err) {
    showToast("حدث خطأ والسبب أن جدول global_settings قد لا يكون موجودًا", "error");
    console.error(err);
  }
  
  btn.disabled = false; btn.textContent = prevText;
}

// ==========================================
// Data Loading (Existing)
// ==========================================
async function loadAllCafes() {
  try {
    const { data, error } = await sb.from('cafes').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    allCafes = data || [];
    renderCafes();
  } catch (err) {
    console.error('Fetch cafes error:', err);
    showToast('تعذر جلب المقاهي: ' + (err.message || err), 'error');
  }
}

function renderCafes() {
  const tbody = document.getElementById('cafesTableBody');
  if (!tbody) return;
  tbody.innerHTML = allCafes.map(c => `
    <tr>
      <td data-label="المقهى">
        <div style="display:flex;align-items:center;gap:12px;">
          ${c.logo_url 
            ? `<img src="${c.logo_url}" style="width:40px;height:40px;border-radius:8px;">`
            : `<div style="width:40px;height:40px;background:rgba(255,255,255,0.05);border-radius:8px;display:flex;align-items:center;justify-content:center;">🗺️</div>`
          }
          <div style="font-weight:600;">${c.name} ${c.is_pinned ? '<span title="مثبت" style="font-size:0.8rem;">📌</span>' : ''}</div>
        </div>
      </td>
      <td data-label="المالك" style="font-size:0.8rem;opacity:0.7;" dir="ltr">${c.owner_id ? c.owner_id.substring(0,8) + '...' : 'بدون مالك'}</td>
      <td data-label="التاريخ" style="font-size:0.85rem;">${new Date(c.created_at).toLocaleDateString('ar-IQ')}</td>
      <td data-label="الحالة">
        ${c.is_active 
          ? '<span class="badge badge-success">نشط</span>' 
          : '<span class="badge badge-warning">معطل</span>'
        }
      </td>
      <td data-label="إجراءات" style="border-bottom:1px solid rgba(255,255,255,0.1)">
        <button class="btn btn-outline btn-sm" onclick="showCafeDetails('${c.id}')" style="color:#FFF; border-color:rgba(255,255,255,0.2); margin-left:5px;">
          🔍 تفاصيل
        </button>
        <button class="btn btn-sm ${c.is_pinned ? 'btn-danger' : 'btn-outline'}" onclick="toggleCafePin('${c.id}', ${!c.is_pinned})" style="margin-left:5px; ${!c.is_pinned ? 'color:#D4AF37; border-color:#D4AF37;' : ''}">
          ${c.is_pinned ? '❌ إلغاء التثبيت' : '📌 تثبيت'}
        </button>
        <button class="btn btn-sm ${c.is_active ? 'btn-warning' : 'btn-success'}" onclick="toggleCafeStatus('${c.id}', ${!c.is_active})" style="margin-left:5px;">
          ${c.is_active ? 'تعطيل' : 'تفعيل'}
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteCafe('${c.id}')">حذف</button>
      </td>
    </tr>
  `).join('');
}

async function showCafeDetails(id) {
  const overlay = document.getElementById('cafeDetailsOverlay');
  const content = document.getElementById('cafeDetailsContent');
  if (!overlay || !content) return;

  overlay.style.display = 'flex';
  content.innerHTML = '<div style="text-align:center; padding:30px;"><div class="spinner" style="width:30px;height:30px; border:3px solid var(--danger); border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></div><p style="margin-top:10px; opacity:0.7;">جاري جلب بيانات المقهى ومنتجاته...</p></div>';
  
  const cafe = allCafes.find(c => c.id === id);
  if(!cafe) { content.innerHTML="خطأ: لم يتم العثور على المقهى"; return; }
  
  try {
    const [{data: cats}, {data: prods}] = await Promise.all([
      sb.from('categories').select('*').eq('cafe_id', id),
      sb.from('products').select('*').eq('cafe_id', id)
    ]);
    
    let html = `
      <div style="display:flex; gap:15px; margin-bottom:20px; align-items:center; background:rgba(255,255,255,0.02); padding:15px; border-radius:10px;">
        <img src="${cafe.logo_url || ''}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'60\\' height=\\'60\\'><rect fill=\\'%234A2E1B\\' width=\\'60\\' height=\\'60\\'/></svg>'" style="width:70px; height:70px; border-radius:12px; object-fit:cover; border:2px solid rgba(255,255,255,0.1);">
        <div>
          <h4 style="margin:0 0 5px 0; font-size:1.3rem; color:#A0856E">${cafe.name}</h4>
          <div style="opacity:0.7; font-size:0.85rem; margin-bottom:3px;">كود مالك المقهى: <span dir="ltr" style="background:rgba(0,0,0,0.3); padding:2px 5px; border-radius:4px;">${cafe.owner_id || 'لا يوجد'}</span></div>
          <div style="opacity:0.9; font-size:0.9rem;">الحالة: ${cafe.is_active ? '<span style="color:#4caf50;">✅ يعمل متاح حالياً</span>' : '<span style="color:#f44336;">❌ معطل</span>'}</div>
        </div>
      </div>
      
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px;">
        <div style="background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
          <div style="color:#A0856E; margin-bottom:5px; font-size:0.85rem;">رقم التواصل</div>
          <div style="font-weight:bold;">${cafe.phone || '<span style="opacity:0.4;">---</span>'}</div>
        </div>
        <div style="background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
          <div style="color:#A0856E; margin-bottom:5px; font-size:0.85rem;">تاريخ إنشاء المقهى</div>
          <div style="font-weight:bold;">${new Date(cafe.created_at).toLocaleDateString('ar-IQ')}</div>
        </div>
      </div>
    `;
    
    html += `<h4 style="margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); color:var(--danger); display:flex; justify-content:space-between;">
               <span>شجرة التصنيفات والمنتجات (المنيو) ☕</span>
               <span style="font-size:0.85rem; color:#FFF; font-weight:normal; background:rgba(255,255,255,0.1); padding:3px 8px; border-radius:12px;">مجموع: ${prods?.length || 0}</span>
             </h4>`;
    
    if(!cats || cats.length === 0) {
      html += `<div style="text-align:center; padding:15px; opacity:0.5; background:rgba(0,0,0,0.2); border-radius:8px;">لم يقم صاحب المقهى بإضافة أي أقسام بعد.</div>`;
    } else {
      cats.forEach(cat => {
        const catProds = prods?.filter(p => p.category_id === cat.id) || [];
        html += `
          <div style="background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.05); border-radius:8px; padding:12px; margin-bottom:12px;">
            <div style="font-weight:bold; margin-bottom:10px; color:#EBD9C8; display:flex; align-items:center; gap:8px;">
              <span>📂</span> ${cat.name} 
              <span class="badge" style="background:rgba(255,255,255,0.1); color:#FFF; font-size:0.75rem;">${catProds.length} مُنتج</span>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
              ${catProds.map(p => `
                <div style="background:var(--bg-dark); border:1px solid rgba(255,255,255,0.1); padding:6px 10px; border-radius:6px; font-size:0.85rem; display:flex; align-items:center; gap:6px;">
                  ${p.is_available ? '<span style="color:#4caf50; font-size:0.7rem;">🟢</span>' : '<span style="color:#f44336; font-size:0.7rem;">🔴</span>'}
                  <span>${p.name}</span>
                  <span style="opacity:0.5;">|</span>
                  <span style="color:#A0856E;">${p.price} د.ع</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      });
    }
    content.innerHTML = html;
  } catch(err) {
    content.innerHTML = `<div style="color:var(--danger); text-align:center;">حدث خطأ أثناء تحميل تفاصيل الأقسام والمنتجات: ${err.message}</div>`;
  }
}

async function toggleCafeStatus(id, newStatus) {
  if (confirm(`هل أنت متأكد من ${newStatus ? 'تفعيل' : 'تعطيل'} هذا المقهى؟`)) {
    await sb.from('cafes').update({ is_active: newStatus }).eq('id', id);
    showToast('تم تحديث حالة المقهى', 'success');
    loadAllCafes();
  }
}

async function toggleCafePin(id, newStatus) {
  if (confirm(`هل أنت متأكد من ${newStatus ? 'تثبيت' : 'إلغاء تثبيت'} هذا المقهى في أعلى القائمة؟`)) {
    await sb.from('cafes').update({ is_pinned: newStatus }).eq('id', id);
    showToast('تم تحديث التثبيت', 'success');
    loadAllCafes();
  }
}

async function deleteCafe(id) {
  if (confirm('تنبيه خطير: هل أنت متأكد من حذف المقهى وكل بياناته نهائياً؟')) {
    await sb.from('cafes').delete().eq('id', id);
    showToast('تم حذف المقهى', 'success');
    loadAllCafes();
  }
}

// ==========================================
// Global Bookings
// ==========================================
async function loadGlobalBookings() {
   const { data, error } = await sb.from('bookings').select('*, cafes(name)').order('created_at', {ascending: false});
   if(error) return;
   const tbody = document.getElementById('globalBookingsTableBody');
   if (!tbody) return;
   tbody.innerHTML = (data || []).map(b => `
     <tr>
       <td>${b.cafes?.name || 'مقهى محذوف'}</td>
       <td>${b.customer_name}</td>
       <td>${new Date(b.created_at).toLocaleString('ar-IQ')}</td>
       <td><span class="badge ${b.status === 'confirmed' ? 'badge-success' : (b.status === 'pending' ? 'badge-warning' : 'badge-danger')}">${b.status}</span></td>
     </tr>
   `).join('');
}

// ==========================================
// App Settings (Support)
// ==========================================
async function loadSupportData() {
  const { data } = await sb.from('global_settings').select('*');
  if(data) {
    const phoneInput = document.getElementById('supportPhone');
    const emailInput = document.getElementById('supportEmail');
    if (phoneInput) phoneInput.value = data.find(s => s.setting_key === 'support_phone')?.setting_value || '';
    if (emailInput) emailInput.value = data.find(s => s.setting_key === 'support_email')?.setting_value || '';
    
    // Hero Text & Links
    const hTitle = document.getElementById('heroTitleInput');
    const hSubtitle = document.getElementById('heroSubtitleInput');
    const hStickerLink = document.getElementById('heroStickerLinkInput');
    
    if (hTitle) hTitle.value = data.find(s => s.setting_key === 'hero_title')?.setting_value || '';
    if (hSubtitle) hSubtitle.value = data.find(s => s.setting_key === 'hero_subtitle')?.setting_value || '';
    if (hStickerLink) hStickerLink.value = data.find(s => s.setting_key === 'hero_sticker_link')?.setting_value || '';
    
    // Hero Image
    const heroImage = data.find(s => s.setting_key === 'hero_background_url')?.setting_value;
    const preview = document.getElementById('heroImagePreview');
    const removeBtn = document.getElementById('removeHeroBtn');
    if (preview && heroImage) {
      preview.src = heroImage;
      preview.style.display = 'block';
      if (removeBtn) removeBtn.style.display = 'block';
    } else if (preview) {
      preview.style.display = 'none';
      if (removeBtn) removeBtn.style.display = 'none';
    }
    
    // Hero Sticker
    const heroSticker = data.find(s => s.setting_key === 'hero_sticker_url')?.setting_value;
    const stickerPreview = document.getElementById('heroStickerPreview');
    const removeStickerBtn = document.getElementById('removeStickerBtn');
    if (stickerPreview && heroSticker) {
      stickerPreview.src = heroSticker;
      stickerPreview.style.display = 'block';
      if (removeStickerBtn) removeStickerBtn.style.display = 'block';
    } else if (stickerPreview) {
      stickerPreview.style.display = 'none';
      if (removeStickerBtn) removeStickerBtn.style.display = 'none';
    }
  }
}

async function saveSupportSettings(event) {
  const btn = event?.target;
  if (!btn) return;
  const originalText = btn.textContent;
  btn.disabled = true; btn.textContent = 'جاري الحفظ...';
  
  const phone = document.getElementById('supportPhone')?.value.trim() || '';
  const email = document.getElementById('supportEmail')?.value.trim() || '';
  
  try {
    for (const [key, val] of Object.entries({support_phone: phone, support_email: email})) {
      const { data: exist } = await sb.from('global_settings').select('id').eq('setting_key', key).single();
      if(exist) await sb.from('global_settings').update({setting_value: val}).eq('id', exist.id);
      else await sb.from('global_settings').insert([{setting_key: key, setting_value: val}]);
    }
    showToast("تم حفظ إعدادات الدعم بنجاح", "success");
  } catch(e) {
    showToast("خطأ في الحفظ: " + e.message, "error");
  } finally {
    btn.disabled = false; btn.textContent = originalText;
  }
}

async function uploadHeroImage() {
  const fileInput = document.getElementById('heroImageInput');
  const btn = document.getElementById('uploadHeroBtn');
  const file = fileInput.files[0];
  if (!file) { showToast("الرجاء اختيار صورة أولاً", "warning"); return; }
  
  btn.disabled = true; btn.textContent = 'جارٍ الرفع...';
  try {
    const fileName = `hero_${Date.now()}_${file.name}`;
    const { error: uploadErr } = await sb.storage.from(STORAGE_BUCKET).upload(`settings/${fileName}`, file);
    if (uploadErr) throw uploadErr;
    
    const { data: { publicUrl } } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(`settings/${fileName}`);
    
    const { data: exist } = await sb.from('global_settings').select('id').eq('setting_key', 'hero_background_url').single();
    if(exist) {
      await sb.from('global_settings').update({setting_value: publicUrl}).eq('id', exist.id);
    } else {
      await sb.from('global_settings').insert([{setting_key: 'hero_background_url', setting_value: publicUrl}]);
    }
    
    showToast("تم تغيير خلفية الواجهة بنجاح!", "success");
    fileInput.value = '';
    loadSupportData();
  } catch(e) {
    showToast("خطأ في الرفع: " + e.message, "error");
  } finally {
    btn.disabled = false; btn.textContent = 'رفع الصورة';
  }
}

async function removeHeroImage() {
  if (!confirm("هل أنت متأكد من حذف صورة الخلفية واستعادة اللون الأصلي؟")) return;
  try {
    const { error } = await sb.from('global_settings').delete().eq('setting_key', 'hero_background_url');
    if (error) throw error;
    showToast("تم الحذف بنجاح", "success");
    loadSupportData();
  } catch(e) {
    showToast("خطأ في الحذف: " + e.message, "error");
  }
}

async function uploadHeroSticker() {
  const fileInput = document.getElementById('heroStickerInput');
  const btn = document.getElementById('uploadStickerBtn');
  const file = fileInput.files[0];
  if (!file) { showToast("الرجاء اختيار ملصق أولاً", "warning"); return; }
  
  btn.disabled = true; btn.textContent = 'جارٍ الرفع...';
  try {
    const fileName = `sticker_${Date.now()}_${file.name}`;
    const { error: uploadErr } = await sb.storage.from(STORAGE_BUCKET).upload(`settings/${fileName}`, file);
    if (uploadErr) throw uploadErr;
    
    const { data: { publicUrl } } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(`settings/${fileName}`);
    
    const { data: exist } = await sb.from('global_settings').select('id').eq('setting_key', 'hero_sticker_url').single();
    if(exist) {
      await sb.from('global_settings').update({setting_value: publicUrl}).eq('id', exist.id);
    } else {
      await sb.from('global_settings').insert([{setting_key: 'hero_sticker_url', setting_value: publicUrl}]);
    }
    
    showToast("تم إضافة الملصق بنجاح!", "success");
    fileInput.value = '';
    loadSupportData();
  } catch(e) {
    showToast("خطأ في رفع الملصق: " + e.message, "error");
  } finally {
    btn.disabled = false; btn.textContent = 'رفع الملصق';
  }
}

async function removeHeroSticker() {
  if (!confirm("هل أنت متأكد من حذف الملصق العائم؟")) return;
  try {
    const { error } = await sb.from('global_settings').delete().eq('setting_key', 'hero_sticker_url');
    if (error) throw error;
    showToast("تم الحذف بنجاح", "success");
    loadSupportData();
  } catch(e) {
    showToast("خطأ في الحذف: " + e.message, "error");
  }
}

async function saveHeroTextsAndLinks() {
  const title = document.getElementById('heroTitleInput')?.value.trim() || '';
  const subtitle = document.getElementById('heroSubtitleInput')?.value.trim() || '';
  const link = document.getElementById('heroStickerLinkInput')?.value.trim() || '';
  
  try {
    for (const [key, val] of Object.entries({hero_title: title, hero_subtitle: subtitle, hero_sticker_link: link})) {
      if (!val) {
        await sb.from('global_settings').delete().eq('setting_key', key);
        continue;
      }
      const { data: exist } = await sb.from('global_settings').select('id').eq('setting_key', key).single();
      if(exist) {
        await sb.from('global_settings').update({setting_value: val}).eq('id', exist.id);
      } else {
        await sb.from('global_settings').insert([{setting_key: key, setting_value: val}]);
      }
    }
    showToast("تم حفظ نصوص وروابط الواجهة بنجاح!", "success");
  } catch (e) {
    showToast("حدث خطأ أثناء الحفظ", "error");
    console.error(e);
  }
}

// --- Realtime Global Admin Listener ---
function subscribeGlobalBookings() {
  sb.channel('admin:bookings')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, payload => {
      showToast("🔔 حجز جديد وصل لأحد المقاهي!", "info");
      loadGlobalBookings();
    })
    .subscribe();
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  container.prepend(el);
  setTimeout(() => el.remove(), 3200);
}
