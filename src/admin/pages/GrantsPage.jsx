import React, { useState, useCallback } from 'react';
import {
  Input, Button, Card, Descriptions, Select, InputNumber, Space,
  message, Spin, Typography, Divider, Tag, Row, Col, Timeline, Form, Statistic
} from 'antd';
import {
  SearchOutlined, UserOutlined, GiftOutlined, PlusOutlined,
  StopOutlined, CheckCircleOutlined, CloseCircleOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import { useAdmin } from '../AdminApp';

const { Text, Title } = Typography;

const PLAN_LABELS = { none: 'Нет тарифа', trial: 'Старт', base: 'Про', pro: 'Бизнес' };
const PLAN_COLORS = { none: 'default', trial: 'orange', base: 'cyan', pro: 'purple' };

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function GrantsPage() {
  const { authHeaders } = useAdmin();
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState(null);
  const [opLoading, setOpLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('trial');
  const [creditsAmount, setCreditsAmount] = useState(25);
  const [note, setNote] = useState('');

  const handleSearch = useCallback(async (idToSearch) => {
    const cleanId = (idToSearch || identifier).trim();
    if (!cleanId) {
      message.warning('Введите идентификатор пользователя');
      return;
    }
    setLoading(true);
    setUserData(null);
    try {
      const res = await fetch('/api/admin/user-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ action: 'lookup', identifier: cleanId }),
      });
      const json = await res.json();
      if (json.ok) {
        setUserData(json.user);
        message.success('Пользователь найден');
      } else {
        message.error(json.error || 'Пользователь не найден');
      }
    } catch {
      message.error('Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  }, [identifier, authHeaders]);

  const doAction = async (action, extra = {}) => {
    if (!userData?.uid) return;
    setOpLoading(true);
    try {
      const res = await fetch('/api/admin/user-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ action, identifier: userData.uid, note, ...extra }),
      });
      const json = await res.json();
      if (json.ok) {
        message.success('Успешно обновлено');
        setUserData(json.user);
        setNote('');
      } else {
        message.error(json.error || 'Ошибка выполнения операции');
      }
    } catch {
      message.error('Ошибка соединения');
    } finally {
      setOpLoading(false);
    }
  };

  const sub = userData?.subscription || {};
  const profile = userData?.profile || {};
  const summary = userData?.generationSummary || {};
  const payments = userData?.payments || [];

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* ── Поиск пользователя ── */}
      <Card
        size="small"
        title={<><SearchOutlined style={{ color: '#818cf8' }} /> Поиск пользователя для выдачи тарифа</>}
        style={{ border: '1px solid rgba(129,140,248,0.2)' }}
      >
        <Space.Compact style={{ width: '100%' }}>
          <Input
            prefix={<UserOutlined />}
            placeholder="Введи Telegram ID, Email или Firebase UID"
            size="large"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            onPressEnter={() => handleSearch()}
          />
          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined />}
            loading={loading}
            onClick={() => handleSearch()}
          >
            Найти
          </Button>
        </Space.Compact>
      </Card>

      {/* ── Информационный блок, если найден ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" tip="Загрузка профиля пользователя..." />
        </div>
      )}

      {!loading && userData && (
        <Row gutter={[16, 16]}>
          
          {/* Левая колонка: Профиль и Статистика */}
          <Col xs={24} md={12} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Карточка пользователя */}
            <Card size="small" title="Профиль пользователя">
              <Descriptions column={1} size="small" bordered={false}>
                <Descriptions.Item label="UID">
                  <Text code copyable>{userData.uid || '—'}</Text>
                </Descriptions.Item>
                {sub.telegramId && (
                  <Descriptions.Item label="Telegram ID">
                    <Text code copyable>{sub.telegramId}</Text>
                  </Descriptions.Item>
                )}
                {profile?.email && (
                  <Descriptions.Item label="Email">
                    <Text copyable>{profile.email}</Text>
                  </Descriptions.Item>
                )}
                {profile?.displayName && (
                  <Descriptions.Item label="Имя">{profile.displayName}</Descriptions.Item>
                )}
                <Descriptions.Item label="Регистрация">
                  {sub.telegramId ? <Tag color="blue">Telegram</Tag> : profile?.email ? <Tag color="green">Email</Tag> : <Tag>Неизвестно</Tag>}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {/* Карточка баланса */}
            <Row gutter={12}>
              <Col span={12}>
                <Card size="small">
                  <Statistic
                    title="Текущий тариф"
                    value={PLAN_LABELS[sub.plan] || sub.plan || 'Нет'}
                    valueStyle={{ color: sub.plan && sub.plan !== 'none' ? '#52c41a' : '#ff4d4f', fontSize: '18px' }}
                  />
                  {sub.planExpiresAt && (
                    <Text type="secondary" style={{ fontSize: '11px' }}>До {fmtDate(sub.planExpiresAt)}</Text>
                  )}
                  {sub.grantedByAdmin && <Tag color="gold" style={{ marginTop: '4px' }}>Выдан админом</Tag>}
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small">
                  <Statistic
                    title="Кадры / Баланс"
                    value={sub.credits || 0}
                    suffix={`/ ${sub.creditsTotal || 0}`}
                    valueStyle={{ fontSize: '18px' }}
                  />
                  <Text type="secondary" style={{ fontSize: '11px' }}>
                    Использовано: {sub.creditsUsed || 0}
                  </Text>
                </Card>
              </Col>
            </Row>

            {/* Карточка генераций */}
            <Card size="small" title={`Активность генераций (${summary.total || 0})`}>
              <Row gutter={12}>
                <Col span={12}>
                  <Statistic title="Успешные" value={summary.success || 0} valueStyle={{ color: '#52c41a', fontSize: '16px' }} prefix={<CheckCircleOutlined />} />
                </Col>
                <Col span={12}>
                  <Statistic title="Ошибки" value={summary.failed || 0} valueStyle={{ color: '#ff4d4f', fontSize: '16px' }} prefix={<CloseCircleOutlined />} />
                </Col>
              </Row>
              {summary.lastAt && (
                <div style={{ marginTop: '8px' }}>
                  <Text type="secondary" style={{ fontSize: '11px' }}>Активность: {fmtDate(summary.lastAt)}</Text>
                </div>
              )}
            </Card>

          </Col>

          {/* Правая колонка: Управление доступами */}
          <Col xs={24} md={12} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            <Card
              size="small"
              title={<><GiftOutlined /> Панель начислений</>}
              style={{ border: '1px solid rgba(129,140,248,0.3)' }}
            >
              <Form layout="vertical" size="small">
                <Form.Item label="Заметка/Причина начисления">
                  <Input.TextArea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Например: Выдача по акции..." />
                </Form.Item>

                <Divider style={{ margin: '12px 0' }}>Выдать тариф</Divider>
                <Space.Compact style={{ width: '100%' }}>
                  <Select value={selectedPlan} onChange={setSelectedPlan} style={{ width: '65%' }}>
                    <Select.Option value="trial">🎯 Тест-драйв (10 кадров)</Select.Option>
                    <Select.Option value="base">⚡ Про (100 кадров)</Select.Option>
                    <Select.Option value="pro">🚀 Бизнес (350 кадров)</Select.Option>
                  </Select>
                  <Button type="primary" icon={<GiftOutlined />} loading={opLoading} onClick={() => doAction('set-plan', { plan: selectedPlan })}>
                    Выдать тариф
                  </Button>
                </Space.Compact>

                <Divider style={{ margin: '12px 0' }}>Начислить кадры (дополнительно)</Divider>
                <Space.Compact style={{ width: '100%' }}>
                  <InputNumber
                    min={1} max={10000} value={creditsAmount}
                    onChange={v => setCreditsAmount(v)}
                    style={{ width: '65%' }}
                    addonBefore={<PlusOutlined />}
                  />
                  <Button type="primary" ghost icon={<PlusOutlined />} loading={opLoading} onClick={() => doAction('add-credits', { credits: creditsAmount })}>
                    Добавить
                  </Button>
                </Space.Compact>

                <Divider style={{ margin: '12px 0' }}>Сбросить доступ</Divider>
                <Button danger block icon={<StopOutlined />} loading={opLoading} onClick={() => doAction('disable-plan')}>
                  Отключить текущий тариф
                </Button>
              </Form>
            </Card>

            {/* Логи последних транзакций / оплат */}
            {payments.length > 0 && (
              <Card size="small" title="История начислений">
                <Timeline
                  style={{ marginTop: '8px' }}
                  items={payments.slice(0, 5).map((p, i) => ({
                    color: p.method === 'admin_set_plan' || p.isGranted ? 'gold' : 'blue',
                    children: (
                      <div key={i}>
                        <Space>
                          <Tag color={PLAN_COLORS[p.planId] || 'default'}>{PLAN_LABELS[p.planId] || p.planId || '—'}</Tag>
                          {p.amount && <Text strong>+{p.amount} кадров</Text>}
                        </Space>
                        <div>
                          <Text type="secondary" style={{ fontSize: '11px' }}>
                            {fmtDate(p.date)} {p.note && `· ${p.note}`}
                          </Text>
                        </div>
                      </div>
                    ),
                  }))}
                />
              </Card>
            )}

          </Col>

        </Row>
      )}

    </div>
  );
}
