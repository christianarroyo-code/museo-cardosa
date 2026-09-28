'use strict';

/* =========================================================
   Diario Párkinson — registro de periodos OFF, tomas,
   discinesias y eventos. Todo se guarda en localStorage.
   ========================================================= */

const KEY = 'diario-parkinson-v1';
const MIN = 60000;

const SYMPTOMS = [
  ['tremor', 'Temblor'],
  ['rigidity', 'Rigidez'],
  ['slow', 'Lentitud'],
  ['freezing', 'Bloqueo al andar'],
  ['balance', 'Inestabilidad'],
  ['dystonia', 'Distonía / calambre'],
  ['pain', 'Dolor'],
  ['speech', 'Voz / tragar'],
  ['anxiety', 'Ansiedad'],
  ['fatigue', 'Cansancio'],
];
const SYMPTOM_LABEL = Object.fromEntries(SYMPTOMS);
const INTENSITY = { 1: 'Leve', 2: 'Moderado', 3: 'Fuerte' };
const EVENT_TYPES = {
  meal: { label: 'Comida', icon: '🍽️' },
  fall: { label: 'Caída', icon: '⚠️' },
  note: { label: 'Nota', icon: '📝' },
};

/* ---------- Estado ---------- */

function defaultState() {
  return {
    settings: {
      name: '',
      wake: '08:00',
      sleep: '23:00',
      schedule: [
        { time: '08:00', med: 'Levodopa' },
        { time: '12:00', med: 'Levodopa' },
        { time: '16:00', med: 'Levodopa' },
        { time: '20:00', med: 'Levodopa' },
      ],
      medChange: '',
      questions: '',
    },
    episodes: [], // { id, kind: 'off'|'dysk', start, end, intensity, symptoms: [], note }
    doses: [],    // { id, time, med, scheduled }
    events: [],   // { id, type: 'meal'|'fall'|'note', time, note, protein }
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    const d = defaultState();
    return {
      settings: { ...d.settings, ...(s.settings || {}) },
      episodes: s.episodes || [],
      doses: s.doses || [],
      events: s.events || [],
    };
  } catch (e) {
    return defaultState();
  }
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    alert('No se han podido guardar los datos en este dispositivo.');
  }
}

/* ---------- Utilidades ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const pad = n => String(n).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function dayKey(d) {
  d = new Date(d);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dayStart(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(key, n) {
  const d = dayStart(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
function daysBetween(fromKey, toKey) {
  const out = [];
  for (let k = fromKey; k <= toKey; k = addDays(k, 1)) out.push(k);
  return out;
}
function fmtTime(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtDay(key, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return dayStart(key).toLocaleDateString('es-ES', opts);
}
function fmtShortDay(key) {
  return dayStart(key).toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric' });
}
function fmtDur(min) {
  min = Math.round(min);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
function fmtHours(min) {
  return (min / 60).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' h';
}
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v) {
  return v ? new Date(v).toISOString() : null;
}
function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minOfDay(iso) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pct(a, b) {
  return b ? Math.round((a / b) * 100) : 0;
}
function epEnd(ep) {
  return ep.end ? new Date(ep.end) : new Date();
}
function overlapMin(ep, a, b) {
  const s = Math.max(new Date(ep.start).getTime(), a.getTime());
  const e = Math.min(epEnd(ep).getTime(), b.getTime());
  return Math.max(0, (e - s) / MIN);
}
function epDuration(ep) {
  return (epEnd(ep) - new Date(ep.start)) / MIN;
}
function vibrate() {
  try { navigator.vibrate && navigator.vibrate(40); } catch (e) { /* sin vibración */ }
}

function activeEpisode(kind) {
  return state.episodes.find(e => e.kind === kind && !e.end);
}

/* ---------- Deshacer ---------- */

let undoSnapshot = null;
let toastTimer = null;

function snapshot() {
  undoSnapshot = JSON.stringify(state);
}
function toast(msg, withUndo = true) {
  $('#toast-msg').textContent = msg;
  $('#toast-undo').style.display = withUndo && undoSnapshot ? '' : 'none';
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 6000);
}
$('#toast-undo').addEventListener('click', () => {
  if (!undoSnapshot) return;
  state = JSON.parse(undoSnapshot);
  undoSnapshot = null;
  save();
  $('#toast').classList.remove('show');
  renderAll();
});

/* ---------- Diálogo genérico ---------- */

function openDialog(bodyHTML, actions, onOpen) {
  const dlg = $('#dlg');
  $('#dlg-body').innerHTML = bodyHTML;
  $('#dlg-actions').innerHTML = actions
    .map(a => `<button class="btn ${a.cls || ''}" value="${a.value}" ${a.value === 'cancel' ? 'formnovalidate' : ''}>${a.label}</button>`)
    .join('');
  if (onOpen) onOpen($('#dlg-body'));
  return new Promise(resolve => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue), { once: true });
    dlg.returnValue = 'cancel';
    dlg.showModal();
  });
}

