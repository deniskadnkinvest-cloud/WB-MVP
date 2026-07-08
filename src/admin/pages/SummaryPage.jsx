import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Statistic, Timeline, Tag, Spin, Button, Space, Typography, Alert } from 'antd';
import {
  UserOutlined,
  ThunderboltOutlined,
  StarOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  GiftOutlined,
} from '@ant-design/icons';
import { useAdmin } from '../AdminApp';

const { Title, Text } = Typography;

const PLAN_NAMES = { trial: 'Старт', base: 'Про', pro: 'Бизнес' };
const PLAN_COLORS = { trial: 'orange', base: 'cyan', pro: 'purple' };

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

export default function SummaryPage() {
  const { authHeaders } = useAdmin();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    totalUsers = 0,
    activeUsers = 0,
    generationsTotal = 0,
    generationsToday = 0,
    revenueToday = 0,
    revenueTotal = 0,
    revenueWeek = 0,
    realPaymentsCount = 0,
    conversionRate = 0,
    recentPayments = [],
    recentAdminGrants = [],
    generatedAt,
  } = data || {};

  // Build events timeline
  const events = [
    ...recentPayments.map(p => ({ ...p, _type: 'payment' })),
    ...recentAdminGrants.map(g => ({ ...g, _type: 'grant' })),
  ]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Refresh bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <Text type="secondary">
          <ClockCircleOutlined /> Обновлено: {generatedAt ? new Date(generatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'}
        </Text>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Обновить</Button>
      </div>

      {/* ═══ Метрики ═══ */}
      <Row gutter={[12, 12]}>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Доход сегодня" value={revenueToday} suffix="₽" valueStyle={{ color: '#faad14' }} prefix={<StarOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Доход за неделю" value={revenueWeek} suffix="₽" valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Доход всего" value={revenueTotal} suffix="₽" valueStyle={{ color: '#d4b106' }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Пользователи" value={totalUsers} prefix={<UserOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="С тарифом" value={activeUsers} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Конверсия" value={conversionRate} suffix="%" valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Генерации сегодня" value={generationsToday} prefix={<ThunderboltOutlined />} valueStyle={{ color: '#13c2c2' }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Генерации всего" value={generationsTotal} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Оплат всего" value={realPaymentsCount} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      {/* ═══ Лента событий ═══ */}
      <Card title="Последние события" style={{ marginTop: '16px' }} size="small">
        {events.length === 0 ? (
          <Text type="secondary">Событий пока нет</Text>
        ) : (
          <Timeline
            items={events.map((event, i) => ({
              color: event._type === 'grant' ? 'green' : 'blue',
              dot: event._type === 'grant' ? <GiftOutlined /> : <StarOutlined />,
              children: (
                <div key={i}>
                  <Space size={4}>
                    <Tag color={event._type === 'grant' ? 'green' : 'blue'}>
                      {event._type === 'grant' ? 'Выдача' : 'Оплата'}
                    </Tag>
                    <Tag color={PLAN_COLORS[event.planId] || 'default'}>
                      {PLAN_NAMES[event.planId] || event.planId || '—'}
                    </Tag>
                    {event.amount != null && <Text strong>{event.amount} ₽</Text>}
                    {event.credits != null && <Text strong>+{event.credits} кр.</Text>}
                  </Space>
                  <div>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {event.uid ? `${event.uid.slice(0, 12)}…` : '—'} · {timeAgo(event.date)}
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
