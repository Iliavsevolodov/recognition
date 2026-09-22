(() => {
  const cfg = window.RECOGNITION_CONFIG || {};
  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  let activeType = 'pv500';

  const copy = {
    pv500: {
      kicker: 'Личный объём',
      title: '500 PV',
      description: 'Для признания за личный объём укажи свои данные.'
    },
    qualification: {
      kicker: 'Новое достижение',
      title: 'Квалификация',
      description: 'Укажи данные и выбери новую квалификацию.'
    }
  };

  function toast(message, type = '') {
    const node = $('toast');
    node.textContent = message;
    node.className = `toast show ${type}`.trim();
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.className = 'toast', 2800);
  }

  function setTab(type) {
    activeType = type;
    $('recognitionType').value = type;
    document.querySelectorAll('[data-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === type));
    $('qualificationWrap').classList.toggle('hidden', type !== 'qualification');
    $('qualification').required = type === 'qualification';
    $('formKicker').textContent = copy[type].kicker;
    $('formTitle').textContent = copy[type].title;
    $('formDescription').textContent = copy[type].description;
  }

  document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));

  $('recognitionForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('submitButton');
    const firstName = $('firstName').value.trim();
    const lastName = $('lastName').value.trim();
    const partnerId = $('partnerId').value.trim();
    const qualification = activeType === 'qualification' ? $('qualification').value : null;

    if (!firstName || !lastName || !partnerId || (activeType === 'qualification' && !qualification)) {
      toast('Заполни все поля', 'error');
      return;
    }

    button.disabled = true;
    const old = button.innerHTML;
    button.textContent = 'Отправляем…';
    try {
      const { data, error } = await db.rpc('recognition_submit', {
        p_first_name: firstName,
        p_last_name: lastName,
        p_partner_id: partnerId,
        p_type: activeType,
        p_qualification: qualification
      });
      if (error) throw error;

      db.functions.invoke('recognition-notify', { body: { submission_id: data } }).catch(() => null);

      $('recognitionForm').reset();
      setTab(activeType);
      $('successText').textContent = activeType === 'pv500'
        ? 'Ты добавлен в список признания за личный объём 500 PV.'
        : `Ты добавлен в список признания с квалификацией ${qualification}.`;
      $('successModal').classList.add('open');
      $('successModal').setAttribute('aria-hidden', 'false');
    } catch (error) {
      console.error(error);
      const msg = /DUPLICATE_SUBMISSION/i.test(error?.message || '')
        ? 'Такая заявка уже отправлена'
        : 'Не удалось отправить. Попробуй ещё раз.';
      toast(msg, 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = old;
    }
  });

  $('successClose').addEventListener('click', () => {
    $('successModal').classList.remove('open');
    $('successModal').setAttribute('aria-hidden', 'true');
  });

  setTab('pv500');
})();