function chipToggles(root) {
  $$('.chip[data-toggle]', root).forEach(ch => ch.addEventListener('click', () => {
    ch.setAttribute('aria-pressed', ch.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
  }));
  $$('.seg[data-single]', root).forEach(seg => {
    $$('.chip', seg).forEach(ch => ch.addEventListener('click', () => {
      $$('.chip', seg).forEach(c => c.setAttribute('aria-pressed', 'false'));
      ch.setAttribute('aria-pressed', 'true');
    }));
  });
}

function symptomChipsHTML(selected = []) {
  return SYMPTOMS.map(([k, l]) =>
    `<button type="button" class="chip" data-toggle data-sym="${k}" aria-pressed="${selected.includes(k)}">${l}</button>`).join('');
}
function intensityHTML(val) {
  return `<div class="seg" data-single>${Object.entries(INTENSITY).map(([k, l]) =>
    `<button type="button" class="chip" data-int="${k}" aria-pressed="${String(val) === k}">${l}</button>`).join('')}</div>`;
}

/* =========================================================
   HOY
   ========================================================= */

$('#btn-off').addEventListener('click', () => {
  snapshot();
  const cur = activeEpisode('off');
  if (cur) {
    cur.end = new Date().toISOString();
    save();
    vibrate();
    toast(`OFF terminado · duró ${fmtDur(epDuration(cur))}`);
  } else {
    state.episodes.push({ id: uid(), kind: 'off', start: new Date().toISOString(), end: null, intensity: null, symptoms: [], note: '' });
    save();
    vibrate();
    toast('OFF registrado. Pulsa el botón verde cuando vuelva a estar bien.');
  }
  renderAll();
});

$('#btn-dysk').addEventListener('click', () => {
  snapshot();
  const cur = activeEpisode('dysk');
  if (cur) {
    cur.end = new Date().toISOString();
    toast(`Discinesias terminadas · ${fmtDur(epDuration(cur))}`);
  } else {
    state.episodes.push({ id: uid(), kind: 'dysk', start: new Date().toISOString(), end: null, intensity: null, symptoms: [], note: '' });
    toast('Discinesias registradas. Pulsa otra vez cuando paren.');
  }
  save();
  vibrate();
  renderAll();
});

function closestScheduled(date) {
  const sched = state.settings.schedule;
  if (!sched.length) return null;
  const m = date.getHours() * 60 + date.getMinutes();
  let best = null;
  for (const s of sched) {
    const diff = Math.abs(timeToMin(s.time) - m);
    if (diff <= 180 && (!best || diff < best.diff)) best = { ...s, diff };
  }
  return best;
}

$('#btn-dose').addEventListener('click', () => {
  snapshot();
  const now = new Date();
  const sch = closestScheduled(now);
  state.doses.push({ id: uid(), time: now.toISOString(), med: sch ? sch.med : '', scheduled: sch ? sch.time : null });
  save();
  vibrate();
  toast(sch ? `Toma de las ${sch.time} registrada (${fmtTime(now.toISOString())})` : 'Toma registrada');
  renderAll();
});

$$('[data-event]').forEach(b => b.addEventListener('click', async () => {
  const type = b.dataset.event;
  if (type === 'meal') {
    const r = await openDialog(
      `<h3>🍽️ Comida</h3><p class="muted">Las comidas con mucha proteína (carne, pescado, huevo, lácteos, legumbres) pueden restar efecto a la levodopa.</p>`,
      [{ label: 'Comida normal', value: 'normal' }, { label: 'Con mucha proteína', value: 'protein', cls: 'primary' }, { label: 'Cancelar', value: 'cancel' }]);
    if (r === 'cancel') return;
    snapshot();
    state.events.push({ id: uid(), type, time: new Date().toISOString(), note: '', protein: r === 'protein' });
    toast('Comida registrada');
  } else if (type === 'fall') {
    const r = await openDialog(
      `<h3>⚠️ Caída</h3><label class="f"><span>¿Qué ha pasado? (opcional)</span><textarea name="note" placeholder="Ej.: al girarse en la cocina, sin golpe"></textarea></label>`,
      [{ label: 'Guardar caída', value: 'ok', cls: 'primary' }, { label: 'Cancelar', value: 'cancel' }]);
    if (r === 'cancel') return;
    snapshot();
    state.events.push({ id: uid(), type, time: new Date().toISOString(), note: $('#dlg-form [name=note]').value.trim() });
    toast('Caída registrada');
  } else {
    const r = await openDialog(
      `<h3>📝 Nota</h3><label class="f"><span>Cualquier cosa que quieras recordar para la consulta</span><textarea name="note" required placeholder="Ej.: mala noche, alucinaciones, estreñimiento, mareo al levantarse…"></textarea></label>`,
      [{ label: 'Guardar nota', value: 'ok', cls: 'primary' }, { label: 'Cancelar', value: 'cancel' }]);
    if (r === 'cancel') return;
    const note = $('#dlg-form [name=note]').value.trim();
    if (!note) return;
    snapshot();
    state.events.push({ id: uid(), type, time: new Date().toISOString(), note });
    toast('Nota guardada');
  }
  save();
  vibrate();
  renderAll();
}));

function renderToday() {
  const off = activeEpisode('off');
  const dysk = activeEpisode('dysk');
  const st = $('#status');
  st.className = 'status ' + (off ? 'off' : 'on');
  $('#status-state').textContent = off ? 'OFF' : 'ON';
  if (off) {
    $('#status-since').textContent = `desde las ${fmtTime(off.start)} · ${fmtDur(epDuration(off))}`;
  } else {
    const last = [...state.episodes].filter(e => e.kind === 'off' && e.end).sort((a, b) => b.end.localeCompare(a.end))[0];
    $('#status-since').textContent = last ? `Último OFF terminó a las ${fmtTime(last.end)}${dayKey(last.end) !== dayKey(new Date()) ? ' (' + fmtDay(dayKey(last.end), { weekday: 'long' }) + ')' : ''}` : 'Pulsa el botón rojo cuando empiece un OFF';
  }

  const btn = $('#btn-off');
  btn.className = 'btn-huge ' + (off ? 'end-off' : 'start-off');
  btn.innerHTML = off
    ? 'Ya estoy bien (ON)<small>Pulsa cuando vuelva a moverse con normalidad</small>'
    : 'Empieza un OFF<small>Pulsa en cuanto note el bajón</small>';

  // Detalles del OFF en curso
  const det = $('#off-details');
  det.hidden = !off;
  if (off) {
    $('#cur-intensity').innerHTML = Object.entries(INTENSITY).map(([k, l]) =>
      `<button type="button" class="chip" data-k="${k}" aria-pressed="${String(off.intensity) === k}">${l}</button>`).join('');
    $$('#cur-intensity .chip').forEach(c => c.addEventListener('click', () => {
      off.intensity = Number(c.dataset.k);
      save();
      renderToday();
    }));
    $('#cur-symptoms').innerHTML = SYMPTOMS.map(([k, l]) =>
      `<button type="button" class="chip" data-k="${k}" aria-pressed="${off.symptoms.includes(k)}">${l}</button>`).join('');
    $$('#cur-symptoms .chip').forEach(c => c.addEventListener('click', () => {
      const k = c.dataset.k;
      off.symptoms = off.symptoms.includes(k) ? off.symptoms.filter(x => x !== k) : [...off.symptoms, k];
      save();
      renderToday();
    }));
  }

  $('#btn-dysk').classList.toggle('active-dysk', !!dysk);
  $('#dysk-label').textContent = dysk ? `Discinesias · ${fmtDur(epDuration(dysk))} (parar)` : 'Discinesias';

  // Próxima toma
  const today = dayKey(new Date());
  const nowMin = minOfDay(new Date().toISOString());
  const takenToday = state.doses.filter(d => dayKey(d.time) === today);
  const takenSlots = new Set(takenToday.map(d => d.scheduled));
  const sched = [...state.settings.schedule].sort((a, b) => a.time.localeCompare(b.time));
  const pending = sched.filter(s => !takenSlots.has(s.time));
  const next = pending.find(s => timeToMin(s.time) >= nowMin - 30);
  const lastDose = [...state.doses].sort((a, b) => b.time.localeCompare(a.time))[0];
  let txt = '';
  if (lastDose) txt += `Última toma: ${fmtTime(lastDose.time)}${dayKey(lastDose.time) !== today ? ' (ayer o antes)' : ''}. `;
  if (next) {
    const diff = timeToMin(next.time) - nowMin;
    txt += diff >= 0 ? `Próxima: ${next.time} (en ${fmtDur(diff)})` : `Toca la de las ${next.time}`;
  }
  $('#next-dose').textContent = txt;

  // KPIs de hoy
  const a = dayStart(today);
  const b = dayStart(addDays(today, 1));
  const offs = state.episodes.filter(e => e.kind === 'off');
  const offMin = offs.reduce((s, e) => s + overlapMin(e, a, b), 0);
  const offCount = offs.filter(e => dayKey(e.start) === today).length;
  const dyskMin = state.episodes.filter(e => e.kind === 'dysk').reduce((s, e) => s + overlapMin(e, a, b), 0);
  $('#today-kpis').innerHTML = [
    ['Tiempo en OFF', fmtDur(offMin)],
    ['Nº de OFF', offCount],
    ['Tomas', `${takenToday.length} / ${sched.length}`],
    ['Discinesias', fmtDur(dyskMin)],
  ].map(([k, v]) => `<div class="kpi"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');

  renderTimeline($('#today-timeline'), today);
}

function renderTimeline(el, key) {
  const a = dayStart(key);
  const b = dayStart(addDays(key, 1));
  const span = (b - a) / MIN;
  let html = '';
  for (const e of state.episodes) {
    const ov = overlapMin(e, a, b);
    if (!ov) continue;
    const s = Math.max(new Date(e.start), a);
    const left = ((s - a) / MIN) / span * 100;
    const w = Math.max(ov / span * 100, 0.6);
    html += `<div class="${e.kind === 'off' ? 'seg-off' : 'seg-dysk'}" style="left:${left}%;width:${w}%"></div>`;
  }
  for (const d of state.doses) {
    if (dayKey(d.time) !== key) continue;
    html += `<div class="dose" style="left:${minOfDay(d.time) / 1440 * 100}%"></div>`;
  }
  if (key === dayKey(new Date())) html += `<div class="now" style="left:${minOfDay(new Date().toISOString()) / 1440 * 100}%"></div>`;
  el.innerHTML = html;
}

/* =========================================================
   HISTORIAL
   ========================================================= */

function allRecords() {
  const r = [];
  for (const e of state.episodes) r.push({ rtype: 'ep', t: e.start, obj: e });
  for (const d of state.doses) r.push({ rtype: 'dose', t: d.time, obj: d });
  for (const ev of state.events) r.push({ rtype: 'event', t: ev.time, obj: ev });
  return r.sort((a, b) => b.t.localeCompare(a.t));
}

function describe(rec) {
  const o = rec.obj;
  if (rec.rtype === 'ep') {
    const isOff = o.kind === 'off';
    const extra = [o.intensity ? INTENSITY[o.intensity] : '', ...(o.symptoms || []).map(k => SYMPTOM_LABEL[k])].filter(Boolean).join(' · ');
    return {
      tag: isOff ? '<span class="tag off">OFF</span>' : '<span class="tag dysk">Discinesia</span>',
      t: `${fmtTime(o.start)} – ${o.end ? fmtTime(o.end) : 'en curso'} · ${fmtDur(epDuration(o))}`,
      s: [extra, o.note].filter(Boolean).map(esc).join('<br>'),
    };
  }
  if (rec.rtype === 'dose') {
    return {
      tag: '<span class="tag dose">💊 Toma</span>',
      t: `${fmtTime(o.time)}${o.scheduled ? ` (pautada ${o.scheduled})` : ''}`,
      s: esc(o.med),
    };
  }
  const et = EVENT_TYPES[o.type] || EVENT_TYPES.note;
  return {
    tag: `<span class="tag event">${et.icon} ${et.label}</span>`,
    t: fmtTime(o.time) + (o.protein ? ' · rica en proteína' : ''),
    s: esc(o.note),
  };
}

function renderHistory() {
  const recs = allRecords();
  const el = $('#history-list');
  if (!recs.length) {
    el.innerHTML = '<p class="muted">Todavía no hay registros.</p>';
    return;
  }
  let html = '';
  let cur = null;
  const LIMIT = 400;
  for (const r of recs.slice(0, LIMIT)) {
    const k = dayKey(r.t);
    if (k !== cur) {
      if (cur) html += '</div>';
      html += `<div class="day-group"><h3>${fmtDay(k)}</h3>`;
      cur = k;
    }
    const d = describe(r);
    html += `<button class="entry" data-rtype="${r.rtype}" data-id="${r.obj.id}">${d.tag}<div class="body"><div class="t">${d.t}</div>${d.s ? `<div class="s">${d.s}</div>` : ''}</div></button>`;
  }
  html += '</div>';
  if (recs.length > LIMIT) html += `<p class="muted small">Se muestran los ${LIMIT} registros más recientes. El informe y la exportación incluyen todos.</p>`;
  el.innerHTML = html;
  $$('.entry', el).forEach(b => b.addEventListener('click', () => editRecord(b.dataset.rtype, b.dataset.id)));
}

async function editRecord(rtype, id, isNew = false, draft = null) {
  const list = rtype === 'ep' ? state.episodes : rtype === 'dose' ? state.doses : state.events;
  const o = draft || list.find(x => x.id === id);
  if (!o) return;

  let body = '';
  if (rtype === 'ep') {
    body = `<h3>${o.kind === 'off' ? 'Periodo OFF' : 'Discinesias'}</h3>
      <label class="f"><span>Empezó</span><input type="datetime-local" name="start" required value="${toLocalInput(o.start)}"></label>
      <label class="f"><span>Terminó (vacío si sigue)</span><input type="datetime-local" name="end" value="${toLocalInput(o.end)}"></label>
      ${o.kind === 'off' ? `<div class="f"><span class="muted small">Intensidad</span>${intensityHTML(o.intensity)}</div>
      <div class="f"><span class="muted small">Síntomas</span><div class="chips">${symptomChipsHTML(o.symptoms || [])}</div></div>` : ''}
      <label class="f"><span>Nota</span><textarea name="note">${esc(o.note)}</textarea></label>`;
  } else if (rtype === 'dose') {
    body = `<h3>💊 Toma de medicación</h3>
      <label class="f"><span>Hora</span><input type="datetime-local" name="time" required value="${toLocalInput(o.time)}"></label>
      <label class="f"><span>Medicamento / dosis</span><input type="text" name="med" value="${esc(o.med)}"></label>`;
  } else {
    body = `<h3>${EVENT_TYPES[o.type].icon} ${EVENT_TYPES[o.type].label}</h3>
      <label class="f"><span>Hora</span><input type="datetime-local" name="time" required value="${toLocalInput(o.time)}"></label>
      ${o.type === 'meal' ? `<label class="f row" style="gap:8px"><input type="checkbox" name="protein" ${o.protein ? 'checked' : ''} style="flex:0;width:24px;height:24px"> <span style="margin:0">Rica en proteína</span></label>` : ''}
      <label class="f"><span>Nota</span><textarea name="note">${esc(o.note)}</textarea></label>`;
  }

  const actions = [{ label: 'Guardar', value: 'save', cls: 'primary' }];
  if (!isNew) actions.push({ label: 'Borrar', value: 'delete', cls: 'danger' });
  actions.push({ label: 'Cancelar', value: 'cancel' });

  const r = await openDialog(body, actions, chipToggles);
  const f = $('#dlg-form');
  if (r === 'cancel') return;
  snapshot();
  if (r === 'delete') {
    const idx = list.findIndex(x => x.id === id);
    if (idx >= 0) list.splice(idx, 1);
    save();
    toast('Registro borrado');
    renderAll();
    return;
  }
  if (rtype === 'ep') {
    const start = fromLocalInput(f.start.value);
    let end = fromLocalInput(f.end.value);
    if (!start) return;
    if (end && end < start) {
      alert('La hora de fin es anterior a la de inicio. Revísala.');
      return;
    }
    o.start = start;
    o.end = end;
    o.note = f.note.value.trim();
    if (o.kind === 'off') {
      const ip = $('#dlg-body [data-int][aria-pressed="true"]');
      o.intensity = ip ? Number(ip.dataset.int) : null;
      o.symptoms = $$('#dlg-body [data-sym][aria-pressed="true"]').map(c => c.dataset.sym);
    }
  } else if (rtype === 'dose') {
    o.time = fromLocalInput(f.time.value) || o.time;
    o.med = f.med.value.trim();
    const sch = closestScheduled(new Date(o.time));
    o.scheduled = sch ? sch.time : null;
  } else {
    o.time = fromLocalInput(f.time.value) || o.time;
    o.note = f.note.value.trim();
    if (o.type === 'meal') o.protein = f.protein.checked;
  }
  if (isNew) list.push(o);
  save();
  toast(isNew ? 'Registro añadido' : 'Cambios guardados');
  renderAll();
}

$('#btn-add-past').addEventListener('click', async () => {
  const r = await openDialog('<h3>¿Qué quieres añadir?</h3><p class="muted small">Por ejemplo, un OFF de esta mañana que no se apuntó en el momento.</p>', [
    { label: 'Periodo OFF', value: 'off', cls: 'primary' },
    { label: 'Discinesias', value: 'dysk' },
    { label: '💊 Toma', value: 'dose' },
    { label: '🍽️ Comida', value: 'meal' },
    { label: '⚠️ Caída', value: 'fall' },
    { label: '📝 Nota', value: 'note' },
    { label: 'Cancelar', value: 'cancel' },
  ]);
  if (r === 'cancel' || !r) return;
  const now = new Date();
  const hourAgo = new Date(now - 60 * MIN).toISOString();
  if (r === 'off' || r === 'dysk') {
    await editRecord('ep', null, true, { id: uid(), kind: r, start: hourAgo, end: now.toISOString(), intensity: null, symptoms: [], note: '' });
  } else if (r === 'dose') {
    const sch = closestScheduled(now);
    await editRecord('dose', null, true, { id: uid(), time: now.toISOString(), med: sch ? sch.med : '', scheduled: null });
  } else {
    await editRecord('event', null, true, { id: uid(), type: r, time: now.toISOString(), note: '', protein: false });
  }
});

/* =========================================================
   ESTADÍSTICAS
   ========================================================= */

function computeStats(fromKey, toKey) {
  const days = daysBetween(fromKey, toKey);
  const a0 = dayStart(fromKey);
  const b0 = dayStart(addDays(toKey, 1));
  const inRange = iso => { const t = new Date(iso); return t >= a0 && t < b0; };

  const offs = state.episodes.filter(e => e.kind === 'off' && inRange(e.start)).sort((a, b) => a.start.localeCompare(b.start));
  const dysks = state.episodes.filter(e => e.kind === 'dysk' && inRange(e.start));
  const doses = [...state.doses].sort((a, b) => a.time.localeCompare(b.time));
  const dosesIn = doses.filter(d => inRange(d.time));
  const events = state.events.filter(e => inRange(e.time));

  // Por día
  const perDay = days.map(k => {
    const a = dayStart(k);
    const b = dayStart(addDays(k, 1));
    const hasData =
      state.episodes.some(e => overlapMin(e, a, b) > 0) ||
      state.doses.some(d => dayKey(d.time) === k) ||
      state.events.some(e => dayKey(e.time) === k);
    return {
      key: k,
      hasData,
      offMin: state.episodes.filter(e => e.kind === 'off').reduce((s, e) => s + overlapMin(e, a, b), 0),
      offCount: offs.filter(e => dayKey(e.start) === k).length,
      dyskMin: state.episodes.filter(e => e.kind === 'dysk').reduce((s, e) => s + overlapMin(e, a, b), 0),
      doses: dosesIn.filter(d => dayKey(d.time) === k).length,
      falls: events.filter(e => e.type === 'fall' && dayKey(e.time) === k).length,
    };
  });
  const recorded = perDay.filter(d => d.hasData);
  const nRec = recorded.length;

  const totalOff = recorded.reduce((s, d) => s + d.offMin, 0);
  const avgOffDay = nRec ? totalOff / nRec : 0;
  const awake = ((timeToMin(state.settings.sleep) - timeToMin(state.settings.wake)) + 1440) % 1440 || 960;
  const durations = offs.map(epDuration);

  // Hora de inicio
  const byHour = Array(24).fill(0);
  offs.forEach(e => byHour[new Date(e.start).getHours()]++);

  // Tiempo desde la última toma hasta el OFF (posible fin de dosis)
  const lastDoseBefore = t => {
    let best = null;
    for (const d of doses) {
      if (d.time <= t) best = d; else break;
    }
    return best;
  };
  const latencies = [];
  let noPrevDose = 0;
  const latBuckets = [
    { label: '< 1 h', min: 0, max: 60, n: 0 },
    { label: '1–2 h', min: 60, max: 120, n: 0 },
    { label: '2–3 h', min: 120, max: 180, n: 0 },
    { label: '3–4 h', min: 180, max: 240, n: 0 },
    { label: '4–6 h', min: 240, max: 360, n: 0 },
  ];
  for (const e of offs) {
    const d = lastDoseBefore(e.start);
    const lat = d ? (new Date(e.start) - new Date(d.time)) / MIN : null;
    if (lat == null || lat > 360) { noPrevDose++; continue; }
    latencies.push(lat);
    const bk = latBuckets.find(b => lat >= b.min && lat < b.max);
    if (bk) bk.n++;
  }

  // Intervalo pautado entre tomas
  const sched = state.settings.schedule.map(s => timeToMin(s.time)).sort((a, b) => a - b);
  const gaps = sched.slice(1).map((m, i) => m - sched[i]);
  const schedGap = median(gaps);

  // OFF matutino: empieza antes de la primera toma del día (o sin toma aún) y antes de las 11
  const morningDays = new Set();
  for (const e of offs) {
    const k = dayKey(e.start);
    const first = doses.find(d => dayKey(d.time) === k);
    const startMin = minOfDay(e.start);
    const beforeFirst = !first || e.start <= first.time;
    if (beforeFirst && startMin < 11 * 60 && startMin >= timeToMin(state.settings.wake) - 120) morningDays.add(k);
  }

  // Tiempo hasta hacer efecto: tomas hechas durante un OFF → minutos hasta el ON
  const timeToOn = [];
  for (const e of offs) {
    if (!e.end) continue;
    const d = doses.filter(x => x.time >= e.start && x.time <= e.end).pop();
    if (d) timeToOn.push((new Date(e.end) - new Date(d.time)) / MIN);
  }

  // OFF tras comida rica en proteína (0–3 h después)
  const proteinMeals = events.filter(e => e.type === 'meal' && e.protein);
  const normalMeals = events.filter(e => e.type === 'meal' && !e.protein);
  const offAfter = meals => meals.filter(m => offs.some(e => {
    const dt = (new Date(e.start) - new Date(m.time)) / MIN;
    return dt >= 0 && dt <= 180;
  })).length;

  // Discinesias respecto a la toma
  const dyskLat = dysks.map(e => { const d = lastDoseBefore(e.start); return d ? (new Date(e.start) - new Date(d.time)) / MIN : null; }).filter(x => x != null && x <= 360);

  // Síntomas
  const symCount = {};
  offs.forEach(e => (e.symptoms || []).forEach(s => { symCount[s] = (symCount[s] || 0) + 1; }));
  const intCount = { 1: 0, 2: 0, 3: 0 };
  offs.forEach(e => { if (e.intensity) intCount[e.intensity]++; });

  // Caídas
  const falls = events.filter(e => e.type === 'fall');
  const fallsInOff = falls.filter(f => state.episodes.some(e => e.kind === 'off' && f.time >= e.start && f.time <= (e.end || new Date().toISOString()))).length;

  // Adherencia y puntualidad
  const expected = nRec * state.settings.schedule.length;
  const delays = dosesIn.filter(d => d.scheduled).map(d => minOfDay(d.time) - timeToMin(d.scheduled));

  return {
    fromKey, toKey, days, perDay, nRec, offs, dysks, totalOff, avgOffDay, awake,
    pctAwake: avgOffDay / awake * 100,
    avgDur: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    maxDur: durations.length ? Math.max(...durations) : 0,
    offsPerDay: nRec ? offs.length / nRec : 0,
    byHour, latencies, latBuckets, noPrevDose, medLatency: median(latencies), schedGap,
    morningDays: morningDays.size, timeToOn, medTimeToOn: median(timeToOn),
    proteinMeals: proteinMeals.length, proteinOff: offAfter(proteinMeals),
    normalMeals: normalMeals.length, normalOff: offAfter(normalMeals),
    dyskLat, medDyskLat: median(dyskLat), dyskTotal: recorded.reduce((s, d) => s + d.dyskMin, 0),
    symCount, intCount, falls: falls.length, fallsInOff,
    dosesTaken: dosesIn.length, expected, medDelay: median(delays.map(Math.abs)),
    notes: events.filter(e => e.type === 'note'),
  };
}

function avgOffPerRecordedDay(fromKey, toKey) {
  const s = computeStats(fromKey, toKey);
  return s.nRec >= 3 ? { avg: s.avgOffDay, n: s.nRec, offsPerDay: s.offsPerDay } : null;
}

function buildInsights(s) {
  const out = [];
  if (!s.offs.length) return out;

  // Franja horaria con más OFF
  let bestH = 0, bestN = -1;
  for (let h = 0; h < 24; h++) {
    const n = s.byHour[h] + (s.byHour[(h + 1) % 24] || 0);
    if (n > bestN) { bestN = n; bestH = h; }
  }
  if (s.offs.length >= 4 && bestN / s.offs.length >= 0.3) {
    out.push({ txt: `El ${pct(bestN, s.offs.length)} % de los OFF empiezan entre las ${pad(bestH)}:00 y las ${pad((bestH + 2) % 24)}:00.` });
  }

  // Fin de dosis
  if (s.latencies.length >= 3 && s.schedGap) {
    const early = s.latencies.filter(l => l < s.schedGap - 15).length;
    if (early / s.latencies.length >= 0.5) {
      out.push({ warn: true, txt: `En ${early} de ${s.latencies.length} OFF (${pct(early, s.latencies.length)} %) el bajón llega antes de la siguiente toma pautada (mediana: ${fmtDur(s.medLatency)} después de tomar; las tomas están separadas unas ${fmtDur(s.schedGap)}). Es el patrón típico de <b>"fin de dosis" (wearing-off)</b>.` });
    }
  }

  // OFF matutino
  if (s.nRec >= 3 && s.morningDays / s.nRec >= 0.3) {
    out.push({ warn: true, txt: `<b>OFF por la mañana</b> antes de que haga efecto la primera toma en ${s.morningDays} de ${s.nRec} días registrados.` });
  }

  // Tiempo hasta hacer efecto
  if (s.timeToOn.length >= 3) {
    const slow = s.medTimeToOn > 45;
    out.push({ warn: slow, txt: `Cuando toma la medicación estando en OFF, tarda una mediana de <b>${fmtDur(s.medTimeToOn)}</b> en volver a ON${slow ? ' (posible "ON retrasado")' : ''}.` });
  }

  // Proteína
  if (s.proteinMeals >= 3) {
    const p = pct(s.proteinOff, s.proteinMeals);
    const n = s.normalMeals ? pct(s.normalOff, s.normalMeals) : null;
    if (n == null || p - n >= 15) {
      out.push({ warn: true, txt: `Tras comidas ricas en proteína aparece un OFF en las 3 h siguientes el ${p} % de las veces${n != null ? ` (frente al ${n} % con comidas normales)` : ''}.` });
    }
  }

  // Discinesias
  if (s.dyskLat.length >= 3) {
    out.push({ txt: `Las discinesias suelen empezar unos <b>${fmtDur(s.medDyskLat)}</b> después de la toma${s.medDyskLat >= 30 && s.medDyskLat <= 150 ? ' (compatible con "pico de dosis")' : ''}.` });
  }

  // Caídas
  if (s.falls) {
    out.push({ warn: true, txt: `${s.falls} caída${s.falls > 1 ? 's' : ''} en el periodo${s.fallsInOff ? `, ${s.fallsInOff} durante un OFF` : ''}.` });
  }

  // Intensidad
  const strong = s.intCount[3];
  if (strong && s.offs.length >= 4) out.push({ txt: `${strong} de ${s.offs.length} OFF marcados como fuertes.` });

  // Comparación con el periodo anterior
  const len = s.days.length;
  const prev = avgOffPerRecordedDay(addDays(s.fromKey, -len), addDays(s.fromKey, -1));
  if (prev && s.nRec >= 3) {
    const diff = s.avgOffDay - prev.avg;
    const rel = prev.avg ? Math.round(diff / prev.avg * 100) : 0;
    if (Math.abs(rel) >= 10) {
      out.push({ warn: diff > 0, txt: `Respecto a los ${len} días anteriores, el tiempo en OFF ha ${diff > 0 ? 'subido' : 'bajado'} un ${Math.abs(rel)} % (${fmtHours(prev.avg)} → ${fmtHours(s.avgOffDay)} al día).` });
    }
  }

  // Cambio de medicación
  const mc = state.settings.medChange;
  if (mc) {
    const before = avgOffPerRecordedDay(addDays(mc, -14), addDays(mc, -1));
    const after = avgOffPerRecordedDay(mc, addDays(mc, 13) < dayKey(new Date()) ? addDays(mc, 13) : dayKey(new Date()));
    if (before && after) {
      out.push({ txt: `Cambio de medicación del ${fmtDay(mc, { day: 'numeric', month: 'long' })}: 2 semanas antes ${fmtHours(before.avg)} de OFF al día (${before.offsPerDay.toFixed(1).replace('.', ',')} episodios); después ${fmtHours(after.avg)} (${after.offsPerDay.toFixed(1).replace('.', ',')} episodios).` });
    }
  }

  // Puntualidad
  if (s.medDelay != null && s.medDelay >= 30) {
    out.push({ warn: true, txt: `Las tomas se hacen con una desviación mediana de ${fmtDur(s.medDelay)} respecto a la hora pautada. La puntualidad influye mucho en los OFF.` });
  }
  return out;
}

/* ---------- Gráficas (SVG propio, sin librerías) ---------- */

const tip = $('#tip');
function showTip(html, x, y) {
  tip.innerHTML = html;
  tip.style.display = 'block';
  const r = tip.getBoundingClientRect();
  let left = x + 12;
  let top = y - r.height - 12;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - 12;
  if (left < 8) left = 8;
  if (top < 8) top = y + 16;
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}
function hideTip() { tip.style.display = 'none'; }
document.addEventListener('scroll', hideTip, { passive: true });

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

/**
 * data: [{ label, value (null = sin datos), tip, hl }]
 * opts: { height, fmtAxis, labelEvery, showValues }
 */
function barChart(data, opts = {}) {
  const W = Math.round(Math.max(340, Math.min(640, window.innerWidth - 64))), H = opts.height || 220;
  const m = { t: 18, r: 8, b: 26, l: 36 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const max = niceMax(Math.max(0, ...data.map(d => d.value || 0)));
  const n = data.length;
  const band = iw / n;
  const gap = Math.min(2 + band * 0.18, 10);
  const bw = Math.max(2, band - gap);
  const fmtAxis = opts.fmtAxis || (v => v);
  const every = opts.labelEvery || Math.ceil(n / 12);
  const y = v => m.t + ih - (v / max) * ih;

  let g = '<g class="axis">';
  for (let i = 0; i <= 4; i++) {
    const v = max * i / 4;
    g += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    g += `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmtAxis(v)}</text>`;
  }
  data.forEach((d, i) => {
    if (i % every === 0) g += `<text x="${m.l + band * i + band / 2}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>`;
  });
  g += '</g>';

  let bars = '';
  data.forEach((d, i) => {
    const x = m.l + band * i + gap / 2;
    bars += `<rect class="hit" data-i="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}"></rect>`;
    if (d.value) {
      const h = Math.max(ih - (y(d.value) - m.t), 2);
      const top = m.t + ih - h;
      const r = Math.min(4, bw / 2, h);
      // barra con extremo superior redondeado, anclada a la línea base
      bars += `<path class="bar${d.hl ? ' hl' : ''}" d="M${x},${m.t + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${m.t + ih} Z"></path>`;
      if (opts.showValues) bars += `<text class="vlabel" x="${x + bw / 2}" y="${top - 5}" text-anchor="middle">${esc(opts.showValues(d.value))}</text>`;
    } else {
      bars += `<rect class="bar" x="${x}" y="${m.t + ih - 1}" width="${bw}" height="0"></rect>`;
    }
  });

  const wrap = document.createElement('div');
  wrap.className = 'chart';
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria || '')}">${g}<line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}" stroke="var(--border)"/>${bars}</svg>`;
  $$('.hit', wrap).forEach(h => {
    const d = data[Number(h.dataset.i)];
    const show = ev => {
      const p = ev.touches ? ev.touches[0] : ev;
      $$('.hit.focus', wrap).forEach(x => x.classList.remove('focus'));
      h.classList.add('focus');
      showTip(d.tip, p.clientX, p.clientY);
    };
    h.addEventListener('mousemove', show);
    h.addEventListener('touchstart', show, { passive: true });
    h.addEventListener('mouseleave', () => { h.classList.remove('focus'); hideTip(); });
  });
  return wrap;
}

function hbarsHTML(rows, total) {
  const max = Math.max(1, ...rows.map(r => r.n));
  return rows.map(r => `<div class="hbar"><span>${esc(r.label)}</span><div class="track"><div class="fill" style="width:${r.n / max * 100}%"></div></div><span class="n" title="${pct(r.n, total)} % de los OFF">${r.n}</span></div>`).join('');
}

function timelinesHTML(days) {
  return days.map(k => `<div style="display:grid;grid-template-columns:62px 1fr;gap:8px;align-items:center;margin-bottom:4px">
      <span class="small muted">${fmtDay(k, { weekday: 'short', day: 'numeric' })}</span>
      <div class="timeline compact" data-day="${k}" style="height:24px;margin:0"></div></div>`).join('') +
    `<div style="display:grid;grid-template-columns:62px 1fr;gap:8px"><span></span><div class="tl-axis"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div></div>
    <div class="legend"><span><i style="background:var(--off)"></i>OFF</span><span><i style="background:var(--dysk)"></i>Discinesias</span><span><i style="background:var(--accent)"></i>Toma</span></div>`;
}
function fillTimelines(root) {
  $$('.timeline[data-day]', root).forEach(el => {
    renderTimeline(el, el.dataset.day);
    // en filas compactas la franja de discinesias va abajo
    $$('.seg-off', el).forEach(s => { s.style.top = '3px'; s.style.bottom = '9px'; });
    $$('.seg-dysk', el).forEach(s => { s.style.top = '17px'; s.style.bottom = '2px'; });
  });
}

function statsContent(s, { forReport = false } = {}) {
  const frag = document.createDocumentFragment();
  const sec = (title, sub) => {
    const c = document.createElement(forReport ? 'section' : 'div');
    c.className = forReport ? '' : 'card';
    c.innerHTML = `<h3>${title}</h3>${sub ? `<p class="muted small" style="margin-top:-4px">${sub}</p>` : ''}`;
    frag.appendChild(c);
    return c;
  };

  if (!s.nRec) {
    const c = sec('Sin datos en este periodo');
    c.innerHTML += '<p class="muted">Empieza a registrar los OFF y las tomas desde la pestaña "Hoy". Con una o dos semanas de datos ya salen patrones útiles.</p>';
    return frag;
  }

  const kp = document.createElement('div');
  kp.className = 'kpis';
  kp.innerHTML = [
    [fmtHours(s.avgOffDay), 'OFF al día (media)', `${Math.round(s.pctAwake)} % del tiempo despierta`],
    [s.offsPerDay.toFixed(1).replace('.', ','), 'Episodios OFF al día', `${s.offs.length} en total`],
    [fmtDur(s.avgDur), 'Duración media', `máx. ${fmtDur(s.maxDur)}`],
    [s.medLatency != null ? fmtDur(s.medLatency) : '—', 'Toma → OFF (mediana)', 'tiempo desde la última toma'],
    [s.morningDays + ' / ' + s.nRec, 'Días con OFF matutino', 'antes de la 1.ª toma'],
    [s.medTimeToOn != null ? fmtDur(s.medTimeToOn) : '—', 'Toma → vuelve a ON', 'cuando se toma en OFF'],
    [fmtHours(s.dyskTotal / s.nRec), 'Discinesias al día', `${s.dysks.length} episodios`],
    [String(s.falls), 'Caídas', s.fallsInOff ? `${s.fallsInOff} durante OFF` : '—'],
  ].map(([v, k, d]) => `<div class="kpi"><div class="v">${v}</div><div class="k">${k}</div><div class="d">${d}</div></div>`).join('');
  frag.appendChild(kp);

  const ins = buildInsights(s);
  if (ins.length) {
    const c = sec('Lo más destacable', 'Patrones detectados automáticamente para comentar con la neuróloga. No son un diagnóstico.');
    c.innerHTML += `<ul class="insights">${ins.map(i => `<li class="${i.warn ? 'warn' : ''}">${i.warn ? '⚠️ ' : 'ℹ️ '}${i.txt}</li>`).join('')}</ul>`;
  }

  // Horas de OFF por día
  const c1 = sec('Horas en OFF cada día', `Periodo del ${fmtDay(s.fromKey, { day: 'numeric', month: 'short' })} al ${fmtDay(s.toKey, { day: 'numeric', month: 'short' })} · ${s.nRec} días con registros`);
  c1.appendChild(barChart(s.perDay.map(d => ({
    label: fmtShortDay(d.key),
    value: d.hasData ? d.offMin / 60 : null,
    tip: `<b>${fmtDay(d.key)}</b><br>${d.hasData ? `OFF: ${fmtDur(d.offMin)} (${d.offCount} episodios)<br>Tomas: ${d.doses}${d.dyskMin ? `<br>Discinesias: ${fmtDur(d.dyskMin)}` : ''}${d.falls ? `<br>Caídas: ${d.falls}` : ''}` : 'Sin registros'}`,
  })), { aria: 'Horas en OFF por día', fmtAxis: v => (Math.round(v * 10) / 10) + 'h', labelEvery: Math.ceil(s.perDay.length / 8) }));

  // Diario visual
  const shown = s.days.slice(-14).filter(k => s.perDay.find(p => p.key === k).hasData);
  if (shown.length) {
    const c2 = sec('Diario visual', shown.length < s.nRec ? 'Últimos 14 días' : 'Cada fila es un día, de 0 h a 24 h');
    c2.insertAdjacentHTML('beforeend', timelinesHTML(shown));
    fillTimelines(c2);
  }

  // Hora del día
  const c3 = sec('¿A qué hora empiezan los OFF?', 'Número de episodios que empiezan en cada hora');
  c3.appendChild(barChart(s.byHour.map((n, h) => ({
    label: `${h}h`, value: n, tip: `<b>${pad(h)}:00 – ${pad(h)}:59</b><br>${n} OFF`,
  })), { aria: 'OFF por hora de inicio', fmtAxis: v => Math.round(v * 10) / 10, labelEvery: 3, height: 200 }));
  const sched = state.settings.schedule.map(x => x.time).sort().join(' · ');
  if (sched) c3.insertAdjacentHTML('beforeend', `<p class="muted small">Tomas pautadas: ${sched}</p>`);

  // Latencia toma → OFF
  if (s.latencies.length) {
    const c4 = sec('Tiempo desde la última toma hasta el OFF', `Si la mayoría de OFF llegan poco antes de la siguiente toma, sugiere fin de dosis.${s.noPrevDose ? ` ${s.noPrevDose} OFF sin toma en las 6 h previas (no incluidos).` : ''}`);
    c4.appendChild(barChart(s.latBuckets.map(b => ({
      label: b.label, value: b.n,
      hl: s.schedGap && b.max <= s.schedGap && b.min >= s.schedGap - 90,
      tip: `<b>${b.label} después de tomar</b><br>${b.n} OFF (${pct(b.n, s.latencies.length)} %)`,
    })), { aria: 'OFF según tiempo desde la toma', fmtAxis: v => Math.round(v * 10) / 10, labelEvery: 1, height: 190, showValues: v => v }));
  }

  // Síntomas
  const symRows = SYMPTOMS.map(([k, l]) => ({ label: l, n: s.symCount[k] || 0 })).filter(r => r.n).sort((a, b) => b.n - a.n);
  if (symRows.length) {
    const c5 = sec('Síntomas durante los OFF', `Número de OFF en que se marcó cada síntoma (de ${s.offs.length})`);
    c5.insertAdjacentHTML('beforeend', hbarsHTML(symRows, s.offs.length));
  }
  const intTotal = s.intCount[1] + s.intCount[2] + s.intCount[3];
  if (intTotal) {
    const c6 = sec('Intensidad de los OFF');
    c6.insertAdjacentHTML('beforeend', hbarsHTML([1, 2, 3].map(k => ({ label: INTENSITY[k], n: s.intCount[k] })), intTotal));
  }

  // Medicación
  const c7 = sec('Medicación');
  c7.insertAdjacentHTML('beforeend', `<p>Tomas registradas: <b>${s.dosesTaken}</b> de ${s.expected} pautadas en los días con registros (${pct(s.dosesTaken, s.expected)} %).${s.medDelay != null ? ` Desviación mediana respecto a la hora pautada: <b>${fmtDur(s.medDelay)}</b>.` : ''}</p>`);

  return frag;
}

let statsRange = 14;
function renderStats() {
  const rs = $('#range-sel');
  rs.innerHTML = [7, 14, 30, 90].map(n => `<button class="chip" data-n="${n}" aria-pressed="${n === statsRange}">${n} días</button>`).join('');
  $$('.chip', rs).forEach(c => c.addEventListener('click', () => { statsRange = Number(c.dataset.n); renderStats(); }));
  const to = dayKey(new Date());
  const s = computeStats(addDays(to, -(statsRange - 1)), to);
  const body = $('#stats-body');
  body.innerHTML = '';
  body.appendChild(statsContent(s));
}

/* =========================================================
   INFORME
   ========================================================= */

function renderReport() {
  const today = dayKey(new Date());
  if (!$('#rep-from').value) $('#rep-from').value = addDays(today, -29);
  if (!$('#rep-to').value) $('#rep-to').value = today;
  $('#rep-questions').value = state.settings.questions || '';
  let from = $('#rep-from').value;
  let to = $('#rep-to').value;
  if (from > to) [from, to] = [to, from];
  const s = computeStats(from, to);
  const name = state.settings.name;

  const el = $('#report');
  el.innerHTML = `
    <h1>Diario de Párkinson${name ? ' · ' + esc(name) : ''}</h1>
    <p class="muted" style="margin:0">Del ${fmtDay(from, { day: 'numeric', month: 'long', year: 'numeric' })} al ${fmtDay(to, { day: 'numeric', month: 'long', year: 'numeric' })} · ${s.nRec} días con registros · generado el ${new Date().toLocaleDateString('es-ES')}</p>
    <section><h3>Pauta de medicación</h3>
      <p>${state.settings.schedule.length ? [...state.settings.schedule].sort((a, b) => a.time.localeCompare(b.time)).map(x => `<b>${x.time}</b> ${esc(x.med)}`).join(' · ') : '—'}
      ${state.settings.medChange ? `<br><span class="muted small">Último cambio de medicación: ${fmtDay(state.settings.medChange, { day: 'numeric', month: 'long', year: 'numeric' })}</span>` : ''}</p>
    </section>`;
  el.appendChild(statsContent(s, { forReport: true }));

  // Tabla diaria
  const rows = s.perDay.filter(d => d.hasData);
  if (rows.length) {
    el.insertAdjacentHTML('beforeend', `<section><h3>Resumen por día</h3><div class="table-wrap"><table class="data">
      <thead><tr><th>Día</th><th>Tiempo OFF</th><th>Nº OFF</th><th>Tomas</th><th>Discinesias</th><th>Caídas</th></tr></thead>
      <tbody>${rows.map(d => `<tr><td>${fmtDay(d.key, { weekday: 'short', day: 'numeric', month: 'short' })}</td><td>${fmtDur(d.offMin)}</td><td>${d.offCount}</td><td>${d.doses}</td><td>${d.dyskMin ? fmtDur(d.dyskMin) : '—'}</td><td>${d.falls || '—'}</td></tr>`).join('')}</tbody>
      </table></div></section>`);
  }

  // Notas
  if (s.notes.length) {
    el.insertAdjacentHTML('beforeend', `<section><h3>Notas del periodo</h3><ul>${s.notes.map(n => `<li><span class="muted small">${fmtDay(dayKey(n.time), { day: 'numeric', month: 'short' })} ${fmtTime(n.time)}</span> — ${esc(n.note)}</li>`).join('')}</ul></section>`);
  }
  if (state.settings.questions) {
    el.insertAdjacentHTML('beforeend', `<section><h3>Preguntas para la consulta</h3><p style="white-space:pre-wrap">${esc(state.settings.questions)}</p></section>`);
  }
}

$('#rep-from').addEventListener('change', renderReport);
$('#rep-to').addEventListener('change', renderReport);
$('#rep-questions').addEventListener('input', e => { state.settings.questions = e.target.value; save(); });
$('#rep-questions').addEventListener('change', renderReport);
$('#btn-print').addEventListener('click', () => { renderReport(); window.print(); });

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

$('#btn-csv').addEventListener('click', () => {
  const from = dayStart($('#rep-from').value || '1970-01-01');
  const to = dayStart(addDays($('#rep-to').value || dayKey(new Date()), 1));
  const inR = iso => { const t = new Date(iso); return t >= from && t < to; };
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const fmtDT = iso => iso ? `${dayKey(iso)} ${fmtTime(iso)}` : '';
  const lines = [['tipo', 'inicio', 'fin', 'duracion_min', 'intensidad', 'sintomas', 'medicacion', 'hora_pautada', 'proteina', 'nota'].join(';')];
  const recs = allRecords().filter(r => inR(r.t)).reverse();
  for (const r of recs) {
    const o = r.obj;
    if (r.rtype === 'ep') {
      lines.push([o.kind === 'off' ? 'OFF' : 'Discinesia', fmtDT(o.start), fmtDT(o.end), Math.round(epDuration(o)), o.intensity ? INTENSITY[o.intensity] : '', (o.symptoms || []).map(k => SYMPTOM_LABEL[k]).join(', '), '', '', '', o.note].map(q).join(';'));
    } else if (r.rtype === 'dose') {
      lines.push(['Toma', fmtDT(o.time), '', '', '', '', o.med, o.scheduled || '', '', ''].map(q).join(';'));
    } else {
      lines.push([EVENT_TYPES[o.type].label, fmtDT(o.time), '', '', '', '', '', '', o.type === 'meal' ? (o.protein ? 'sí' : 'no') : '', o.note].map(q).join(';'));
    }
  }
  download(`diario-parkinson-${dayKey(new Date())}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
});

