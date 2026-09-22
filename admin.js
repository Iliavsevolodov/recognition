(() => {
  const cfg = window.RECOGNITION_CONFIG || {};
  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  const qualifications = ['S1','S2','L','L1 PRO','L2','L2 PRO','L3','L3 PRO'];
  let password = sessionStorage.getItem('recognition_admin_password') || '';
  let rows = [];
  let stats = {};
  let editId = null;

  function toast(message, type = '') {
    const node = $('toast');
    node.textContent = message;
    node.className = `toast show ${type}`.trim();
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.className = 'toast', 2600);
  }

  async function rpc(name, args = {}) {
    const { data, error } = await db.rpc(name, args);
    if (error) throw error;
    return data;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function showLogin() {
    $('adminLogin').classList.remove('hidden');
    $('adminApp').classList.add('hidden');
  }

  function showApp() {
    $('adminLogin').classList.add('hidden');
    $('adminApp').classList.remove('hidden');
  }

  async function validatePassword(value) {
    const ok = await rpc('recognition_admin_login', { p_password: value });
    if (!ok) throw new Error('INVALID_PASSWORD');
  }

  async function loadAll() {
    try {
      const [listData, statsData] = await Promise.all([
        rpc('recognition_admin_list', { p_password: password }),
        rpc('recognition_admin_stats', { p_password: password })
      ]);
      rows = Array.isArray(listData) ? listData : [];
      stats = statsData || {};
      renderStats();
      renderList();
    } catch (error) {
      console.error(error);
      if (/ADMIN_ONLY|INVALID_PASSWORD/i.test(error?.message || '')) {
        password = '';
        sessionStorage.removeItem('recognition_admin_password');
        showLogin();
      } else {
        toast('Не удалось загрузить данные', 'error');
      }
    }
  }

  function renderStats() {
    $('totalCount').textContent = stats.total || 0;
    $('pvCount').textContent = stats.pv500 || 0;
    $('qualCount').textContent = stats.qualification_total || 0;
    const q = stats.qualifications || {};
    $('qualificationStats').innerHTML = qualifications.map(name => `
      <article class="qualification-stat ${Number(q[name] || 0) ? 'has-value' : ''}">
        <span>${esc(name)}</span><strong>${Number(q[name] || 0)}</strong><small>грамот</small>
      </article>`).join('');
  }

  function filteredRows() {
    const q = $('searchInput').value.trim().toLowerCase();
    const type = $('typeFilter').value;
    const qualification = $('qualificationFilter').value;
    return rows.filter(row => {
      const haystack = `${row.last_name} ${row.first_name} ${row.partner_id}`.toLowerCase();
      if (q && !haystack.includes(q)) return false;
      if (type !== 'all' && row.recognition_type !== type) return false;
      if (qualification !== 'all' && row.qualification !== qualification) return false;
      return true;
    });
  }

  function renderList() {
    const list = filteredRows();
    $('filteredCount').textContent = `${list.length} ${list.length === 1 ? 'запись' : 'записей'}`;
    if (!list.length) {
      $('submissionsList').innerHTML = '<div class="empty-state">По этому фильтру пока ничего нет</div>';
      return;
    }
    $('submissionsList').innerHTML = list.map(row => {
      const achievement = row.recognition_type === 'pv500' ? '500 PV' : row.qualification;
      const date = new Date(row.created_at).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      return `<article class="submission-row">
        <div class="submission-main">
          <div class="submission-name">${esc(row.last_name)} ${esc(row.first_name)}</div>
          <div class="submission-meta"><span>ID ${esc(row.partner_id)}</span><span>${date}</span></div>
        </div>
        <div class="achievement-badge ${row.recognition_type === 'pv500' ? 'pv' : 'qual'}">${esc(achievement)}</div>
        <div class="notify-dot ${row.notified_at ? 'sent' : 'pending'}" title="${row.notified_at ? 'Telegram: отправлено' : 'Telegram: ожидает настройки/отправки'}"></div>
        <div class="row-actions">
          <button type="button" data-edit="${row.id}" title="Редактировать">✎</button>
          <button type="button" data-delete="${row.id}" class="danger" title="Удалить">×</button>
        </div>
      </article>`;
    }).join('');
  }

  function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    return Promise.resolve();
  }

  function buildListText(list) {
    return list.map((row, index) => {
      const achievement = row.recognition_type === 'pv500' ? '500 PV' : row.qualification;
      return `${index + 1}. ${row.last_name} ${row.first_name} — ID ${row.partner_id} — ${achievement}`;
    }).join('\n');
  }

  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const btn = $('loginButton');
    btn.disabled = true;
    try {
      const value = $('adminPassword').value;
      await validatePassword(value);
      password = value;
      sessionStorage.setItem('recognition_admin_password', value);
      $('adminPassword').value = '';
      showApp();
      await loadAll();
    } catch (error) {
      console.error(error);
      toast('Неверный пароль', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('logoutButton').addEventListener('click', () => {
    password = '';
    sessionStorage.removeItem('recognition_admin_password');
    showLogin();
  });

  ['searchInput','typeFilter','qualificationFilter'].forEach(id => {
    $(id).addEventListener(id === 'searchInput' ? 'input' : 'change', renderList);
  });

  $('copyList').addEventListener('click', async () => {
    const list = filteredRows();
    if (!list.length) return toast('Список по фильтру пуст', 'error');
    await copyText(buildListText(list));
    toast('Список скопирован ✓');
  });

  $('copyStats').addEventListener('click', async () => {
    const q = stats.qualifications || {};
    const text = ['Грамоты по квалификациям:', ...qualifications.map(name => `${name}: ${Number(q[name] || 0)}`), '', `500 PV: ${Number(stats.pv500 || 0)}`, `Всего заявок: ${Number(stats.total || 0)}`].join('\n');
    await copyText(text);
    toast('Сводка скопирована ✓');
  });

  $('exportCsv').addEventListener('click', () => {
    const list = filteredRows();
    if (!list.length) return toast('Список по фильтру пуст', 'error');
    const csv = ['Фамилия;Имя;ID;Достижение;Дата', ...list.map(row => {
      const achievement = row.recognition_type === 'pv500' ? '500 PV' : row.qualification;
      return [row.last_name,row.first_name,row.partner_id,achievement,new Date(row.created_at).toLocaleString('ru-RU')]
        .map(value => `"${String(value ?? '').replace(/"/g,'""')}"`).join(';');
    })].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recognition-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.addEventListener('click', async event => {
    const edit = event.target.closest('[data-edit]');
    if (edit) {
      const row = rows.find(x => x.id === edit.dataset.edit);
      if (!row) return;
      editId = row.id;
      $('editLastName').value = row.last_name;
      $('editFirstName').value = row.first_name;
      $('editPartnerId').value = row.partner_id;
      $('editType').value = row.recognition_type;
      $('editQualification').value = row.qualification || 'S1';
      syncEditQualification();
      $('editModal').classList.add('open');
      $('editModal').setAttribute('aria-hidden','false');
      return;
    }

    const del = event.target.closest('[data-delete]');
    if (del) {
      const row = rows.find(x => x.id === del.dataset.delete);
      if (!row || !confirm(`Удалить заявку ${row.last_name} ${row.first_name}?`)) return;
      del.disabled = true;
      try {
        await rpc('recognition_admin_delete', { p_password: password, p_id: row.id });
        toast('Заявка удалена');
        await loadAll();
      } catch (error) {
        console.error(error);
        toast('Не удалось удалить заявку', 'error');
        del.disabled = false;
      }
    }
  });

  function syncEditQualification() {
    $('editQualificationWrap').classList.toggle('hidden', $('editType').value !== 'qualification');
  }
  $('editType').addEventListener('change', syncEditQualification);
  $('editClose').addEventListener('click', closeEdit);
  $('editModal').addEventListener('click', event => { if (event.target === $('editModal')) closeEdit(); });
  function closeEdit() {
    editId = null;
    $('editModal').classList.remove('open');
    $('editModal').setAttribute('aria-hidden','true');
  }

  $('editForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!editId) return;
    const button = event.submitter;
    button.disabled = true;
    try {
      await rpc('recognition_admin_update', {
        p_password: password,
        p_id: editId,
        p_first_name: $('editFirstName').value.trim(),
        p_last_name: $('editLastName').value.trim(),
        p_partner_id: $('editPartnerId').value.trim(),
        p_type: $('editType').value,
        p_qualification: $('editType').value === 'qualification' ? $('editQualification').value : null
      });
      closeEdit();
      toast('Изменения сохранены ✓');
      await loadAll();
    } catch (error) {
      console.error(error);
      toast(/DUPLICATE_SUBMISSION/i.test(error?.message || '') ? 'Такая заявка уже существует' : 'Не удалось сохранить', 'error');
    } finally {
      button.disabled = false;
    }
  });

  async function init() {
    if (!password) return showLogin();
    try {
      await validatePassword(password);
      showApp();
      await loadAll();
    } catch (_) {
      password = '';
      sessionStorage.removeItem('recognition_admin_password');
      showLogin();
    }
  }

  init();
})();
