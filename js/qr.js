// BT Zone — QR contact card generation + camera scanning
// Uses two small CDN libs loaded in index.html:
//   - qrcode.js (window.QRCode)  -> generate
//   - jsQR (window.jsQR)         -> decode from camera frames
(function () {
  function buildPayload(profile, publicKeyJwk) {
    return JSON.stringify({
      btzone: 1,
      id: profile.id,
      name: profile.name,
      avatar: profile.avatar || null,
      pk: publicKeyJwk || null
    });
  }

  function renderInto(el, profile, publicKeyJwk) {
    el.innerHTML = '';
    if (!window.QRCode) {
      el.textContent = 'QR library unavailable offline on first load.';
      return;
    }
    new window.QRCode(el, {
      text: buildPayload(profile, publicKeyJwk),
      width: 200,
      height: 200,
      colorDark: '#0A0E14',
      colorLight: '#ffffff'
    });
  }

  let stream = null;
  let scanning = false;

  async function startScan(videoEl, canvasEl, onResult, onError) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onError && onError(new Error('Camera not available on this device/browser.'));
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      videoEl.srcObject = stream;
      await videoEl.play();
      scanning = true;
      const ctx = canvasEl.getContext('2d');
      const tick = () => {
        if (!scanning) return;
        if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA && window.jsQR) {
          canvasEl.width = videoEl.videoWidth;
          canvasEl.height = videoEl.videoHeight;
          ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
          const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
          const code = window.jsQR(imageData.data, imageData.width, imageData.height);
          if (code) {
            try {
              const data = JSON.parse(code.data);
              if (data.btzone) {
                stopScan();
                onResult(data);
                return;
              }
            } catch (e) { /* not a BT Zone code, keep scanning */ }
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
      onError && onError(e);
    }
  }

  function stopScan() {
    scanning = false;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }

  window.BTZoneQR = { renderInto, startScan, stopScan, buildPayload };
})();
