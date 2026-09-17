// BT Zone — QR contact card generation + camera scanning
// Uses two small CDN libs loaded in index.html:
//   - qrcode.js (window.QRCode)  -> generate
//   - jsQR (window.jsQR)         -> decode from camera frames
(function () {
  function buildPayload(profile, publicKeyJwk) {
    // Deliberately excludes avatar — a full image data: URL is many KB,
    // far beyond what any QR code can hold. Avatars sync separately once
    // two devices actually connect and exchange a handshake packet.
    return JSON.stringify({
      btzone: 1,
      id: profile.id,
      name: profile.name,
      pk: publicKeyJwk || null
    });
  }

  // qrcodejs (vendor/qrcode.min.js) defaults to typeNumber 4 with the
  // highest error-correction level, which only holds ~34 bytes — nowhere
  // near enough once a public key is included. We explicitly request a
  // larger, lower-error-correction code sized for our payload, and if
  // it *still* overflows (e.g. a very long name), we fall back to a
  // minimal payload rather than showing nothing at all — the recipient
  // can still add the contact; encryption keys then exchange the normal
  // way once the devices actually connect.
  function renderInto(el, profile, publicKeyJwk) {
    el.innerHTML = '';
    if (!window.QRCode) {
      el.textContent = 'QR library unavailable offline on first load.';
      return;
    }
    const opts = { width: 220, height: 220, colorDark: '#0A0E14', colorLight: '#ffffff', typeNumber: 15, correctLevel: window.QRCode.CorrectLevel.L };
    try {
      new window.QRCode(el, Object.assign({ text: buildPayload(profile, publicKeyJwk) }, opts));
    } catch (e) {
      console.error('QR overflow with full payload, retrying without public key', e);
      el.innerHTML = '';
      try {
        new window.QRCode(el, Object.assign({ text: buildPayload(profile, null) }, opts));
      } catch (e2) {
        console.error('QR still overflowed with minimal payload', e2);
        el.innerHTML = '';
        el.textContent = 'Could not generate QR code — display name may be too long.';
      }
    }
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
