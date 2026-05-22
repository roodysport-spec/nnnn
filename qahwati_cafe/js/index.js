/**
 * js/index.js - منطق الصفحة الرئيسية
 */

let allCafes = [];
let userLat = localStorage.getItem('user_lat') ? parseFloat(localStorage.getItem('user_lat')) : null;
let userLng = localStorage.getItem('user_lng') ? parseFloat(localStorage.getItem('user_lng')) : null;
let currentFilter = 'all';
let nativeAds = [];

async function loadData() {
    try {
        const [{ data: cafes, error: cErr }, { data: banners, error: bErr }, { data: activeOffers, error: oErr }, { data: ann, error: aErr }, { data: videoAds, error: vErr }, { data: settings, error: sErr }] = await Promise.all([
            sb.from('cafes').select('*').eq('is_active', true).order('created_at', { ascending: false }),
            sb.from('global_banners').select('*').eq('is_active', true),
            sb.from('offers').select('cafe_id').eq('is_active', true),
            sb.from('announcements').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1),
            sb.from('video_ads').select('*').eq('is_active', true).order('order_index', { ascending: true }),
            sb.from('global_settings').select('*')
        ]);

        if (cErr) { handleSupabaseError(cErr, "فشل تحميل قائمة المقاهي"); return; }
        if (vErr) console.warn("Video ads error:", vErr);

        // ربط العروض بالمقاهي
        const cafesWithOfferIds = new Set((activeOffers || []).map(o => o.cafe_id));
        allCafes = (cafes || []).map(c => ({
            ...c,
            has_active_offer: cafesWithOfferIds.has(c.id)
        }));

        // تطبيق تخصيص الواجهة الرئيسية (Hero Settings)
        if (settings) {
            const heroUrl = settings.find(s => s.setting_key === 'hero_background_url')?.setting_value;
            const heroTitle = settings.find(s => s.setting_key === 'hero_title')?.setting_value;
            const heroSubtitle = settings.find(s => s.setting_key === 'hero_subtitle')?.setting_value;
            const heroSticker = settings.find(s => s.setting_key === 'hero_sticker_url')?.setting_value;
            const heroStickerLink = settings.find(s => s.setting_key === 'hero_sticker_link')?.setting_value;

            if (heroUrl) {
                const heroSection = document.querySelector('.hero');
                if (heroSection) {
                    heroSection.style.backgroundImage = `linear-gradient(rgba(28, 10, 4, 0.7), rgba(28, 10, 4, 0.9)), url('${heroUrl}')`;
                    heroSection.style.backgroundSize = 'cover';
                    heroSection.style.backgroundPosition = 'center';
                }
            }

            if (heroTitle) {
                const titleEl = document.getElementById('heroTitle');
                if (titleEl) titleEl.textContent = heroTitle;
            }

            if (heroSubtitle) {
                const subtitleEl = document.getElementById('heroSubtitle');
                if (subtitleEl) subtitleEl.textContent = heroSubtitle;
            }

            const stickerWrap = document.getElementById('heroStickerWrap');
            const stickerImg = document.getElementById('heroStickerImg');
            const stickerLink = document.getElementById('heroStickerLink');

            if (stickerWrap && stickerImg && heroSticker) {
                stickerImg.src = heroSticker;
                stickerWrap.style.display = 'block';
                if (heroStickerLink) {
                    stickerLink.href = heroStickerLink;
                } else {
                    stickerLink.removeAttribute('href');
                    stickerLink.style.cursor = 'default';
                }
            } else if (stickerWrap) {
                stickerWrap.style.display = 'none';
            }
        }

        // الإعلان العلوي (تم إلغاء عرضه في الواجهة بناءً على طلب المستخدم - يبقى كإشعار فقط)
        /*
        if (ann && ann.length > 0) {
            const annBar = document.getElementById('announcementBar');
            if (annBar) annBar.style.display = 'block';
            const annText = document.getElementById('announcementText');
            if (annText) annText.innerText = ann[0].message;
        }
        */

        // البنرات المتحركة
        if (banners && banners.length > 0) {
            const bannersSection = document.getElementById('bannersSection');
            if (bannersSection) {
                bannersSection.style.display = 'block';
                document.getElementById('bannersContainer').innerHTML = `
                    <div class="offers-carousel" style="aspect-ratio:21/8; max-height:280px; overflow:hidden; border-radius:18px;">
                        <div id="bannersTrack" style="display:flex; transition:transform 0.5s ease; width:100%; height:100%;">
                            ${banners.map(b => `<img src="${b.image_url}" style="min-width:100%; object-fit:cover;">`).join('')}
                        </div>
                    </div>`;
                if (banners.length > 1) {
                    let globalBannerTimeout = null;
                    function startGlobalBannersSlider(bIdx) {
                        if (globalBannerTimeout) clearTimeout(globalBannerTimeout);
                        const currentBanner = banners[bIdx];
                        const duration = ((currentBanner.slide_duration) || 5) * 1000;
                        globalBannerTimeout = setTimeout(() => {
                            const nextIdx = (bIdx + 1) % banners.length;
                            const track = document.getElementById('bannersTrack');
                            if (track) track.style.transform = `translateX(-${nextIdx * 100}%)`;
                            startGlobalBannersSlider(nextIdx);
                        }, duration);
                    }
                    startGlobalBannersSlider(0);
                }
            }
        }

        applyFilters();

        // إعلانات البانر المخصصة (Custom Banner Ads)
        if (videoAds && videoAds.length > 0) {
            const bannerAds = videoAds.filter(a => a.ad_type === 'banner');
            const bannersSec = document.getElementById('customBannersSection');
            const bannersCont = document.getElementById('customBannersContainer');
            if (bannersSec && bannersCont && bannerAds.length > 0) {
                bannersSec.style.display = 'block';
                
                // Render custom banner ads inside a single cross-fade container
                bannersCont.innerHTML = `
                    <div class="custom-banners-carousel">
                        ${bannerAds.map((b, i) => {
                            let mediaTag = '';
                            let bgTag = '';
                            // Robust fallback if media_type is not defined or null
                            let mType = b.media_type;
                            if (!mType && b.video_url) {
                                const ext = b.video_url.split('.').pop().toLowerCase().split('?')[0];
                                if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) {
                                    mType = 'video';
                                } else {
                                    mType = 'image';
                                }
                            }
                            
                            if (mType === 'image') {
                                bgTag = `<img class="custom-carousel-bg" src="${b.video_url}">`;
                                mediaTag = `<img class="custom-carousel-media" src="${b.video_url}">`;
                            } else if (mType === 'video') {
                                bgTag = `<video class="custom-carousel-bg" src="${b.video_url}" muted loop autoplay playsinline></video>`;
                                mediaTag = `<video class="custom-carousel-media" src="${b.video_url}" muted autoplay loop playsinline></video>`;
                            }
                            
                            const slideContent = `${bgTag}${mediaTag}`;
                            const activeClass = i === 0 ? 'active' : '';
                            if (b.click_url) {
                                return `<a href="${b.click_url}" target="_blank" class="custom-carousel-slide ${activeClass}">${slideContent}</a>`;
                            }
                            return `<div class="custom-carousel-slide ${activeClass}">${slideContent}</div>`;
                        }).join('')}
                        ${bannerAds.length > 1 ? `
                            <div class="carousel-dots" id="customBannersDots" style="position:absolute; bottom:10px; left:50%; transform:translateX(-50%); display:flex; gap:6px; z-index:10;">
                                ${bannerAds.map((_, i) => `<span class="dot ${i === 0 ? 'active' : ''}" data-idx="${i}" onclick="switchCustomBanner(${i})"></span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;

                if (bannerAds.length > 1) {
                    let bIdx = 0;
                    let customBannerTimeout = null;

                    // Expose dynamic dot switcher to window context
                    window.switchCustomBanner = function(idx) {
                        bIdx = idx;
                        
                        // Toggle active class on all slides for smooth cross-fade
                        const slides = document.querySelectorAll('.custom-banners-carousel .custom-carousel-slide');
                        slides.forEach((slide, i) => {
                            if (i === bIdx) slide.classList.add('active');
                            else slide.classList.remove('active');
                        });
                        
                        // Update dots active class
                        const dots = document.querySelectorAll('#customBannersDots .dot');
                        dots.forEach((dot, i) => {
                            if (i === bIdx) dot.classList.add('active');
                            else dot.classList.remove('active');
                        });
                    };

                    // Auto-slide with per-banner dynamic duration
                    function startCustomBannersSlider(currentIdx) {
                        if (customBannerTimeout) clearTimeout(customBannerTimeout);
                        const currentAd = bannerAds[currentIdx];
                        const duration = ((currentAd.slide_duration) || 5) * 1000;
                        customBannerTimeout = setTimeout(() => {
                            const nextIdx = (currentIdx + 1) % bannerAds.length;
                            window.switchCustomBanner(nextIdx);
                            startCustomBannersSlider(nextIdx);
                        }, duration);
                    }
                    startCustomBannersSlider(0);
                }
            } else if (bannersSec) {
                bannersSec.style.display = 'none';
            }
        }

        // فصل وحفظ الإعلانات المدمجة (Native Ads)
        if (videoAds) {
            nativeAds = videoAds.filter(a => a.ad_type === 'native');
        }

        // إعلانات البوب أب التراكبية (App Open / Interstitial / Video / Playable)
        if (videoAds && videoAds.length > 0) {
            const overlayAds = videoAds.filter(a => ['app_open', 'interstitial', 'video', 'playable'].includes(a.ad_type));
            if (overlayAds.length > 0) {
                const ad = overlayAds[0];
                const overlay = document.getElementById('videoAdOverlay');
                const player = document.getElementById('videoAdPlayer');
                const imgLink = document.getElementById('imageAdLink');
                const imgAd = document.getElementById('imageAdPlayer');
                const frameAd = document.getElementById('playableAdFrame');
                const badgeLabel = document.getElementById('adLabelBadge');

                if (overlay && !sessionStorage.getItem(`global_ad_shown_${ad.id}`)) {
                    overlay.style.display = 'flex';
                    if (badgeLabel) badgeLabel.textContent = "إعلان ممول";
                    
                    // إخفاء كل العناصر أولاً
                    if (player) player.style.display = 'none';
                    if (imgLink) imgLink.style.display = 'none';
                    if (frameAd) frameAd.style.display = 'none';

                    if (ad.media_type === 'video' && player) {
                        player.style.display = 'block';
                        player.src = ad.video_url;
                        player.muted = true;
                        player.playsinline = true; 
                        player.setAttribute('webkit-playsinline', 'true');
                        player.play().catch(() => { player.controls = true; });
                        player.onended = closeVideoAd;
                    } else if (ad.media_type === 'image' && imgLink && imgAd) {
                        imgLink.style.display = 'flex';
                        imgAd.src = ad.video_url;
                        if (ad.click_url) {
                            imgLink.href = ad.click_url;
                            imgLink.target = '_blank';
                        } else {
                            imgLink.removeAttribute('href');
                            imgLink.style.cursor = 'default';
                        }
                    } else if (ad.media_type === 'html' && frameAd) {
                        frameAd.style.display = 'block';
                        frameAd.src = ad.video_url;
                    }
                    
                    sessionStorage.setItem(`global_ad_shown_${ad.id}`, 'true');
                    refreshIcons();
                }
            }
        }

        if (!userLat && !sessionStorage.getItem('location_prompt_shown')) {
            setTimeout(() => {
                const prompt = document.getElementById('locationPrompt');
                if (prompt) {
                    prompt.style.display = 'flex';
                    sessionStorage.setItem('location_prompt_shown', 'true');
                }
            }, 2000);
        }
    } catch (e) {
        console.error('Initial Load Error:', e);
        showToast('حدث خطأ أثناء تحميل البيانات الرئيسية', 'error');
        const grid = document.getElementById('cafesGrid');
        if (grid) grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>عذراً، فشل الاتصال</h3><button class="btn btn-accent" onclick="loadData()">إعادة المحاولة</button></div>`;
    }
}

function renderCafes(list) {
    const grid = document.getElementById('cafesGrid');
    const count = document.getElementById('cafesCount');
    if (count) count.textContent = list.length ? `${list.length} مقهى متاح الآن` : 'لا توجد مقاهي حالياً';

    if (!list.length) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1; text-align:center; padding:60px;">
            <i data-lucide="search-x" style="width:48px;height:48px;opacity:0.3;margin-bottom:15px;"></i>
            <h3 style="opacity:0.6;">لم نجد أي مقاهي مطابقة</h3>
        </div>`;
        refreshIcons(); return;
    }

    let html = [];
    list.forEach((c, idx) => {
        // إضافة كارت المقهى العادي
        html.push(`
          <a href="cafe.html?id=${c.id}" class="cafe-card">
            <div class="cafe-cover-wrap" style="position:relative;">
              ${c.cover_url ? `<img src="${c.cover_url}" class="cafe-cover" alt="" loading="lazy">` : `<div class="cafe-cover-placeholder">🗺️</div>`}
            </div>
            <div class="cafe-card-body">
              <div style="display:flex; gap:12px; align-items:center; margin-bottom:10px;">
                <div class="cafe-logo-sm">${c.logo_url ? `<img src="${c.logo_url}" alt="">` : `☕`}</div>
                <div class="cafe-info">
                  <div class="cafe-name">${c.name}</div>
                  ${(c.distance && c.distance !== Infinity) ? `<div style="font-size:0.75rem; color:var(--accent); font-weight:bold;">📍 يبعد ${c.distance.toFixed(1)} كم</div>` : ''}
                </div>
              </div>
              <p class="cafe-desc">${c.description || 'تصفح المنيو الخاص بنا واستمتع بأفضل الأجواء.'}</p>
              <div class="cafe-card-footer"><i data-lucide="arrow-left"></i></div>
            </div>
          </a>
        `);

        // حقن إعلان مدمج (Native Ad) كل 3 مقاهي بذكاء
        if ((idx + 1) % 3 === 0 && nativeAds.length > 0) {
            const adIdx = Math.floor((idx + 1) / 3 - 1) % nativeAds.length;
            const ad = nativeAds[adIdx];
            
            let adMedia = '';
            if (ad.media_type === 'image') {
                adMedia = `<img src="${ad.video_url}" style="width:100%; height:160px; object-fit:cover; border-radius:12px;">`;
            } else if (ad.media_type === 'video') {
                adMedia = `<video src="${ad.video_url}" style="width:100%; height:160px; object-fit:cover; border-radius:12px;" muted autoplay loop playsinline></video>`;
            } else {
                adMedia = `<div style="width:100%; height:160px; background:rgba(255,255,255,0.02); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:3rem;">🌐</div>`;
            }
            
            html.push(`
              <a ${ad.click_url ? `href="${ad.click_url}" target="_blank"` : 'href="javascript:void(0)"'} class="cafe-card" style="border:1px dashed var(--accent); background:rgba(212, 175, 55, 0.02); position:relative; text-decoration:none; cursor:${ad.click_url ? 'pointer' : 'default'}">
                <div style="position:absolute; top:12px; right:12px; background:rgba(212, 175, 55, 0.95); color:#000; padding:4px 10px; border-radius:6px; font-size:0.75rem; font-weight:bold; z-index:5;">إعلان مدمج (Native)</div>
                <div class="cafe-cover-wrap" style="position:relative; padding:8px;">
                  ${adMedia}
                </div>
                <div class="cafe-card-body" style="padding-top:5px;">
                  <div class="cafe-name" style="color:var(--accent); margin-bottom:5px;">${ad.title}</div>
                  <p class="cafe-desc">إعلان ترويجي مميز من إدارة التطبيق.</p>
                  <div class="cafe-card-footer"><i data-lucide="${ad.click_url ? 'external-link' : 'info'}"></i></div>
                </div>
              </a>
            `);
        }
    });

    grid.innerHTML = html.join('');
    refreshIcons();
}

function requestLocation() {
    const prompt = document.getElementById('locationPrompt');
    if (prompt) prompt.style.display = 'none';
    if (!navigator.geolocation) { showToast('المتصفح لا يدعم تحديد الموقع', 'error'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
        userLat = pos.coords.latitude; userLng = pos.coords.longitude;
        localStorage.setItem('user_lat', userLat); localStorage.setItem('user_lng', userLng);
        showToast('✅ تم تحديد موقعك بنجاح!', 'success');
        applyFilters();
    }, () => {
        showToast('لم يتم السماح بالوصول للموقع. سيتم عرض المقاهي عشوائياً.', 'warning');
        applyFilters();
    });
}

function applyFilters() {
    const searchInput = document.getElementById('searchInput');
    const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
    let result = [...allCafes];

    result.forEach(c => {
        c.distance = (userLat && c.lat) ? calculateDistance(userLat, userLng, c.lat, c.lng) : Infinity;
    });

    if (currentFilter === 'closest') {
        result = result.filter(c => c.distance !== Infinity).sort((a, b) => a.distance - b.distance);
    } else if (currentFilter === 'farthest') {
        result = result.filter(c => c.distance !== Infinity).sort((a, b) => b.distance - a.distance);
    } else if (currentFilter === 'offers') {
        result = result.filter(c => c.has_active_offer);
    }

    if (q) {
        result = result.filter(c => c.name.toLowerCase().includes(q) || (c.description && c.description.toLowerCase().includes(q)));
    }

    // فرز المقاهي المثبتة لتكون في الأعلى دائماً
    result.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return 0; // الحفاظ على الترتيب السابق (المسافة، الأبجدية، إلخ) للمقاهي غير المثبتة
    });

    renderCafes(result);
}

function closeVideoAd() {
    const overlay = document.getElementById('videoAdOverlay');
    const player = document.getElementById('videoAdPlayer');
    if (player) player.pause();
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 400);
    }
}

function openPrivacy() { 
    const modal = document.getElementById('privacyModal');
    if (modal) modal.style.display = 'flex'; 
}

function openSupport() {
    const modal = document.getElementById('supportModal');
    if (modal) {
        modal.style.display = 'flex';
        loadSupportData();
    }
}

function closeModal(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none'; 
}

async function loadSupportData() {
    const content = document.getElementById('supportContent');
    try {
        const { data } = await sb.from('global_settings').select('*');
        if (data && content) {
            const phone = data.find(s => s.setting_key === 'support_phone')?.setting_value || '07700000000';
            const email = data.find(s => s.setting_key === 'support_email')?.setting_value || 'support@dukhan.app';
            content.innerHTML = `
          <div style="background:rgba(255,255,255,0.05); padding:20px; border-radius:12px; margin-bottom:15px;">
            <div style="margin-bottom:10px;">📞 هاتف الدعم: <strong dir="ltr">${phone}</strong></div>
            <div style="margin-bottom:10px;">📧 البريد: <strong>${email}</strong></div>
          </div>`;
        }
    } catch (e) { console.error(e); }
}

// تهيئة القائمة المنسدلة (Dropdown)
function initDropdown() {
    const dropdown = document.getElementById('filterDropdown');
    const selected = document.getElementById('dropdownSelected');
    const menu = document.getElementById('dropdownMenu');

    if (selected && dropdown) {
        selected.onclick = (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        };

        document.querySelectorAll('.dropdown-item').forEach(item => {
            item.onclick = () => {
                document.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                currentFilter = item.dataset.filter;
                selected.querySelector('span').textContent = item.textContent.trim();
                dropdown.classList.remove('open');
                applyFilters();
            };
        });

        window.onclick = () => dropdown.classList.remove('open');
    }
}

// نقطة البداية
document.addEventListener('DOMContentLoaded', () => {
    initDropdown();
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }
    loadData();

    // تسجيل Service Worker للـ PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/js/sw.js')
            .then(() => console.log('✅ Service Worker registered'))
            .catch(err => console.warn('SW error:', err));
    }
});

// تصدير الوظائف التي يتم استدعاؤها من HTML
window.closeVideoAd = closeVideoAd;
window.requestLocation = requestLocation;
window.openPrivacy = openPrivacy;
window.openSupport = openSupport;
window.closeModal = closeModal;
window.loadData = loadData;

// ==========================================
// Firebase Cloud Messaging — إشعارات الدفع
// ==========================================
const _FCM_CONFIG = {
    apiKey: "AIzaSyBleBAXYH7y9KhIEZDVNFNT3UesuIlkGTA",
    authDomain: "dukhan-app.firebaseapp.com",
    projectId: "dukhan-app",
    storageBucket: "dukhan-app.firebasestorage.app",
    messagingSenderId: "771948038238",
    appId: "1:771948038238:web:a442810beedf21fbb84ccf"
};
const _VAPID_KEY = 'BG42d5EwTKEfdJ9zDCAs6GnhxDuirNGGlPg7Ruqdb_aSgk0omD1ALsDJ9VtljQkx_mEDEPcK1NkW9r78wtSe3jc';

async function initPushNotifications() {
    // التحقق من دعم المتصفح للإشعارات
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        console.log('Push Notifications غير مدعومة في هذا المتصفح');
        return;
    }

    try {
        // تهيئة Firebase (مرة واحدة فقط)
        if (!firebase.apps.length) {
            firebase.initializeApp(_FCM_CONFIG);
        }
        const messaging = firebase.messaging();

        // طلب إذن الإشعارات من المستخدم
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('رفض المستخدم إذن الإشعارات');
            return;
        }

        // تسجيل Firebase Service Worker
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

        // الحصول على FCM Token
        const token = await messaging.getToken({ vapidKey: _VAPID_KEY, serviceWorkerRegistration: swReg });
        if (!token) {
            console.warn('لم يتم الحصول على FCM Token');
            return;
        }

        // حفظ الـ Token في Supabase (مرة واحدة فقط إذا تغيّر)
        const savedToken = localStorage.getItem('dukhan_fcm_token');
        if (savedToken !== token) {
            const { error } = await sb.from('push_tokens').upsert(
                { token, platform: 'web', updated_at: new Date().toISOString() },
                { onConflict: 'token' }
            );
            if (!error) {
                localStorage.setItem('dukhan_fcm_token', token);
                console.log('✅ FCM Token محفوظ بنجاح');
            }
        }

        // استقبال الإشعارات عندما يكون التطبيق مفتوحاً (Foreground)
        messaging.onMessage((payload) => {
            const title = payload.notification?.title || 'دخان';
            const body  = payload.notification?.body  || '';
            showToast(`🔔 ${title}: ${body}`, 'info');
        });

    } catch (err) {
        console.warn('خطأ في تهيئة Push Notifications:', err.message);
    }
}

// تشغيل تهيئة الإشعارات بعد تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    // نؤخر طلب الإذن قليلاً حتى لا يتفاجأ المستخدم فور فتح التطبيق
    setTimeout(initPushNotifications, 3000);
});
