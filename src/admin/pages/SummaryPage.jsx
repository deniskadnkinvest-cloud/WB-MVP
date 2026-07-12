import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Statistic, Timeline, Tag, Spin, Button, Space, Typography, Alert, Progress, Tooltip, Segmented } from 'antd';
import {
  UserOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  GiftOutlined,
  RiseOutlined,
  CrownOutlined,
  WalletOutlined,
  TeamOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import { useAdmin } from '../AdminApp';

const { Text } = Typography;

const PLAN_NAMES = { none: 'Без тарифа', trial: 'Старт', base: 'Про', pro: 'Бизнес' };
const PLAN_COLORS = { none: '#3f3f46', trial: '#faad14', base: '#13c2c2', pro: '#9254de' };

const fmtRub = (n) => `${(Number(n) || 0).toLocaleString('ru-RU')} ₽`;
const fmtNum = (n) => (Number(n) || 0).toLocaleString('ru-RU');

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  return `${Math.floor(hrs / 24)} дн назад`;
}

// ── Инлайн-SVG график тренда (без внешних зависимостей) ──
function TrendChart({ data = [], valueKey, color, formatValue = fmtNum, height = 130 }) {
  if (!data.length) return <Text type="secondary">Нет данных</Text>;
  const W = 720, H = height, padB = 22, padT = 8;
  const max = Math.max(1, ...data.map(d => d[valueKey] || 0));
  const n = data.length;
  const gap = 6;
  const barW = (W - gap * (n - 1)) / n;
  const chartH = H - padB - padT;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ display: 'block', minWidth: 360 }}>
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={0} x2={W} y1={padT + chartH * f} y2={padT + chartH * f}
            stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
        ))}
        {data.map((d, i) => {
          const v = d[valueKey] || 0;
          const h = Math.max(v > 0 ? 3 : 0, (v / max) * chartH);
          const x = i * (barW + gap);
          const y = padT + chartH - h;
          const isToday = i === n - 1;
          return (
            <g key={d.date}>
              <title>{`${d.date}: ${formatValue(v)}`}</title>
              <rect x={x} y={y} width={barW} height={h} rx={3}
                fill={isToday ? color : `${color}99`} />
            </g>
          );
        })}
        {data.map((d, i) => (
          (i === 0 || i === n - 1 || i === Math.floor(n / 2)) ? (
            <text key={`t${d.date}`} x={i * (barW + gap) + barW / 2} y={H - 6}
              fill="rgba(255,255,255,0.4)" fontSize={11} textAnchor="middle">
              {d.date.slice(5)}
            </text>
          ) : null
        ))}
      </svg>
    </div>
  );
}

