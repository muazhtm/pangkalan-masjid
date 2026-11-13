(function () {
  // Pengesahan sebelum padam (ganti onsubmit inline, kerana CSP)
  document.addEventListener('submit', function (e) {
    var f = e.target;
    var msg = f.getAttribute && f.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });
  document.querySelectorAll('[data-back]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); history.back(); });
  });

  // Tapis Senarai terus bila pilihan berubah
  document.querySelectorAll('form[data-autosubmit]').forEach(function (f) {
    f.addEventListener('change', function (e) { if (e.target.type !== 'search') f.submit(); });
  });

  // Nama fail dipilih
  document.querySelectorAll('.file-btn input[type=file]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var out = document.getElementById('fail-nama') || document.getElementById('foto-prev');
      if (!out) return;
      var names = Array.prototype.map.call(inp.files, function (f) { return f.name + ' (' + (f.size / 1048576).toFixed(1) + ' MB)'; });
      out.textContent = names.length ? 'Dipilih: ' + names.join(', ') : '';
    });
  });

  // Ukuran lawatan (kaki): jumlah kaki persegi automatik
  var rows = document.getElementById('ukuran-rows');
  if (rows) {
    var out = document.getElementById('jumlah-luas');
    var total = function () {
      var sum = 0;
      rows.querySelectorAll('.urow').forEach(function (r) {
        var p = parseFloat(r.querySelector('[name=u_panjang]').value);
        var l = parseFloat(r.querySelector('[name=u_lebar]').value);
        if (p > 0 && l > 0) sum += p * l;
      });
      out.textContent = (Math.round(sum * 100) / 100).toLocaleString('en-US');
    };
    document.getElementById('add-ukuran').addEventListener('click', function () {
      var clone = rows.querySelector('.urow').cloneNode(true);
      clone.querySelectorAll('input').forEach(function (i) { i.value = ''; });
      rows.appendChild(clone);
      clone.querySelector('input').focus();
    });
    rows.addEventListener('input', total);
  }

  // Dokumen: cadangan status ikut jenis, pilihan "cucian terakhir" hanya untuk invois/laporan
  var dok = document.querySelector('form[data-dok]');
  if (dok) {
    var sel = document.getElementById('dok-status');
    var kc = document.getElementById('kemas-cuci');
    var sync = function (fromUser) {
      var r = dok.querySelector('input[name=jenis]:checked');
      if (!r) return;
      if (fromUser) sel.value = r.getAttribute('data-cadang') || '';
      kc.style.display = r.value === 'Quotation' ? 'none' : '';
    };
    dok.addEventListener('change', function (e) { if (e.target.name === 'jenis') sync(true); });
    sync(false);
  }

  // Borang barang: papar medan ikut jenis (Karpet / Vacuum)
  var bf = document.querySelector('form[data-barang]');
  if (bf) {
    var syncB = function () {
      var j = (bf.querySelector('input[name=jenis]:checked') || {}).value;
      bf.querySelectorAll('[data-k]').forEach(function (el) { el.style.display = j === 'Karpet' ? '' : 'none'; });
      bf.querySelectorAll('[data-v]').forEach(function (el) { el.style.display = j === 'Vacuum' ? '' : 'none'; });
    };
    bf.addEventListener('change', syncB);
    syncB();
  }

  // Pratonton mesej WhatsApp di Tetapan
  var pengirim = document.querySelector('input[name=penghantar]');
  document.querySelectorAll('textarea[data-preview]').forEach(function (ta) {
    var box = ta.parentNode.nextElementSibling;
    var draw = function () {
      box.textContent = 'Pratonton: ' + ta.value
        .split('[PIC]').join('Ustaz Ahmad')
        .split('[penghantar]').join(pengirim.value || '')
        .split('[masjid]').join('Surau Al-Hidayah');
    };
    ta.addEventListener('input', draw);
    pengirim.addEventListener('input', draw);
    draw();
  });
})();
