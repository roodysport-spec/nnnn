/**
 * js/cafe.js - منطق صفحة المقهى
 */

const cafeId = getUrlParam('id');
if (!cafeId) window.location.href = 'index.html';

let currentCategoryId = null;
let allProducts = [];
let carouselIndex = 0;
let carouselSlides = [];
let carouselTimer = null;

async function init() {
    await Promise.all([loadCafe(), loadOffers(), loadMenu(), checkVideoAd()]);
    
    const hero = document.getElementById('cafeHero');
    if (hero) {
        hero.addEventListener('click', function(e) {
            if (e.target.closest('.back-btn') || e.target.closest('.nav-btn')) return;
            this.classList.toggle('expanded');
        });
    }
}

async function checkVideoAd() {
    try {
        const { data: ads, error } = await sb.from('video_ads')
            .select('*')
            .eq('is_active', true)
            .order('order_index', { ascending: true });

        if (error || !ads || ads.length === 0) return;

        const overlayAds = ads.filter(a => ['app_open', 'interstitial', 'video', 'playable'].includes(a.ad_type));
        if (overlayAds.length === 0) return;

        const ad = overlayAds[0];
        const overlay = document.getElementById('videoAdOverlay');
        const player = document.getElementById('videoAdPlayer');
        const imgLink = document.getElementById('imageAdLink');
        const imgAd = document.getElementById('imageAdPlayer');
        const frameAd = document.getElementById('playableAdFrame');
        const badgeLabel = document.getElementById('adLabelBadge');

        if (overlay && !sessionStorage.getItem(`ad_shown_${ad.id}`)) {
            overlay.style.display = 'flex';
            if (badgeLabel) badgeLabel.textContent = "إعلان ممول";

            // Hide all placeholders first
            if (player) player.style.display = 'none';
            if (imgLink) imgLink.style.display = 'none';
            if (frameAd) frameAd.style.display = 'none';

            if (ad.media_type === 'video' && player) {
                player.style.display = 'block';
                player.src = ad.video_url;
                player.muted = true; 
                player.playsinline = true;
                player.setAttribute('webkit-playsinline', 'true');
                player.play().catch(err => {
                    console.warn("Autoplay blocked, waiting for interaction", err);
                    player.controls = true;
                });
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

            sessionStorage.setItem(`ad_shown_${ad.id}`, 'true');
            refreshIcons();
        }
    } catch (err) { console.error("Ad error:", err); }
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

async function loadCafe() {
    const { data: cafe, error } = await sb.from('cafes').select('*').eq('id', cafeId).single();
    if (error || !cafe) { 
        handleSupabaseError(error, "فشل تحميل بيانات المقهى");
        window.location.href = 'index.html'; 
        return; 
    }

    document.title = `${cafe.name} — دخان`;

    if (cafe.cover_url) {
        const heroDefault = document.getElementById('heroDefault');
        if (heroDefault) heroDefault.style.display = 'none';
        
        const hero = document.getElementById('cafeHero');
        const img = document.createElement('img');
        img.src = cafe.cover_url; img.className = 'cafe-hero-img'; img.alt = cafe.name;
        if (hero) hero.insertBefore(img, hero.firstChild);
    }

    const logoEl = document.getElementById('cafeLogo');
    if (cafe.logo_url && logoEl) {
        logoEl.innerHTML = `<img src="${cafe.logo_url}" alt="${cafe.name}" style="width:100%;height:100%;object-fit:cover;">`;
    }

    const nameEl = document.getElementById('cafeName');
    if (nameEl) nameEl.textContent = cafe.name;

    // Render Features
    const featuresMap = {
        'parking': { label: 'كراج مجاني', icon: 'car' },
        'wifi': { label: 'واي فاي', icon: 'wifi' },
        'fast_service': { label: 'خدمة سريعة', icon: 'zap' },
        'tv': { label: 'شاشة', icon: 'monitor' },
        'ac': { label: 'مكان بارد', icon: 'snowflake' }
    };

    let featuresArr = [];
    if (cafe.features) {
        if (Array.isArray(cafe.features)) {
            featuresArr = cafe.features;
        } else if (typeof cafe.features === 'string') {
            try { featuresArr = JSON.parse(cafe.features); }
            catch { featuresArr = cafe.features.replace(/[{}"]/g, '').split(',').map(s => s.trim()); }
        }
    }

    if (featuresArr.length > 0) {
        let featuresHTML = '<div class="features-row">';
        featuresArr.forEach(fKey => {
            const f = featuresMap[fKey];
            if (f) {
                featuresHTML += `<div class="feature-badge"><i data-lucide="${f.icon}"></i>${f.label}</div>`;
            }
        });
        featuresHTML += '</div>';
        const fCont = document.getElementById('featuresContainer');
        if (fCont) { fCont.innerHTML = featuresHTML; refreshIcons(); }
    }

    const descEl = document.getElementById('cafeDesc');
    const descCont = document.getElementById('cafeDescContainer');
    if (cafe.description && descEl && descCont) {
        descEl.textContent = cafe.description;
        descCont.style.display = 'block';
    } else if (descCont) {
        descCont.style.display = 'none';
    }

    let metaHTML = "";
    const finalMapUrl = cafe.map_url || (cafe.lat && cafe.lng ? `https://www.google.com/maps?q=${cafe.lat},${cafe.lng}` : null);

    if (cafe.address) {
        metaHTML += `<div class="cafe-meta-item"><i data-lucide="map-pin" style="width:16px;"></i> ${cafe.address} ${finalMapUrl ? `<a href="${finalMapUrl}" target="_blank">(الخريطة)</a>` : ""}</div>`;
    } else if (finalMapUrl) {
        metaHTML += `<div class="cafe-meta-item"><i data-lucide="map-pin" style="width:16px;"></i> <a href="${finalMapUrl}" target="_blank">رؤية الموقِع على الخريطة</a></div>`;
    }

    if (finalMapUrl) {
        const navBtn = document.getElementById('navigateBtn');
        if (navBtn) {
            navBtn.href = finalMapUrl;
            navBtn.style.display = 'inline-flex';
        }
        const btnsRow = document.getElementById('cafeBtnsRow');
        if (btnsRow) btnsRow.style.display = 'flex';
    }

    if (cafe.promo_video_url) {
        const vBtn = document.getElementById('promoVideoBtn');
        if (vBtn) vBtn.style.display = 'inline-flex';
        window.__promoVideoUrl = cafe.promo_video_url;
        const btnsRow = document.getElementById('cafeBtnsRow');
        if (btnsRow) btnsRow.style.display = 'flex';
    }

    const bookBtn = document.getElementById('bookBtn');
    if (bookBtn) bookBtn.style.display = 'inline-flex';
    const btnsRow = document.getElementById('cafeBtnsRow');
    if (btnsRow) btnsRow.style.display = 'flex';

    if (cafe.working_hours) metaHTML += `<div class="cafe-meta-item"><i data-lucide="clock" style="width:16px;"></i> ${cafe.working_hours}</div>`;
    if (cafe.phone) metaHTML += `<div class="cafe-meta-item"><i data-lucide="phone" style="width:16px;"></i> <span dir="ltr">${cafe.phone}</span></div>`;

    const metaEl = document.getElementById('cafeMeta');
    if (metaEl) metaEl.innerHTML = metaHTML;
    
    window.__cafeOwnerId = cafe.owner_id;
    window.__cafeName = cafe.name;
    refreshIcons();
}

async function loadOffers() {
    try {
        const d = new Date();
        const now = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const { data: offers } = await sb.from('offers').select('*').eq('cafe_id', cafeId).eq('is_active', true);
        if (!offers || !offers.length) return;

        const active = offers.filter(o => {
            if (!o.start_date && !o.end_date) return true;
            if (o.start_date && o.end_date) return now >= o.start_date && now <= o.end_date;
            if (o.start_date) return now >= o.start_date;
            if (o.end_date) return now <= o.end_date;
            return true;
        });

        if (!active.length) return;
        const offSection = document.getElementById('offersSection');
        if (offSection) offSection.style.display = 'block';
        
        carouselSlides = active;
        const track = document.getElementById('carouselTrack');
        if (track) {
            track.innerHTML = active.map(o => `
                <div class="carousel-slide">
                  <img src="${o.image_url}" alt="${o.title || 'عرض'}">
                  ${o.title ? `<div class="carousel-overlay"><div class="carousel-title">${o.title}</div></div>` : ''}
                </div>
            `).join('');
        }
        
        const dots = document.getElementById('carouselDots');
        if (dots) {
            dots.innerHTML = active.map((_, i) => `<div class="dot ${i === 0 ? 'active' : ''}" onclick="goToSlide(${i})"></div>`).join('');
        }
        
        if (active.length > 1) startCarouselAuto();
        refreshIcons();
    } catch (err) { console.error(err); }
}

function moveCarousel(dir) {
    if (!carouselSlides.length) return;
    carouselIndex = (carouselIndex + dir + carouselSlides.length) % carouselSlides.length;
    applyCarousel();
}

function goToSlide(i) { 
    carouselIndex = i; 
    applyCarousel(); 
}

function applyCarousel() {
    const track = document.getElementById('carouselTrack');
    if (track) track.style.transform = `translateX(${carouselIndex * 100}%)`;
    document.querySelectorAll('#carouselDots .dot').forEach((d, i) => d.classList.toggle('active', i === carouselIndex));
}

function startCarouselAuto() { 
    clearInterval(carouselTimer); 
    carouselTimer = setInterval(() => moveCarousel(-1), 4500); 
}

async function loadMenu() {
    const [{ data: categories }, { data: products }] = await Promise.all([
        sb.from('categories').select('*').eq('cafe_id', cafeId).order('order_index'),
        sb.from('products').select('*').eq('cafe_id', cafeId).eq('is_available', true)
    ]);

    const loading = document.getElementById('menuLoading');
    if (loading) loading.style.display = 'none';
    
    const content = document.getElementById('menuContent');
    if (content) content.style.display = 'block';
    
    allProducts = products || [];
    let cats = categories || [];

    // Category sorting
    cats.sort((a, b) => {
        const getPos = (name) => {
            if (!name) return 99;
            if (name.includes('أراكيل') || name.includes('اراكيل')) return 0;
            if (name.includes('مشروبات باردة')) return 1;
            if (name.includes('مشروبات حارة')) return 2;
            if (name.includes('ماكولات') || name.includes('مأكولات')) return 3;
            if (name.includes('تحلية')) return 4;
            return 99;
        };
        return getPos(a.name) - getPos(b.name);
    });

    if (!cats.length && !allProducts.length) {
        const grid = document.getElementById('productsGrid');
        if (grid) {
            grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i data-lucide="coffee"></i><h3>المنيو قيد التجهيز</h3><p>سيتوفر المنيو قريباً جداً</p></div>`;
        }
        refreshIcons(); return;
    }

    const tabs = document.getElementById('catTabs');
    if (tabs) {
        if (!cats.length) {
            tabs.innerHTML = '';
        } else {
            tabs.innerHTML = cats.map((c, i) => {
                let iconName = 'coffee';
                if (c.name.includes('حارة')) iconName = 'flame';
                else if (c.name.includes('باردة')) iconName = 'snowflake';
                else if (c.name.includes('راكيل')) iconName = 'wind';
                else if (c.name.includes('كولات')) iconName = 'utensils';
                else if (c.name.includes('تحلية')) iconName = 'cake-slice';

                return `<button class="cat-tab ${i === 0 ? 'active' : ''}" data-cat="${c.id}" onclick="selectCategory('${c.id}')">
                <span class="cat-icon"><i data-lucide="${iconName}"></i></span>
                <span>${c.name}</span>
              </button>`;
            }).join('');
        }
    }

    if (cats.length > 0) {
        selectCategory(cats[0].id);
    } else {
        renderProducts('all');
    }
}

function selectCategory(catId) {
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === catId));
    renderProducts(catId);
}

function renderProducts(catId) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    const filtered = catId === 'all' ? allProducts : allProducts.filter(p => p.category_id === catId);

    if (!filtered.length) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i data-lucide="frown"></i><h3>لا توجد منتجات حالياً</h3></div>`;
        refreshIcons(); return;
    }

    grid.innerHTML = filtered.map(p => `
      <div class="product-card ${p.display_size === 'large' ? 'large' : ''}">
        ${p.image_url
            ? `<img src="${p.image_url}" class="product-img" alt="${p.name}" loading="lazy" onclick="openLightbox('${p.image_url}','${p.name.replace(/'/g, "&apos;")}')">`
            : `<div class="product-img"><i data-lucide="coffee" style="width:40px;height:40px;opacity:0.2;"></i></div>`}
        <div class="product-info">
          <div class="product-name">${p.name}</div>
          ${p.description ? `<div class="product-desc">${p.description}</div>` : ''}
          <div class="product-price">${Number(p.price).toLocaleString('ar-IQ')} د.ع</div>
        </div>
      </div>
    `).join('');
    refreshIcons();
}

// === Booking Logic ===
function openBookingModal() { 
    const modal = document.getElementById('bookingModal');
    if (modal) modal.style.display = 'flex'; 
}

function closeBookingModal() { 
    const modal = document.getElementById('bookingModal');
    if (modal) modal.style.display = 'none'; 
}

async function submitBooking() {
    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    if (!name || !phone) { showToast("يرجى إكمال البيانات", "warning"); return; }

    const btn = document.getElementById('confirmBookingBtn');
    if (btn) {
        btn.disabled = true; btn.textContent = 'جارٍ الإرسال...';
    }

    try {
        const { error } = await sb.from('bookings').insert([{
            cafe_id: cafeId,
            customer_name: name,
            customer_phone: phone,
            status: 'pending'
        }]);

        if (error) throw error;

        // إرسال إشعار فوري لصاحب المقهى
        if (window.__cafeOwnerId) {
            await sendPushNotification(window.__cafeOwnerId, window.__cafeName, name);
        }

        showToast("✅ تم إرسال طلب الحجز بنجاح! سيتم إخطار صاحب المقهى.", "success");
        closeBookingModal();
        const form = document.getElementById('bookingForm');
        if (form) form.reset();
    } catch (err) {
        showToast("فشل إرسال الحجز: " + err.message, "error");
    } finally {
        if (btn) {
            btn.disabled = false; btn.textContent = 'إرسال طلب الحجز';
        }
    }
}

async function sendPushNotification(ownerId, cafeName, customerName) {
    try {
        const { data, error } = await sb.functions.invoke('send-notification', {
            body: {
                topic: "owner_" + ownerId,
                title: `حجز جديد في ${cafeName}! ☕`,
                body: `الزبون ${customerName} بانتظار التأكيد.`,
                data: { click_action: "FLUTTER_NOTIFICATION_CLICK", type: "new_booking" }
            }
        });
        if (error) throw error;
    } catch (e) { 
        console.warn("FCM Error via Edge Function:", e); 
    }
}

function openPromoVideo() {
    if (!window.__promoVideoUrl) return;
    const overlay = document.getElementById('promoVideoOverlay');
    const player = document.getElementById('promoVideoPlayer');

    // Update title with cafe name
    if (window.__cafeName) {
        const title = document.getElementById('promoVideoTitle');
        if (title) title.textContent = 'فيديو ' + window.__cafeName;
    }

    if (player && overlay) {
        player.src = window.__promoVideoUrl;
        overlay.style.display = 'flex';
        player.play().catch(() => {
            player.controls = true;
        });
        refreshIcons();
    }
}

function closePromoVideo() {
    const overlay = document.getElementById('promoVideoOverlay');
    const player = document.getElementById('promoVideoPlayer');
    if (player) player.pause();
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.style.opacity = '1';
            if (player) player.src = '';
        }, 300);
    }
}

// === Image Lightbox ===
function openLightbox(url, caption) {
    let lb = document.getElementById('imgLightbox');
    if (!lb) {
        lb = document.createElement('div');
        lb.id = 'imgLightbox';
        lb.innerHTML = `
        <button class="lb-close" onclick="closeLightbox(event)">✕</button>
        <img id="lbImg" src="" alt="">
        <div class="lb-caption" id="lbCaption"></div>
      `;
        lb.addEventListener('click', function(e) {
            if (e.target === lb) closeLightbox(e);
        });
        document.body.appendChild(lb);
    }
    const img = document.getElementById('lbImg');
    const cap = document.getElementById('lbCaption');
    if (img) img.src = url;
    if (cap) cap.textContent = caption || '';
    lb.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeLightbox(e) {
    if (e) e.stopPropagation();
    const lb = document.getElementById('imgLightbox');
    if (lb) {
        lb.style.display = 'none';
        document.body.style.overflow = '';
    }
}

// نقطة البداية
document.addEventListener('DOMContentLoaded', () => {
    init();
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeLightbox(null);
});

// تصدير الوظائف التي يتم استدعاؤها من HTML
window.closeVideoAd = closeVideoAd;
window.openBookingModal = openBookingModal;
window.closeBookingModal = closeBookingModal;
window.submitBooking = submitBooking;
window.moveCarousel = moveCarousel;
window.goToSlide = goToSlide;
window.selectCategory = selectCategory;
window.openPromoVideo = openPromoVideo;
window.closePromoVideo = closePromoVideo;
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;