/* =========================================================
   AJUSTES
   ========================================================= */

function renderSettings() {
  const st = state.settings;
  $('#set-name').value = st.name;
  $('#set-wake').value = st.wake;
  $('#set-sleep').value = st.sleep;
  $('#set-medchange').value = st.medChange || '';
  const el = $('#dose-schedule');
  el.innerHTML = st.schedule.map((d, i) => `<div class="dose-row">
      <input type="time" data-i="${i}" data-f="time" value="${d.time}" aria-label="Hora">
      <input type="text" data-i="${i}" data-f="med" value="${esc(d.med)}" placeholder="Medicamento y dosis" aria-label="Medicamento">
      <button class="btn danger" data-del="${i}" aria-label="Quitar toma">✕</button></div>`).join('');
  $$('input', el).forEach(inp => inp.addEventListener('change', () => {
    st.schedule[Number(inp.dataset.i)][inp.dataset.f] = inp.value;
    st.schedule.sort((a, b) => a.time.localeCompare(b.time));
    save();
    renderSettings();
  }));
  $$('[data-del]', el).forEach(b => b.addEventListener('click', () => {
    st.schedule.splice(Number(b.dataset.del), 1);
    save();
    renderSettings();
  }));
  $('#who').textContent = st.name;
}

$('#set-name').addEventListener('change', e => { state.settings.name = e.target.value.trim(); save(); renderSettings(); });
$('#set-wake').addEventListener('change', e => { state.settings.wake = e.target.value || '08:00'; save(); });
$('#set-sleep').addEventListener('change', e => { state.settings.sleep = e.target.value || '23:00'; save(); });
$('#set-medchange').addEventListener('change', e => { state.settings.medChange = e.target.value; save(); });
$('#btn-add-dose').addEventListener('click', () => {
  const last = state.settings.schedule[state.settings.schedule.length - 1];
  state.settings.schedule.push({ time: '12:00', med: last ? last.med : '' });
  save();
  renderSettings();
});

