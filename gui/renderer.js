const urlEl = document.getElementById('url');
const selectorEl = document.getElementById('selector');
const outputEl = document.getElementById('output');
const concurrencyEl = document.getElementById('concurrency');
const cbzEl = document.getElementById('cbz');
const usePuppeteerEl = document.getElementById('usePuppeteer');
const autoLoginEl = document.getElementById('autoLogin');
const saveCookiesEl = document.getElementById('saveCookies');
const loadCookiesEl = document.getElementById('loadCookies');
const cookieFileEl = document.getElementById('cookieFile');
const loadBtn = document.getElementById('loadBtn');
const startBtn = document.getElementById('start');
const clearBtn = document.getElementById('clear');
const interactiveAuthEl = document.getElementById('interactiveAuth');
const interactiveOverlay = document.getElementById('interactiveOverlay');
const interactiveCancel = document.getElementById('interactiveCancel');
const statusText = document.getElementById('statusText');
const toggleAdvanced = document.getElementById('toggleAdvanced');
const advancedOptions = document.getElementById('advancedOptions');
const galleryContainer = document.getElementById('galleryContainer');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');

// Lightbox Logic
lightboxClose.addEventListener('click', () => {
  lightbox.classList.remove('active');
  lightboxImg.src = '';
});

lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) {
    lightbox.classList.remove('active');
    lightboxImg.src = '';
  }
});

window.openLightbox = (src) => {
  lightboxImg.src = src;
  lightbox.classList.add('active');
};

// UI Logic
toggleAdvanced.addEventListener('click', () => {
  advancedOptions.classList.toggle('open');
  const isOpen = advancedOptions.classList.contains('open');
  toggleAdvanced.textContent = isOpen ? 'ซ่อนตัวเลือกเพิ่มเติม ▴' : 'ตัวเลือกเพิ่มเติม ▾';
});

function setStatus(text) {
  statusText.textContent = text;
}

