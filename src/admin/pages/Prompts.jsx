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

function fmtNum(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value) || 0);
}

function PromptCard({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div layout style={{ padding: '16px', borderRadius: '18px', border: `1px solid ${c.border}`, background: c.surface }}>
      <button onClick={() => setOpen(v => !v)} style={{ width: '100%', background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: c.text1, fontSize: '15px', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.name}
            </div>
            <div style={{ marginTop: '4px', color: c.text3, fontSize: '11px', fontFamily: 'monospace' }}>
              {item.source}{item.line ? `:${item.line}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={{ padding: '4px 8px', borderRadius: '99px', background: `${c.blue}12`, border: `1px solid ${c.blue}28`, color: c.blue, fontSize: '10px', fontWeight: 900 }}>{fmtNum(item.length)} chars</span>
            <span style={{ padding: '4px 8px', borderRadius: '99px', background: `${c.violet}12`, border: `1px solid ${c.violet}28`, color: c.violet, fontSize: '10px', fontWeight: 900 }}>{item.group}</span>
          </div>
        </div>
        <p style={{ margin: '12px 0 0', color: c.text2, fontSize: '12px', lineHeight: 1.5 }}>
          {item.preview || 'Пустой prompt'}
        </p>
      </button>
      {open && (
        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ color: c.text3, fontSize: '10px', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>sha256: {item.sha256}</div>
          <pre style={{
            margin: 0,
            padding: '14px',
            borderRadius: '14px',
            border: `1px solid ${c.border}`,
            background: 'rgba(0,0,0,0.34)',
            color: c.text2,
            fontSize: '11px',
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            maxHeight: '420px',
            overflow: 'auto',
          }}>
            {item.prompt}
          </pre>
        </div>
      )}
    </motion.div>
  );
}

export default function Prompts() {
  const { authHeaders } = useAdmin();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/prompts', { headers: { ...authHeaders } });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Не удалось загрузить промпты');
      setData(json);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить промпты');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  const prompts = useMemo(() => data?.prompts || [], [data?.prompts]);
  const groups = useMemo(() => ['all', ...Object.keys(data?.summary?.groups || {}).sort()], [data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prompts.filter(item => {
      if (group !== 'all' && item.group !== group) return false;
      if (!q) return true;
      return [item.name, item.group, item.source, item.prompt, item.preview].filter(Boolean).some(value => String(value).toLowerCase().includes(q));
    });
  }, [group, prompts, search]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ padding: '22px', borderRadius: '22px', background: 'radial-gradient(circle at 10% 0%, rgba(167,139,250,0.2), transparent 35%), rgba(255,255,255,0.025)', border: `1px solid ${c.border}` }}>
        <div style={{ color: c.text3, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 900 }}>Prompt Registry</div>
        <h1 style={{ margin: '8px 0', color: c.text1, fontSize: '28px', letterSpacing: '-0.9px' }}>Живой реестр промптов</h1>
        <p style={{ margin: 0, color: c.text2, fontSize: '14px', lineHeight: 1.55 }}>
          Показывает промпты из текущего кода: backend-системные шаблоны, prompt builders, карточки и UI-пресеты. После изменения и деплоя код автоматически отражается здесь.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '42px', textAlign: 'center', color: c.text2, borderRadius: '18px', border: `1px solid ${c.border}`, background: c.surface }}>Загружаю prompt registry...</div>
      ) : error ? (
        <div style={{ padding: '18px', color: c.red, borderRadius: '18px', border: `1px solid ${c.red}30`, background: `${c.red}10` }}>
          {error}
          <button onClick={load} style={{ marginLeft: '12px', padding: '7px 12px', borderRadius: '10px', border: `1px solid ${c.border}`, background: 'transparent', color: c.text1, cursor: 'pointer' }}>Повторить</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div style={{ padding: '16px', borderRadius: '18px', border: `1px solid ${c.blue}24`, background: `${c.blue}10` }}>
              <div style={{ color: c.text3, fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>Всего</div>
              <div style={{ color: c.text1, fontSize: '28px', fontWeight: 950, marginTop: '6px' }}>{fmtNum(data.summary.total)}</div>
            </div>
            <div style={{ padding: '16px', borderRadius: '18px', border: `1px solid ${c.violet}24`, background: `${c.violet}10` }}>
              <div style={{ color: c.text3, fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>Групп</div>
              <div style={{ color: c.text1, fontSize: '28px', fontWeight: 950, marginTop: '6px' }}>{fmtNum(Object.keys(data.summary.groups || {}).length)}</div>
            </div>
            <div style={{ padding: '16px', borderRadius: '18px', border: `1px solid ${c.green}24`, background: `${c.green}10` }}>
              <div style={{ color: c.text3, fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>Показано</div>
              <div style={{ color: c.text1, fontSize: '28px', fontWeight: 950, marginTop: '6px' }}>{fmtNum(filtered.length)}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию, тексту, источнику..."
              style={{ flex: '1 1 280px', padding: '12px 14px', borderRadius: '14px', border: `1px solid ${c.border}`, background: c.surface, color: c.text1, outline: 'none' }} />
            <select value={group} onChange={e => setGroup(e.target.value)}
              style={{ flex: '0 1 260px', padding: '12px 14px', borderRadius: '14px', border: `1px solid ${c.border}`, background: '#111827', color: c.text1, outline: 'none' }}>
              {groups.map(g => <option key={g} value={g}>{g === 'all' ? 'Все группы' : g}</option>)}
            </select>
            <button onClick={load} style={{ padding: '12px 14px', borderRadius: '14px', border: `1px solid ${c.border}`, background: c.surface, color: c.text2, cursor: 'pointer', fontWeight: 900 }}>
              Обновить
            </button>
          </div>

          <motion.div layout style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '12px' }}>
            {filtered.map(item => <PromptCard key={item.id} item={item} />)}
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