$('#btn-backup').addEventListener('click', () => {
  download(`copia-diario-parkinson-${dayKey(new Date())}.json`, JSON.stringify({ app: 'diario-parkinson', version: 1, exported: new Date().toISOString(), data: state }, null, 1), 'application/json');
});
$('#btn-restore').addEventListener('click', () => $('#file-restore').click());
$('#file-restore').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    const data = obj.data || obj;
    if (!data.settings || !Array.isArray(data.episodes)) throw new Error('formato');
    if (!confirm('Esto sustituirá los datos actuales por los de la copia. ¿Continuar?')) return;
    snapshot();
    state = { ...defaultState(), ...data, settings: { ...defaultState().settings, ...data.settings } };
    save();
    toast('Copia restaurada');
    renderAll();
  } catch (err) {
    alert('Ese archivo no parece una copia válida del diario.');
  } finally {
    e.target.value = '';
  }
});
$('#btn-wipe').addEventListener('click', () => {
  if (!confirm('¿Borrar TODOS los registros? Se mantiene la pauta de medicación. Puedes deshacerlo justo después.')) return;
  snapshot();
  state = { ...defaultState(), settings: state.settings };
  save();
  toast('Datos borrados');
  renderAll();
});
$('#btn-demo').addEventListener('click', () => {
  if ((state.episodes.length || state.doses.length) && !confirm('Se sustituirán los registros actuales por 30 días de datos inventados para probar las estadísticas. ¿Continuar? (Puedes deshacerlo justo después)')) return;
  snapshot();
  state = { ...defaultState(), settings: { ...state.settings } };
  generateDemo();
  save();
  toast('Datos de ejemplo cargados');
  renderAll();
});