function renderGallery(images) {
  if (!images || images.length === 0) {
    galleryContainer.innerHTML = '<div class="gallery-empty">ไม่พบรูปภาพ (หรือถูกกรองออกหมดแล้ว)</div>';
    return;
  }

  let html = '<div class="gallery-grid">';
  images.forEach(img => {
    const safeSrc = img.replace(/'/g, "\\'");
    html += `<div class="gallery-item" onclick="window.openLightbox('${safeSrc}')"><img src="${img}" loading="lazy" /></div>`;
  });
  html += '</div>';
  galleryContainer.innerHTML = html;
}

// Load Images (Preview)
loadBtn.addEventListener('click', async () => {
  const url = urlEl.value.trim();
  if (!url) return alert('กรุณาใส่ลิงก์');

  loadBtn.disabled = true;
  setStatus('กำลังดึงข้อมูลรูปภาพ...');
  galleryContainer.innerHTML = '<div class="gallery-empty" style="color:var(--primary)">กำลังตรวจจับรูปภาพ...</div>';

  try {
    // overlay will be shown when backend signals interactive start; set status now
    if (usePuppeteerEl.checked && interactiveAuthEl && interactiveAuthEl.checked) {
      setStatus('รอการล็อกอินบนเว็บ...');
    }

    const res = await window.mangaAPI.getImages({
      url,
      selector: selectorEl.value.trim() || undefined,
      usePuppeteer: usePuppeteerEl.checked,
      interactiveAuth: interactiveAuthEl && interactiveAuthEl.checked,
      autoLogin: autoLoginEl.checked,
      saveCookies: saveCookiesEl.checked,
      loadCookies: loadCookiesEl.checked,
      cookieFile: cookieFileEl.value.trim() || undefined,
      chromeProfile: undefined,
      autoLoginDomains: undefined
    });

    if (res.success) {
      if (res.title) {
        const safeTitle = res.title.replace(/[<>:"/\\|?*]+/g, '_').trim();
        outputEl.value = `./downloads/${safeTitle}`;
        setStatus(`พบ ${res.images.length} รูป - ชื่อเรื่อง: ${res.title}`);
      } else {
        setStatus(`พบ ${res.images.length} รูป (กรองโฆษณาแล้ว)`);
      }
      renderGallery(res.images);
    } else {
      setStatus('เกิดข้อผิดพลาด: ' + res.error);
      galleryContainer.innerHTML = `<div class="gallery-empty" style="color:red">Error: ${res.error}</div>`;
    }
  } catch (err) {
    setStatus('Error: ' + String(err));
    } finally {
      loadBtn.disabled = false;
    }
});

// Start Download
startBtn.addEventListener('click', async () => {
  const url = urlEl.value.trim();
  if (!url) return alert('กรุณาใส่ลิงก์');

  startBtn.disabled = true;
  loadBtn.disabled = true;
  setStatus('กำลังดาวน์โหลด...');

  try {
    if (usePuppeteerEl.checked && interactiveAuthEl && interactiveAuthEl.checked) {
      setStatus('รอการล็อกอินบนเว็บ...');
    }

    const res = await window.mangaAPI.startDownload({
      url,
      selector: selectorEl.value.trim() || undefined,
      output: outputEl.value.trim() || './downloads',
      concurrency: Number(concurrencyEl.value) || 5,
      cbz: cbzEl.checked,
      usePuppeteer: usePuppeteerEl.checked,
      interactiveAuth: interactiveAuthEl && interactiveAuthEl.checked,
      autoLogin: autoLoginEl.checked,
      saveCookies: saveCookiesEl.checked,
      loadCookies: loadCookiesEl.checked,
      cookieFile: cookieFileEl.value.trim() || undefined,
      chromeProfile: undefined,
      autoLoginDomains: undefined,
    });

    if (!res.success) {
      setStatus('ล้มเหลว: ' + res.error);
    }
  } catch (err) {
    setStatus('Error: ' + String(err));
  }
});

// Cancel interactive overlay
if (interactiveCancel) {
  interactiveCancel.addEventListener('click', () => {
    // hide overlay and notify main (if implemented)
    interactiveOverlay.style.display = 'none';
    setStatus('ยกเลิกการรอการล็อกอิน');
    if (window.mangaAPI && typeof window.mangaAPI.cancelInteractive === 'function') {
      try { window.mangaAPI.cancelInteractive(); } catch (e) { }
    }
  });
}

// Listeners from backend
window.mangaAPI.onLog((text) => {
  if (text.length < 50) setStatus(text.trim());
});

window.mangaAPI.onDone(() => {
  setStatus('ดาวน์โหลดเสร็จสิ้น!');
  startBtn.disabled = false;
  loadBtn.disabled = false;
  if (interactiveOverlay) interactiveOverlay.style.display = 'none';
  alert('ดาวน์โหลดเสร็จสิ้น!');
});

window.mangaAPI.onError((err) => {
  setStatus('Error: ' + err.message);
  startBtn.disabled = false;
  loadBtn.disabled = false;
  if (interactiveOverlay) interactiveOverlay.style.display = 'none';
});

// Show overlay when interactive flow starts; hide when ends
if (window.mangaAPI && typeof window.mangaAPI.onInteractiveStart === 'function') {
  window.mangaAPI.onInteractiveStart(() => {
    if (interactiveOverlay) interactiveOverlay.style.display = 'flex';
    setStatus('รอการล็อกอินบนเว็บ...');
  });
}
if (window.mangaAPI && typeof window.mangaAPI.onInteractiveEnd === 'function') {
  window.mangaAPI.onInteractiveEnd(() => {
    if (interactiveOverlay) interactiveOverlay.style.display = 'none';
    setStatus('ดำเนินการต่อหลังการล็อกอิน...');
  });
}

window.mangaAPI.onPreviewImage((url) => {
  setStatus(`กำลังโหลด: ...${url.slice(-20)}`);
});

clearBtn.addEventListener('click', () => {
  galleryContainer.innerHTML = '<div class="gallery-empty">กรุณาใส่ลิงก์และกด "โหลดข้อมูล" เพื่อดูรูปตัวอย่าง</div>';
  setStatus('รอคำสั่ง...');
  startBtn.disabled = false;
  loadBtn.disabled = false;
});

// Update System Logic
const updateModal = document.getElementById('updateModal');
const updateMsg = document.getElementById('updateMsg');
const btnUpdateNow = document.getElementById('btnUpdateNow');
const btnUpdateLater = document.getElementById('btnUpdateLater');
const updateProgressContainer = document.getElementById('updateProgressContainer');
const updateProgressBar = document.getElementById('updateProgressBar');
const updateProgressText = document.getElementById('updateProgressText');
const updateActions = document.getElementById('updateActions');

window.mangaAPI.onUpdateAvailable((info) => {
  updateMsg.textContent = `เวอร์ชันใหม่ ${info.remote} พร้อมให้อัปเดตแล้ว (ปัจจุบัน ${info.current})`;
  updateModal.classList.add('active');

  // Reset UI
  updateProgressContainer.style.display = 'none';
  updateActions.style.display = 'flex';
  btnUpdateNow.disabled = false;
  btnUpdateLater.disabled = false;

  // Force Update Logic
  if (info.force) {
    btnUpdateLater.style.display = 'none';
    updateMsg.textContent += '\n\nเวอร์ชันนี้เป็นการอัปเดตสำคัญ จำเป็นต้องอัปเดตทันที';
    updateMsg.style.color = 'var(--primary)';
  } else {
    btnUpdateLater.style.display = 'inline-block';
  }
});

window.mangaAPI.onUpdateProgress((progress) => {
  updateProgressContainer.style.display = 'block';
  updateActions.style.display = 'none';

  updateProgressBar.style.width = `${progress.percent}%`;
  updateProgressText.textContent = `${progress.text}`;

  if (progress.percent === 100) {
    updateMsg.textContent = 'ดาวน์โหลดเสร็จสิ้น! กำลังเริ่มติดตั้ง...';
  }
});

// Prevent closing force update modal
document.addEventListener('click', (e) => {
  if (updateModal.classList.contains('active') && btnUpdateLater.style.display === 'none') {
    if (e.target === updateModal) {
      e.stopPropagation();
    }
  }
}, true);

btnUpdateNow.addEventListener('click', async () => {
  updateMsg.textContent = 'กำลังเริ่มดาวน์โหลด...';
  btnUpdateNow.disabled = true;
  if (btnUpdateLater) btnUpdateLater.disabled = true;

  await window.mangaAPI.performUpdate();
});

btnUpdateLater.addEventListener('click', () => {
  updateModal.classList.remove('active');
});

// Ping display
const pingText = document.getElementById('pingText');
function showPing(ms) {
  if (typeof ms !== 'number' || ms < 0) {
    pingText.textContent = 'ping: -- ms';
    pingText.style.color = '#f66';
    return;
  }
  pingText.textContent = `ping: ${ms} ms`;
  if (ms < 100) pingText.style.color = '#8fd';
  else if (ms < 300) pingText.style.color = '#ffb86b';
  else pingText.style.color = '#f66';
}

// Listen for ping updates from main
window.mangaAPI.onPing((ms) => {
  showPing(ms);
});

// Ensure ping loop started (in case main didn't auto-start)
window.mangaAPI.startPing().catch(() => {});
