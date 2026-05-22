// =============================================
// دخان - Supabase Configuration
// =============================================

const SUPABASE_URL = 'https://tvtineaabsgnlduqflsf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2dGluZWFhYnNnbmxkdXFmbHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MjU2NDUsImV4cCI6MjA5MDEwMTY0NX0.Em6Ql1R3Hhh78qHVdCEKLW9MpylE2RzTs1C5mOmqJyk';
const STORAGE_BUCKET = 'qahwati';

// تهيئة Supabase
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =============================================
// دوال مساعدة للصور
// =============================================

/**
 * ضغط الصورة باستخدام HTML5 Canvas لتقليل حجمها قبل الرفع
 */
function compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return resolve(file);
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

async function uploadImage(file, folder, onProgress = null) {
  if (!file) return null;
  
  let fileToUpload = file;
  if (file.type.startsWith('image/')) {
    try {
      fileToUpload = await compressImage(file, 1200, 1200, 0.8);
    } catch (e) {
      console.warn('فشل ضغط الصورة، سيتم الرفع بالحجم الأصلي:', e);
    }
  }

  const ext = fileToUpload.name.split('.').pop() || 'jpg';
  const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
  
  const { data, error } = await sb.storage.from(STORAGE_BUCKET).upload(fileName, fileToUpload, {
    cacheControl: '3600',
    upsert: false,
    onUploadProgress: (progress) => {
      if (onProgress) {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        onProgress(percent);
      }
    }
  });
  
  if (error) { 
    console.error('خطأ في رفع الملف:', error); 
    return null; 
  }
  
  const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
  return urlData.publicUrl;
}

/**
 * حذف صورة من Supabase Storage
 * @param {string} url - رابط الصورة
 */
async function deleteImage(url) {
  if (!url) return;
  try {
    const path = url.split(`/${STORAGE_BUCKET}/`)[1];
    if (path) await sb.storage.from(STORAGE_BUCKET).remove([path]);
  } catch (e) { console.warn('تعذر حذف الصورة', e); }
}

/**
 * الحصول على المستخدم الحالي
 */
async function getCurrentUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

/**
 * الحصول على ملف تعريف المستخدم
 */
async function getUserProfile(userId) {
  const { data } = await sb.from('profiles').select('*').eq('id', userId).single();
  return data;
}