/* Datos de ejemplo verosímiles: OFF matutino, fin de dosis, proteína, mejora tras cambio de medicación */
function generateDemo() {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const between = (a, b) => a + rnd() * (b - a);
  const today = dayKey(new Date());
  const change = addDays(today, -12);
  state.settings.medChange = change;
  state.settings.schedule = [
    { time: '08:00', med: 'Levodopa/carbidopa 100/25' },
    { time: '12:00', med: 'Levodopa/carbidopa 100/25' },
    { time: '16:00', med: 'Levodopa/carbidopa 100/25' },
    { time: '20:00', med: 'Levodopa/carbidopa 100/25' },
  ];
  const at = (k, min) => new Date(dayStart(k).getTime() + min * MIN);
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const k = addDays(today, -i);
    if (rnd() < 0.08 && i > 0) continue; // algún día sin apuntar
    const improved = k >= change;
    const doseTimes = [];
    for (const s of state.settings.schedule) {
      const t = at(k, timeToMin(s.time) + between(-15, 25));
      if (t > now) break;
      doseTimes.push(t);
      state.doses.push({ id: uid(), time: t.toISOString(), med: s.med, scheduled: s.time });
    }
    // Comida
    const lunch = at(k, 14 * 60 + between(0, 40));
    const protein = rnd() < 0.45;
    if (lunch < now) state.events.push({ id: uid(), type: 'meal', time: lunch.toISOString(), note: '', protein });
    const addOff = (start, end, extra = {}) => {
      if (start > now) return;
      const syms = SYMPTOMS.map(x => x[0]).filter(() => rnd() < 0.25);
      if (rnd() < 0.7) syms.push('slow');
      if (rnd() < 0.5) syms.push('rigidity');
      state.episodes.push({
        id: uid(), kind: 'off', start: start.toISOString(), end: end > now ? null : end.toISOString(),
        intensity: 1 + Math.floor(rnd() * 3), symptoms: [...new Set(syms)], note: '', ...extra,
      });
    };
    // OFF matutino
    if (rnd() < (improved ? 0.35 : 0.7) && doseTimes[0]) {
      const s = at(k, 7 * 60 + between(20, 50));
      addOff(s, new Date(doseTimes[0].getTime() + between(35, 70) * MIN), { symptoms: ['rigidity', 'slow', 'dystonia'].filter(() => rnd() < 0.7) });
    }
    // Fin de dosis antes de las siguientes tomas
    for (let d = 0; d < doseTimes.length; d++) {
      const next = doseTimes[d + 1];
      const p = improved ? 0.2 : 0.5;
      const afterMeal = d === 1 && protein;
      if (rnd() < (afterMeal ? 0.85 : p)) {
        const s = new Date(doseTimes[d].getTime() + between(afterMeal ? 150 : 170, 215) * MIN);
        const e = next ? new Date(next.getTime() + between(25, 60) * MIN) : new Date(s.getTime() + between(40, 90) * MIN);
        if (e > s) addOff(s, e);
      }
      // Discinesias de pico de dosis
      if (rnd() < (improved ? 0.35 : 0.2)) {
        const s = new Date(doseTimes[d].getTime() + between(50, 100) * MIN);
        if (s < now) state.episodes.push({ id: uid(), kind: 'dysk', start: s.toISOString(), end: new Date(s.getTime() + between(20, 50) * MIN).toISOString(), intensity: null, symptoms: [], note: '' });
      }
    }
    if (rnd() < 0.05) {
      const off = state.episodes.filter(e => e.kind === 'off' && dayKey(e.start) === k && e.end)[0];
      if (off) state.events.push({ id: uid(), type: 'fall', time: new Date(new Date(off.start).getTime() + 10 * MIN).toISOString(), note: 'Al girarse, sin golpe fuerte' });
    }
  }
  state.events.push({ id: uid(), type: 'note', time: at(addDays(today, -5), 10 * 60).toISOString(), note: 'Mala noche, se despertó varias veces con calambres en el pie' });
}

/* =========================================================
   NAVEGACIÓN Y ARRANQUE
   ========================================================= */

let currentView = 'today';
function renderAll() {
  renderToday();
  renderSettings();
  if (currentView === 'history') renderHistory();
  if (currentView === 'stats') renderStats();
  if (currentView === 'report') renderReport();
}

$$('nav.tabs button').forEach(b => b.addEventListener('click', () => {
  currentView = b.dataset.view;
  $$('nav.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + currentView));
  hideTip();
  window.scrollTo(0, 0);
  renderAll();
}));

document.addEventListener('click', e => { if (!e.target.closest('.chart')) hideTip(); });
setInterval(() => { if (currentView === 'today') renderToday(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });

renderAll();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
