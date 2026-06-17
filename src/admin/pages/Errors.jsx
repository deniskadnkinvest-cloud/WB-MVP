import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAdmin } from '../AdminApp';

const c = {
  surface: 'rgba(255,255,255,0.035)',
  border: 'rgba(255,255,255,0.075)',
  text1: '#f8fafc',
  text2: 'rgba(248,250,252,0.64)',
  text3: 'rgba(248,250,252,0.36)',
  green: '#34d399',
  amber: '#fbbf24',
  blue: '#38bdf8',
  violet: '#a78bfa',
  red: '#fb7185',
};

const CATEGORY_LABELS = {
  quota: 'Лимиты / quota',
  timeout: 'Таймауты',
  auth: 'Авторизация',
  validation: 'Некорректный запрос',
  download: 'Скачивание результата',
  generation_provider: 'Провайдер генерации',
  unknown: 'Неизвестно',
};

const TYPE_LABELS = {
  fashion: 'Одежда',
  product: 'Предметка',
  quick: 'В два клика',
  card: 'Карточка',
  card_edit: 'Правка карточки',
  photo_edit: 'Правка фото',
  ugc: 'UGC',
  model: 'Модель',
  calibration: 'Калибровка',
};

function fmtDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtNum(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value) || 0);
}

function Stat({ label, value, tone, hint }) {
  return (
    <div style={{ padding: '16px', borderRadius: '18px', border: `1px solid ${tone}24`, background: `${tone}10` }}>
      <div style={{ color: c.text3, fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.7px' }}>{label}</div>
      <div style={{ color: c.text1, fontSize: '28px', fontWeight: 950, marginTop: '6px' }}>{value}</div>
      {hint && <div style={{ color: c.text2, fontSize: '12px', marginTop: '6px' }}>{hint}</div>}
    </div>
  );
}

function ErrorRow({ item }) {
  return (
    <div style={{ padding: '14px 0', borderBottom: `1px solid ${c.border}`, display: 'grid', gridTemplateColumns: '130px 1fr 150px', gap: '12px', alignItems: 'start' }}>
      <div>
        <span style={{ display: 'inline-flex', padding: '4px 8px', borderRadius: '99px', background: `${c.red}12`, border: `1px solid ${c.red}30`, color: c.red, fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>
          {CATEGORY_LABELS[item.category] || item.category}
        </span>
        <div style={{ color: c.text3, fontSize: '11px', marginTop: '7px' }}>{TYPE_LABELS[item.type] || item.type}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: c.text1, fontSize: '13px', fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.signature}</div>
        <div style={{ color: c.text3, fontSize: '11px', marginTop: '5px', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
          user: {item.userId || '—'} · prompt: {item.promptMeta?.name || '—'} · id: {item.id}
        </div>
      </div>
      <div style={{ color: c.text3, fontSize: '11px', textAlign: 'right' }}>{fmtDate(item.createdAt)}</div>
    </div>
  );
}

export default function Errors() {
  const { authHeaders } = useAdmin();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState('');
  const [type, setType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let url = '/api/admin/errors?limit=1500';
      if (userId.trim()) url += `&userId=${encodeURIComponent(userId.trim())}`;
      if (type) url += `&type=${encodeURIComponent(type)}`;
      const res = await fetch(url, { headers: { ...authHeaders } });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Не удалось загрузить ошибки');
      setData(json);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить ошибки');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, type, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary || {};
  const categoryRows = useMemo(() => Object.entries(summary.byCategory || {}).sort((a, b) => b[1] - a[1]), [summary.byCategory]);
  const typeRows = useMemo(() => Object.entries(summary.byType || {}).sort((a, b) => b[1] - a[1]), [summary.byType]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ padding: '22px', borderRadius: '22px', background: 'radial-gradient(circle at 10% 0%, rgba(251,113,133,0.2), transparent 35%), rgba(255,255,255,0.025)', border: `1px solid ${c.border}` }}>
        <div style={{ color: c.text3, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 900 }}>Live Error Center</div>
        <h1 style={{ margin: '8px 0', color: c.text1, fontSize: '28px', letterSpacing: '-0.9px' }}>Ошибки пользователей и генераций</h1>
        <p style={{ margin: 0, color: c.text2, fontSize: '14px', lineHeight: 1.55 }}>
          Реальные сбои из журнала генераций: категория, режим, пользователь, prompt fingerprint и повторяющиеся сигнатуры.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="Фильтр по Telegram ID / UID"
          style={{ flex: '1 1 260px', padding: '12px 14px', borderRadius: '14px', border: `1px solid ${c.border}`, background: c.surface, color: c.text1, outline: 'none', fontFamily: 'monospace' }} />
        <select value={type} onChange={e => setType(e.target.value)}
          style={{ flex: '0 1 220px', padding: '12px 14px', borderRadius: '14px', border: `1px solid ${c.border}`, background: '#111827', color: c.text1, outline: 'none' }}>
          <option value="">Все режимы</option>
          {Object.entries(TYPE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button onClick={load} style={{ padding: '12px 14px', borderRadius: '14px', border: `1px solid ${c.border}`, background: c.surface, color: c.text2, cursor: 'pointer', fontWeight: 900 }}>
          Обновить
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '42px', textAlign: 'center', color: c.text2, borderRadius: '18px', border: `1px solid ${c.border}`, background: c.surface }}>Собираю ошибки...</div>
      ) : error ? (
        <div style={{ padding: '18px', color: c.red, borderRadius: '18px', border: `1px solid ${c.red}30`, background: `${c.red}10` }}>{error}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <Stat label="Просканировано" value={fmtNum(summary.scanned)} tone={c.blue} />
            <Stat label="Ошибок" value={fmtNum(summary.totalErrors)} tone={c.red} />
            <Stat label="Error rate" value={`${summary.errorRate || 0}%`} tone={summary.errorRate > 10 ? c.red : c.green} />
            <Stat label="Сигнатур" value={fmtNum(summary.topSignatures?.length)} tone={c.violet} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ padding: '16px', borderRadius: '18px', background: c.surface, border: `1px solid ${c.border}` }}>
              <div style={{ color: c.text3, fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', marginBottom: '10px' }}>Категории</div>
              {categoryRows.length ? categoryRows.map(([name, count]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', color: c.text2, fontSize: '13px' }}>
                  <span>{CATEGORY_LABELS[name] || name}</span><b style={{ color: c.text1 }}>{count}</b>
                </div>
              )) : <div style={{ color: c.text3, fontSize: '13px' }}>Ошибок нет.</div>}
            </div>
            <div style={{ padding: '16px', borderRadius: '18px', background: c.surface, border: `1px solid ${c.border}` }}>
              <div style={{ color: c.text3, fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', marginBottom: '10px' }}>Режимы</div>
              {typeRows.length ? typeRows.map(([name, count]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', color: c.text2, fontSize: '13px' }}>
                  <span>{TYPE_LABELS[name] || name}</span><b style={{ color: c.text1 }}>{count}</b>
                </div>
              )) : <div style={{ color: c.text3, fontSize: '13px' }}>Ошибок нет.</div>}
            </div>
          </div>

          <div style={{ padding: '16px', borderRadius: '18px', background: c.surface, border: `1px solid ${c.border}` }}>
            <div style={{ color: c.text3, fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', marginBottom: '10px' }}>Топ повторяющихся причин</div>
            {summary.topSignatures?.length ? summary.topSignatures.map(item => (
              <div key={`${item.category}-${item.signature}`} style={{ padding: '10px 0', borderBottom: `1px solid ${c.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ color: c.text1, fontSize: '13px', fontWeight: 850 }}>{item.signature}</span>
                  <span style={{ color: c.red, fontWeight: 950 }}>{item.count}</span>
                </div>
                <div style={{ color: c.text3, fontSize: '11px', marginTop: '4px' }}>{CATEGORY_LABELS[item.category] || item.category} · last: {fmtDate(item.lastAt)} · user: {item.sampleUserId || '—'}</div>
              </div>
            )) : <div style={{ color: c.text3, fontSize: '13px' }}>Повторяющихся ошибок нет.</div>}
          </div>

          <div style={{ padding: '16px', borderRadius: '18px', background: c.surface, border: `1px solid ${c.border}` }}>
            <div style={{ color: c.text3, fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', marginBottom: '6px' }}>Последние ошибки</div>
            {data.errors?.length ? data.errors.map(item => <ErrorRow key={item.id} item={item} />) : (
              <div style={{ color: c.green, fontSize: '13px', padding: '18px 0' }}>За выбранный период ошибок нет. Редкий приятный зверёк.</div>
            )}
          </div>
        </>
      )}

      <style>{`@media (max-width: 980px) { div[style*="repeat(4"] { grid-template-columns: repeat(2, 1fr) !important; } div[style*="1fr 1fr"] { grid-template-columns: 1fr !important; } }`}</style>
    </motion.div>
  );
}