// ── Распределение пользователей по планам ──
function PlanDistribution({ planCounts = {}, totalUsers = 0 }) {
  const order = ['pro', 'base', 'trial', 'none'];
  const total = totalUsers || Object.values(planCounts).reduce((a, b) => a + b, 0) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
        {order.map(k => {
          const pct = ((planCounts[k] || 0) / total) * 100;
          return pct > 0 ? <div key={k} style={{ width: `${pct}%`, background: PLAN_COLORS[k] }} title={`${PLAN_NAMES[k]}: ${planCounts[k]}`} /> : null;
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {order.map(k => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: PLAN_COLORS[k], display: 'inline-block' }} />
            <Text style={{ fontSize: 12 }}>{PLAN_NAMES[k]}</Text>
            <Text strong style={{ fontSize: 12 }}>{fmtNum(planCounts[k] || 0)}</Text>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SummaryPage() {
  const { authHeaders } = useAdmin();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trendMetric, setTrendMetric] = useState('revenue');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/stats', { headers: { ...authHeaders } })
      .then(r => r.json())
      .then(res => {
        if (res.ok) setData(res.data);
        else setError(res.error || 'Ошибка загрузки');
      })
      .catch(() => setError('Нет соединения'))
      .finally(() => setLoading(false));
  }, [authHeaders]);

  useEffect(() => { load(); }, []); // eslint-disable-line

  if (loading && !data) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '80px' }}><Spin size="large" /></div>;
  }
  if (error && !data) {
    return <Alert message="Ошибка" description={error} type="error" showIcon action={<Button onClick={load}>Повторить</Button>} />;
  }

  const {
    totalUsers = 0, activeUsers = 0, payingUsers = 0,
    newUsersToday = 0, newUsersWeek = 0,
    generationsTotal = 0, generationsToday = 0, generationsWeek = 0, successRate = 100,
    revenueToday = 0, revenueWeek = 0, revenueMonth = 0, revenueTotal = 0,
    revenueSubscriptions = 0, revenueTopups = 0,
    realPaymentsCount = 0, conversionRate = 0, payingConversion = 0,
    mrr = 0, arppu = 0,
    planCounts = {}, trend = [],
    adminGrantsCount = 0, grantedCreditsTotal = 0,
    recentPayments = [], recentAdminGrants = [],
    generatedAt,
  } = data || {};

  const events = [
    ...recentPayments.map(p => ({ ...p, _type: 'payment' })),
    ...recentAdminGrants.map(g => ({ ...g, _type: 'grant' })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 12);

  const trendCfg = {
    revenue: { valueKey: 'revenue', color: '#faad14', fmt: fmtRub, label: 'Выручка' },
    generations: { valueKey: 'generations', color: '#13c2c2', fmt: fmtNum, label: 'Генерации' },
    newUsers: { valueKey: 'newUsers', color: '#9254de', fmt: fmtNum, label: 'Новые юзеры' },
  }[trendMetric];

  const splitTotal = revenueSubscriptions + revenueTopups || 1;

  return (
    <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
      {/* Refresh bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text type="secondary">
          <ClockCircleOutlined /> Обновлено: {generatedAt ? new Date(generatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'}
        </Text>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Обновить</Button>
      </div>

      {/* ═══ HERO: Деньги ═══ */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card size="small" style={{ background: 'linear-gradient(135deg, rgba(250,173,20,0.12), rgba(250,173,20,0.02))', border: '1px solid rgba(250,173,20,0.25)' }}>
            <Statistic title={<span><CrownOutlined /> MRR (регулярный доход)</span>} value={mrr} suffix="₽" valueStyle={{ color: '#faad14', fontWeight: 700 }} />
            <Text type="secondary" style={{ fontSize: 11 }}>активные подписки × цена/мес</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={<span><DollarOutlined /> Доход сегодня</span>} value={revenueToday} suffix="₽" valueStyle={{ color: '#52c41a' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>за неделю: {fmtRub(revenueWeek)}</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Доход за месяц" value={revenueMonth} suffix="₽" valueStyle={{ color: '#d4b106' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>с 1-го числа</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Доход всего" value={revenueTotal} suffix="₽" valueStyle={{ color: '#d4b106' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>{realPaymentsCount} оплат</Text>
          </Card>
        </Col>
      </Row>

      {/* ═══ Юзеры / конверсия ═══ */}
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={<span><TeamOutlined /> Пользователи</span>} value={totalUsers} />
            <Text type="secondary" style={{ fontSize: 11 }}>+{newUsersToday} сегодня · +{newUsersWeek} за неделю</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="С активным тарифом" value={activeUsers} valueStyle={{ color: '#13c2c2' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>конверсия {conversionRate}%</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={<span><WalletOutlined /> Платящие</span>} value={payingUsers} valueStyle={{ color: '#52c41a' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>{payingConversion}% от всех</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={<span><RiseOutlined /> ARPPU</span>} value={arppu} suffix="₽" valueStyle={{ color: '#1890ff' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>доход на платящего</Text>
          </Card>
        </Col>
      </Row>

      {/* ═══ Тренд ═══ */}
      <Card
        size="small"
        style={{ marginTop: 12 }}
        title={<span><RiseOutlined /> Динамика за 14 дней</span>}
        extra={
          <Segmented
            size="small"
            value={trendMetric}
            onChange={setTrendMetric}
            options={[
              { label: 'Выручка', value: 'revenue' },
              { label: 'Генерации', value: 'generations' },
              { label: 'Юзеры', value: 'newUsers' },
            ]}
          />
        }
      >
        <TrendChart data={trend} valueKey={trendCfg.valueKey} color={trendCfg.color} formatValue={trendCfg.fmt} />
      </Card>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        {/* Планы */}
        <Col xs={24} md={12}>
          <Card size="small" title="Распределение по тарифам" style={{ height: '100%' }}>
            <PlanDistribution planCounts={planCounts} totalUsers={totalUsers} />
          </Card>
        </Col>

        {/* Структура выручки + генерации */}
        <Col xs={24} md={12}>
          <Card size="small" title="Структура выручки" style={{ height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 13 }}>Подписки</Text>
                  <Text strong style={{ fontSize: 13 }}>{fmtRub(revenueSubscriptions)}</Text>
                </div>
                <Progress percent={Math.round((revenueSubscriptions / splitTotal) * 100)} showInfo={false} strokeColor="#13c2c2" size="small" />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 13 }}>Пополнения (top-up)</Text>
                  <Text strong style={{ fontSize: 13 }}>{fmtRub(revenueTopups)}</Text>
                </div>
                <Progress percent={Math.round((revenueTopups / splitTotal) * 100)} showInfo={false} strokeColor="#faad14" size="small" />
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, display: 'flex', gap: 16 }}>
                <Tooltip title="Успешность генераций">
                  <div>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Генерации сегодня / неделя</Text>
                    <Text strong><ThunderboltOutlined style={{ color: '#13c2c2' }} /> {fmtNum(generationsToday)} / {fmtNum(generationsWeek)}</Text>
                  </div>
                </Tooltip>
                <div>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Success rate</Text>
                  <Text strong style={{ color: successRate >= 90 ? '#52c41a' : successRate >= 70 ? '#faad14' : '#ff4d4f' }}>
                    <CheckCircleOutlined /> {successRate}%
                  </Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Выдано админом</Text>
                  <Text strong><GiftOutlined style={{ color: '#faad14' }} /> {fmtNum(grantedCreditsTotal)} кадров</Text>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* ═══ Лента событий ═══ */}
      <Card title="Последние события" style={{ marginTop: 12 }} size="small">
        {events.length === 0 ? (
          <Text type="secondary">Событий пока нет</Text>
        ) : (
          <Timeline
            items={events.map((event, i) => ({
              color: event._type === 'grant' ? 'gold' : 'green',
              dot: event._type === 'grant' ? <GiftOutlined /> : <DollarOutlined />,
              children: (
                <div key={i}>
                  <Space size={4} wrap>
                    <Tag color={event._type === 'grant' ? 'gold' : 'green'}>
                      {event._type === 'grant' ? 'Выдача' : 'Оплата'}
                    </Tag>
                    <Tag color={PLAN_COLORS[event.planId] ? undefined : 'default'} style={PLAN_COLORS[event.planId] ? { color: PLAN_COLORS[event.planId], borderColor: PLAN_COLORS[event.planId] } : undefined}>
                      {PLAN_NAMES[event.planId] || event.planId || '—'}
                    </Tag>
                    {event._type === 'payment' && event.amount != null && <Text strong style={{ color: '#52c41a' }}>{fmtRub(event.amount)}</Text>}
                    {event._type === 'grant' && event.credits != null && <Text strong style={{ color: '#faad14' }}>+{event.credits} кадров</Text>}
                    {event.grantedByName && <Text type="secondary" style={{ fontSize: 11 }}>· {event.grantedByName}</Text>}
                  </Space>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {event.uid ? `${String(event.uid).slice(0, 16)}…` : '—'} · {timeAgo(event.date)}
                    </Text>
                  </div>
                </div>
              ),
            }))}
          />
        )}
      </Card>
    </div>
  );
}
