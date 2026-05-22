/**
 * js/utils.js - وظائف عامة مشتركة
 */

// تهيئة Lucide Icons
function refreshIcons() {
    if (window.lucide) {
        window.lucide.createIcons();
    } else {
        setTimeout(refreshIcons, 100);
    }
}

// إظهار تنبيه (Toast)
function showToast(msg, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const icons = { 
        success: '✅', 
        error: '❌', 
        warning: '⚠️', 
        info: 'ℹ️' 
    };
    
    // Support for Lucide icons in toast if preferred
    const lucideIcons = {
        success: '<i class="lucide-check-circle"></i>', 
        error: '<i class="lucide-alert-circle"></i>', 
        info: '<i class="lucide-info"></i>',
        warning: '<i class="lucide-alert-triangle"></i>'
    };

    const el = document.createElement('div');
    el.className = `toast ${type}`;
    
    // Check if we should use emoji or lucide (owner.html uses lucide)
    const iconContent = window.lucide ? (lucideIcons[type] || lucideIcons.info) : (icons[type] || icons.info);
    
    el.innerHTML = `<div class="toast-icon">${iconContent}</div> <div class="toast-msg">${msg}</div>`;
    
    container.prepend(el);
    
    if (window.lucide) refreshIcons();

    // إزالة التنبيه بعد 3.5 ثوانٍ
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-20px)';
        setTimeout(() => el.remove(), 500);
    }, 4500);
}

// حساب المسافة بين نقطتين (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371; // نصف قطر الأرض بالكيلومترات
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// الحصول على المعاملات من الرابط (URL Parameters)
function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

// إغلاق المودال
function closeModal(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none'; 
}

// معاينة الصور والفيديوهات
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

function previewVideo(input, previewId, statusId = null) {
    const preview = document.getElementById(previewId);
    const status = statusId ? document.getElementById(statusId) : null;
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.size > 50 * 1024 * 1024) { // 50MB Limit
            showToast("حجم الفيديو كبير جداً، يرجى اختيار فيديو أقل من 50 ميجابايت", "warning");
            input.value = ""; return;
        }
        const url = URL.createObjectURL(file);
        preview.src = url;
        preview.style.display = 'block';
        if (status) status.style.display = 'none';
    }
}

function previewImageURL(url, previewId) {
    const img = document.getElementById(previewId);
    if (img) {
        img.src = url;
        img.style.display = 'block';
    }
}

// وظيفة مركزية لمعالجة أخطاء Supabase
function handleSupabaseError(error, customMsg = "حدث خطأ أثناء تحميل البيانات") {
    if (!error) return false;
    console.error("Supabase Error:", error);
    
    let msg = customMsg;
    if (error.message && error.message.includes("failed to fetch")) {
        msg = "⚠️ انقطع الاتصال بالإنترنت، يرجى التحقق من الشبكة.";
    } else if (error.code === 'PGRST116') {
        msg = "🔍 لم يتم العثور على البيانات المطلوبة.";
    }
    
    showToast(msg, "error");
    return true;
}

// تصدير الوظائف للنافذة العالمية (Global Window)
window.refreshIcons = refreshIcons;
window.showToast = showToast;
window.calculateDistance = calculateDistance;
window.getUrlParam = getUrlParam;
window.closeModal = closeModal;
window.previewImg = previewImg;
window.previewVideo = previewVideo;
window.previewImageURL = previewImageURL;
window.handleSupabaseError = handleSupabaseError;
