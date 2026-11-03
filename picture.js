/* Sign-in picture page (Zonal Admin): upload the picture and set the scrolling line. */
(function () {
  'use strict';
  var esc = Z.esc, $ = Z.$;

  /** Shrink a photo to at most 1600 pixels wide as a JPG, so it loads quickly on phones. */
  function shrink(file, done) {
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 1600 / img.width);
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        done(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { done(null); };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  }

  function page(main) {
    return Promise.all([Z.call('admin.picture'), Z.call('picture')]).then(function (res) {
      var d = res[0], pic = res[1].data;
      main.innerHTML = '<div class="page-head"><h1>Sign-in picture</h1></div><div class="grid md-g2">'
        + '<div class="card pad"><h2>Picture</h2><p class="small muted">Shown on two-thirds of the sign-in screen. A wide photo works best; it is resized to 1600 pixels across before it is saved.</p>'
        + (pic ? '<img src="' + esc(pic) + '" alt="Current sign-in picture" style="width:100%;max-height:260px;object-fit:cover;border-radius:8px;margin:.4rem 0 .8rem">' : '<p class="muted">No picture yet.</p>')
        + '<div id="picMsg"></div><label for="picFile">Choose a picture</label><input type="file" id="picFile" accept="image/jpeg,image/png,image/webp">'
        + (pic ? '<div class="btn-row" style="margin-top:.8rem"><button type="button" class="btn danger small" id="picRemove">Remove picture</button></div>' : '') + '</div>'
        + '<form id="banForm" class="card pad" novalidate><h2>Scrolling line</h2><p class="small muted">Runs across the foot of the picture.</p><div data-form-error></div>'
        + Z.text('banner', 'Text', d.banner, 'maxlength="160"') + '<button class="btn primary" type="submit">Save</button></form></div>';
      $('#picFile').addEventListener('change', function (e) {
        var f = e.target.files[0];
        if (!f) return;
        $('#picMsg').innerHTML = '<div class="notice info">Saving…</div>';
        shrink(f, function (data) {
          if (!data) { $('#picMsg').innerHTML = '<div class="notice bad">That file could not be read as a picture.</div>'; return; }
          Z.call('admin.savePicture', { data: data }).then(function () { Z.state.picture = null; Z.toast('Picture saved.'); Z.route(); })
            .catch(function (err) { $('#picMsg').innerHTML = '<div class="notice bad">' + esc(err.message) + '</div>'; });
        });
      });
      var rm = $('#picRemove');
      if (rm) rm.addEventListener('click', function () { Z.ask({ title: 'Remove the sign-in picture?', message: 'The sign-in page will show the plain background instead. You can upload a picture again at any time.', ok: 'Remove picture', tone: 'danger' }).then(function (yes) { if (yes) Z.call('admin.removePicture').then(function () { Z.state.picture = null; Z.toast('Picture removed.'); Z.route(); }); }); });
      Z.bindForm($('#banForm'), 'admin.saveBanner', null, function () { Z.state.picture = null; Z.toast('Scrolling line saved.'); });
    });
  }

  var find = Views.find;
  Views.find = function (r) { return r.path === '/admin/picture' ? page : find(r); };
})();
