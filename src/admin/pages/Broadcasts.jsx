import React, { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '../AdminApp';

const c = {
  bg: '#0a0a0a',
  surface: '#141414',
  surface2: '#1c1c1c',
  border: 'rgba(255,255,255,0.07)',
  text1: '#f5f5f7',
  text2: '#a1a1aa',
  text3: '#52525b',
  orange: '#fb923c',
  green: '#22c55e',
  red: '#ef4444',
  blue: '#60a5fa',
  yellow: '#fbbf24',
};

const AUDIENCE_OPTIONS = [
  { id: 'all',    label: 'Все пользователи', icon: '👥', desc: 'Telegram-юзеры без фильтра' },
  { id: 'paying', label: 'Платящие',          icon: '💎', desc: 'Кто делал реальные оплаты' },
  { id: 'free',   label: 'Бесплатные',        icon: '🆓', desc: 'Не сделали ни одного платежа' },
];

const STATUS_STYLES = {
  queued:    { color: c.yellow, label: 'В очереди' },
  running:   { color: c.blue,   label: 'Отправляется' },
  completed: { color: c.green,  label: 'Завершена' },
  failed:    { color: c.red,    label: 'Ошибка' },
};

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function Broadcasts() {
  const { authHeaders } = useAdmin();
  const [tab, setTab] = useState('compose'); // 'compose' | 'history'

  // Composer state
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [btnText, setBtnText] = useState('');
  const [btnUrl, setBtnUrl] = useState('');
  const [audience, setAudience] = useState('all');
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // History state
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const charCount = text.length;
  const hasButton = btnText.trim() && btnUrl.trim();

  async function doDryRun() {
    setDryRunning(true);
    setPreview(null);
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text || '(пусто)', audience, dryRun: true }),
      });
      const data = await res.json();
      if (data.ok) setPreview(data);
      else setErrorMsg(data.error);
    } finally {
      setDryRunning(false);
    }
  }

  async function doSend() {
    if (!text.trim()) return setErrorMsg('Текст не может быть пустым');
    if (!window.confirm(`Отправить рассылку ${preview?.telegramUsers ?? '?'} пользователям?`)) return;

    setSending(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text, imageUrl: imageUrl || null,
          buttonText: btnText || null, buttonUrl: btnUrl || null,
          audience,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccessMsg(`✅ Рассылка запущена! ID: ${data.broadcastId} — ${data.totalRecipients} получателей.`);
        setText('');
        setImageUrl('');
        setBtnText('');
        setBtnUrl('');
        setPreview(null);
        setTab('history');
        loadHistory();
      } else {
        setErrorMsg(data.error || 'Неизвестная ошибка');
      }
    } finally {
      setSending(false);
    }
  }

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/admin/broadcasts', { headers: authHeaders });
      const data = await res.json();
      if (data.ok) setHistory(data.broadcasts);
    } finally {
      setHistoryLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [loadHistory, tab]);

  // Card styles
  const cardStyle = {
    background: c.surface,
    border: `1px solid ${c.border}`,
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '16px',
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 700, color: c.text1 }}>Рассылки</h1>
        <p style={{ margin: '6px 0 0', color: c.text2, fontSize: '14px' }}>
          Массовые сообщения в Telegram через бота
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', background: c.surface, borderRadius: '12px', padding: '4px', marginBottom: '24px', width: 'fit-content' }}>
        {[{ id: 'compose', label: '✏️ Составить' }, { id: 'history', label: '📋 История' }].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 18px', borderRadius: '9px', border: 'none',
              background: tab === t.id ? c.orange : 'transparent',
              color: tab === t.id ? '#000' : c.text2,
              fontWeight: tab === t.id ? 700 : 500,
              fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Success / Error */}
      {successMsg && (
        <div style={{ padding: '14px 18px', borderRadius: '12px', background: 'rgba(34,197,94,0.1)', border: `1px solid ${c.green}30`, color: c.green, fontSize: '14px', marginBottom: '16px' }}>
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{ padding: '14px 18px', borderRadius: '12px', background: 'rgba(239,68,68,0.1)', border: `1px solid ${c.red}30`, color: c.red, fontSize: '14px', marginBottom: '16px' }}>
          {errorMsg} <button onClick={() => setErrorMsg('')} style={{ background: 'none', border: 'none', color: c.red, cursor: 'pointer', float: 'right', fontWeight: 700 }}>×</button>
        </div>
      )}

      {/* ────── COMPOSER TAB ────── */}
      {tab === 'compose' && (
        <>
          {/* Text */}
          <div style={cardStyle}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: c.text3, textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '10px' }}>
              Текст сообщения
            </label>
            <textarea
              value={text}
              onChange={e => { setText(e.target.value); setErrorMsg(''); }}
              placeholder={"Привет! 👋\n\nРады сообщить о новых возможностях...\n\n<b>Жирный</b> | <i>Курсив</i> — поддерживается HTML"}
              rows={8}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px', fontSize: '14px',
                background: c.surface2, border: `1px solid ${c.border}`,
                color: c.text1, outline: 'none', resize: 'vertical',
                fontFamily: "'Inter', monospace", lineHeight: '1.6',
                boxSizing: 'border-box', transition: 'border-color 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = c.orange + '60'; }}
              onBlur={e => { e.target.style.borderColor = c.border; }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: c.text3 }}>
              <span>Поддерживается HTML: &lt;b&gt;, &lt;i&gt;, &lt;a href="..."&gt;</span>
              <span style={{ color: charCount > 4000 ? c.red : c.text3 }}>{charCount} / 4096 симв.</span>
            </div>
          </div>

          {/* Image URL */}
          <div style={cardStyle}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: c.text3, textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '10px' }}>
              Картинка (необязательно)
            </label>
            <input
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: '12px', fontSize: '13px',
                background: c.surface2, border: `1px solid ${c.border}`,
                color: c.text1, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace',
              }}
            />
            {imageUrl && (
              <img
                src={imageUrl}
                alt="preview"
                onError={e => { e.target.style.display = 'none'; }}
                style={{ marginTop: '12px', maxWidth: '100%', maxHeight: '180px', borderRadius: '10px', objectFit: 'cover' }}
              />
            )}
          </div>

          {/* Button */}
          <div style={cardStyle}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: c.text3, textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '10px' }}>
              Кнопка-ссылка (необязательно)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <input
                value={btnText}
                onChange={e => setBtnText(e.target.value)}
                placeholder="Текст кнопки"
                style={{ padding: '12px 14px', borderRadius: '12px', fontSize: '13px', background: c.surface2, border: `1px solid ${c.border}`, color: c.text1, outline: 'none' }}
              />
              <input
                value={btnUrl}
                onChange={e => setBtnUrl(e.target.value)}
                placeholder="https://..."
                style={{ padding: '12px 14px', borderRadius: '12px', fontSize: '13px', background: c.surface2, border: `1px solid ${c.border}`, color: c.text1, outline: 'none', fontFamily: 'monospace' }}
              />
            </div>
            {hasButton && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '11px', color: c.text3, marginBottom: '6px' }}>Предпросмотр кнопки:</div>
                <span style={{
                  display: 'inline-block', padding: '8px 20px', borderRadius: '8px',
                  background: 'rgba(96,165,250,0.15)', border: `1px solid ${c.blue}30`,
                  color: c.blue, fontSize: '13px', fontWeight: 600,
                }}>
                  🔗 {btnText}
                </span>
              </div>
            )}
          </div>

          {/* Audience */}
          <div style={cardStyle}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: c.text3, textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '12px' }}>
              Аудитория
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {AUDIENCE_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { setAudience(opt.id); setPreview(null); }}
                  style={{
                    padding: '16px 12px', borderRadius: '12px', border: `1px solid ${audience === opt.id ? c.orange + '50' : c.border}`,
                    background: audience === opt.id ? 'rgba(251,146,60,0.08)' : c.surface2,
                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: '22px', marginBottom: '6px' }}>{opt.icon}</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: audience === opt.id ? c.orange : c.text1 }}>{opt.label}</div>
                  <div style={{ fontSize: '10px', color: c.text3, marginTop: '3px', lineHeight: 1.3 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Dry-run preview */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={doDryRun}
              disabled={dryRunning}
              style={{
                padding: '12px 22px', borderRadius: '12px', border: `1px solid ${c.border}`,
                background: c.surface2, color: c.text2, cursor: 'pointer',
                fontSize: '13px', fontWeight: 600, transition: 'all 0.15s',
              }}
            >
              {dryRunning ? '⏳ Считаем...' : '🔍 Посчитать аудиторию'}
            </button>

            {preview && (
              <div style={{
                padding: '12px 18px', borderRadius: '12px',
                background: 'rgba(96,165,250,0.08)', border: `1px solid ${c.blue}30`,
                fontSize: '13px', color: c.text2,
              }}>
                👥 <b style={{ color: c.text1 }}>{preview.telegramUsers}</b> Telegram-юзеров
                {preview.totalUsers !== preview.telegramUsers && (
                  <span style={{ color: c.text3 }}> (всего {preview.totalUsers}, без TG {preview.totalUsers - preview.telegramUsers})</span>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={doSend}
            disabled={sending || !text.trim() || charCount > 4096}
            style={{
              marginTop: '16px', width: '100%', padding: '16px',
              borderRadius: '14px', border: 'none',
              background: sending || !text.trim() ? c.surface2 : `linear-gradient(135deg, ${c.orange}, #f97316)`,
              color: sending || !text.trim() ? c.text3 : '#000',
              fontSize: '15px', fontWeight: 700, cursor: sending || !text.trim() ? 'default' : 'pointer',
              transition: 'all 0.2s', boxShadow: !sending && text.trim() ? `0 4px 24px ${c.orange}30` : 'none',
            }}
          >
            {sending ? '⏳ Отправляем...' : '📢 Запустить рассылку'}
          </button>

          <div style={{ marginTop: '10px', fontSize: '11px', color: c.text3, textAlign: 'center', lineHeight: 1.5 }}>
            Сообщения отправляются в фоне батчами по 30 шт/сек.<br />
            Вы можете закрыть страницу — рассылка продолжится.
          </div>
        </>
      )}

      {/* ────── HISTORY TAB ────── */}
      {tab === 'history' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: c.text1 }}>История рассылок</h3>
            <button
              onClick={loadHistory}
              style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: '8px', padding: '6px 12px', color: c.text2, cursor: 'pointer', fontSize: '12px' }}
            >
              🔄 Обновить
            </button>
          </div>

          {historyLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: c.text3 }}>Загрузка...</div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
              <div style={{ color: c.text3, fontSize: '14px' }}>Рассылок ещё не было</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {history.map(b => {
                const st = STATUS_STYLES[b.status] || STATUS_STYLES.queued;
                const pct = b.totalRecipients > 0 ? Math.round((b.sentCount / b.totalRecipients) * 100) : 0;
                return (
                  <div
                    key={b.id}
                    style={{
                      background: c.surface2, borderRadius: '12px', padding: '16px',
                      border: `1px solid ${c.border}`, display: 'grid',
                      gridTemplateColumns: '1fr auto', gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <span style={{
                          padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                          background: st.color + '15', color: st.color,
                        }}>
                          {st.label}
                        </span>
                        <span style={{ fontSize: '11px', color: c.text3 }}>{formatDate(b.createdAt)}</span>
                        {b.createdBy && (
                          <span style={{ fontSize: '11px', color: c.text3 }}>от {b.createdBy}</span>
                        )}
                      </div>

                      <div style={{
                        fontSize: '13px', color: c.text2, lineHeight: 1.5,
                        maxWidth: '500px', overflow: 'hidden', textOverflow: 'ellipsis',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>
                        {b.text}
                      </div>

                      {b.imageUrl && (
                        <div style={{ fontSize: '11px', color: c.blue, marginTop: '4px' }}>
                          🖼️ Со картинкой
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: 'right', minWidth: '100px' }}>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: c.text1 }}>
                        {b.sentCount ?? 0}
                        <span style={{ fontSize: '12px', color: c.text3, fontWeight: 400 }}>/{b.totalRecipients}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: c.text3, marginTop: '2px' }}>отправлено</div>
                      {b.status === 'running' && (
                        <div style={{ marginTop: '6px' }}>
                          <div style={{ height: '3px', background: c.surface, borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: c.orange, borderRadius: '2px', transition: 'width 1s' }} />
                          </div>
                          <div style={{ fontSize: '10px', color: c.text3, marginTop: '3px' }}>{pct}%</div>
                        </div>
                      )}
                      {b.failedCount > 0 && (
                        <div style={{ fontSize: '11px', color: c.red, marginTop: '3px' }}>
                          {b.failedCount} ошибок
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
