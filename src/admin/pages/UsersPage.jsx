import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Input, Button, Drawer, Card, Descriptions, Select,
  InputNumber, Space, message, Spin, Typography, Divider, Empty, Badge,
  Form, Timeline, Statistic, Row, Col,
} from 'antd';
import {
  SearchOutlined, UserOutlined, ReloadOutlined, GiftOutlined,
  PlusOutlined, StopOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useAdmin } from '../AdminApp';

const { Text, Title } = Typography;
const { Search } = Input;

const PLAN_LABELS = { none: 'Нет тарифа', trial: 'Старт', base: 'Про', pro: 'Бизнес' };
const PLAN_COLORS = { none: 'default', trial: 'orange', base: 'cyan', pro: 'purple' };

const TYPE_LABELS = {
  fashion: 'Одежда', product: 'Товары', quick: 'Быстрая',
  card: 'Карточка', calibration: 'Калибровка', autocatalog: 'Авто-каталог',
  card_edit: 'Правка карточки', photo_edit: 'Правка фото',
  ugc: 'UGC', model: 'Модель',
};

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ════════════════════════════════════════
//  User Detail Drawer
// ════════════════════════════════════════
function UserDetailDrawer({ open, onClose, userId, authHeaders, onRefreshList }) {
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState(null);
  const [opLoading, setOpLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('trial');
  const [creditsAmount, setCreditsAmount] = useState(25);
  const [note, setNote] = useState('');

  const lookup = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/user-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ action: 'lookup', identifier: id }),
      });
      const json = await res.json();
      if (json.ok) setUserData(json.user);
      else message.error(json.error || 'Не найден');
    } catch {
      message.error('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (open && userId) {
      setUserData(null);
      lookup(userId);
    }
  }, [open, userId, lookup]);

  const doAction = async (action, extra = {}) => {
    setOpLoading(true);
    try {
      const res = await fetch('/api/admin/user-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ action, identifier: userId, note, ...extra }),
      });
      const json = await res.json();
      if (json.ok) {
        message.success(`Операция "${action}" выполнена`);
        setUserData(json.user);
        if (onRefreshList) onRefreshList();
      } else {
        message.error(json.error || 'Ошибка');
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
  const generations = userData?.generations || [];
  const payments = userData?.payments || [];

  return (
    <Drawer
      title={<><UserOutlined /> Профиль пользователя</>}
      placement="right"
      width={Math.min(500, window.innerWidth)}
      onClose={onClose}
      open={open}
      styles={{ body: { padding: '16px' } }}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '40px' }}><Spin size="large" /></div>
      ) : !userData ? (
        <Empty description="Данные не загружены" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* ═══ Основная информация ═══ */}
          <Card size="small" title="Информация">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="UID">
                <Text code copyable>{userData.user?.uid || '—'}</Text>
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
              <Descriptions.Item label="Канал">
                {sub.telegramId ? <Tag color="blue">Telegram</Tag> : profile?.email ? <Tag color="green">Email</Tag> : <Tag>Неизвестно</Tag>}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* ═══ Тариф и кредиты ═══ */}
          <Row gutter={12}>
            <Col span={12}>
              <Card size="small">
                <Statistic
                  title="Тариф"
                  value={PLAN_LABELS[sub.plan] || sub.plan || 'Нет'}
                  valueStyle={{ color: sub.plan && sub.plan !== 'none' ? '#52c41a' : '#ff4d4f', fontSize: '18px' }}
                />
                {sub.planExpiresAt && (
                  <Text type="secondary" style={{ fontSize: '11px' }}>До {fmtDate(sub.planExpiresAt)}</Text>
                )}
                {sub.grantedByAdmin && <Tag color="gold" style={{ marginTop: '4px' }}>Админ</Tag>}
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small">
                <Statistic
                  title="Кредиты"
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

          {/* ═══ Генерации ═══ */}
          <Card size="small" title={`Генерации (${summary.total || 0})`}>
            <Row gutter={12}>
              <Col span={8}>
                <Statistic title="Успешные" value={summary.success || 0} valueStyle={{ color: '#52c41a', fontSize: '16px' }} prefix={<CheckCircleOutlined />} />
              </Col>
              <Col span={8}>
                <Statistic title="Ошибки" value={summary.failed || 0} valueStyle={{ color: '#ff4d4f', fontSize: '16px' }} prefix={<CloseCircleOutlined />} />
              </Col>
              <Col span={8}>
                <Statistic title="Ср. время" value={summary.avgDurationMs ? `${(summary.avgDurationMs / 1000).toFixed(1)}с` : '—'} valueStyle={{ fontSize: '16px' }} />
              </Col>
            </Row>
            {summary.byType && Object.keys(summary.byType).length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <Text type="secondary" style={{ fontSize: '11px' }}>По типам:</Text>
                <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {Object.entries(summary.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                    <Tag key={type}>{TYPE_LABELS[type] || type}: {count}</Tag>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* ═══ УПРАВЛЕНИЕ ДОСТУПОМ ═══ */}
          <Card
            size="small"
            title={<><GiftOutlined /> Управление доступом</>}
            style={{ border: '1px solid rgba(129,140,248,0.3)' }}
          >
            <Form layout="vertical" size="small">
              <Form.Item label="Заметка (опционально)">
                <Input.TextArea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Причина выдачи доступа..." />
              </Form.Item>

              <Divider style={{ margin: '12px 0' }}>Выдать тариф</Divider>
              <Space.Compact style={{ width: '100%' }}>
                <Select value={selectedPlan} onChange={setSelectedPlan} style={{ width: '60%' }}>
                  <Select.Option value="trial">🟡 Старт (10 генераций)</Select.Option>
                  <Select.Option value="base">🔵 Про (100 генераций)</Select.Option>
                  <Select.Option value="pro">🟣 Бизнес (350 генераций)</Select.Option>
                </Select>
                <Button type="primary" icon={<GiftOutlined />} loading={opLoading} onClick={() => doAction('set-plan', { plan: selectedPlan })}>
                  Выдать
                </Button>
              </Space.Compact>

              <Divider style={{ margin: '12px 0' }}>Начислить кредиты</Divider>
              <Space.Compact style={{ width: '100%' }}>
                <InputNumber
                  min={1} max={10000} value={creditsAmount}
                  onChange={v => setCreditsAmount(v)}
                  style={{ width: '60%' }}
                  addonBefore={<PlusOutlined />}
                />
                <Button type="primary" ghost icon={<PlusOutlined />} loading={opLoading} onClick={() => doAction('add-credits', { credits: creditsAmount })}>
                  Начислить
                </Button>
              </Space.Compact>

              <Divider style={{ margin: '12px 0' }}>Отключить тариф</Divider>
              <Button danger icon={<StopOutlined />} loading={opLoading} onClick={() => doAction('disable-plan')}>
                Отключить тариф
              </Button>
            </Form>
          </Card>

          {/* ═══ Последние генерации ═══ */}
          {generations.length > 0 && (
            <Card size="small" title={`Последние генерации (${generations.length})`}>
              <Timeline
                items={generations.slice(0, 15).map((gen, i) => ({
                  color: gen.success === false ? 'red' : 'green',
                  dot: gen.success === false ? <CloseCircleOutlined /> : <ThunderboltOutlined />,
                  children: (
                    <div key={i}>
                      <Space>
                        <Tag color={gen.success === false ? 'red' : 'green'}>
                          {TYPE_LABELS[gen.type] || gen.type || 'Генерация'}
                        </Tag>
                        {gen.success === false && <Text type="danger" style={{ fontSize: '11px' }}>{gen.error?.slice(0, 50)}</Text>}
                      </Space>
                      <div>
                        <Text type="secondary" style={{ fontSize: '11px' }}>{fmtDate(gen.createdAt)}</Text>
                      </div>
                    </div>
                  ),
                }))}
              />
            </Card>
          )}

          {/* ═══ Платежи ═══ */}
          {payments.length > 0 && (
            <Card size="small" title={`Платежи (${payments.length})`}>
              <Timeline
                items={payments.slice(0, 10).map((p, i) => ({
                  color: p.method === 'admin_set_plan' || p.isGranted ? 'gold' : 'blue',
                  children: (
                    <div key={i}>
                      <Space>
                        <Tag color={PLAN_COLORS[p.planId] || 'default'}>{PLAN_LABELS[p.planId] || p.planId || '—'}</Tag>
                        {p.amount && <Text strong>{p.amount} ⭐</Text>}
                        {p.isGranted && <Tag color="gold">Админ</Tag>}
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
        </div>
      )}
    </Drawer>
  );
}

// ════════════════════════════════════════
//  Users Page (Main)
// ════════════════════════════════════════
export default function UsersPage() {
  const { authHeaders } = useAdmin();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchVal, setSearchVal] = useState('');
  const [quickId, setQuickId] = useState('');

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users?limit=200', { headers: { ...authHeaders } });
      const json = await res.json();
      if (json.ok) setUsers(json.users || []);
      else message.error(json.error || 'Сервер вернул ошибку при загрузке пользователей');
    } catch {
      message.error('Не удалось загрузить пользователей');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const openUser = (uid) => {
    setSelectedUserId(uid);
    setDrawerOpen(true);
  };

  const handleSearch = (value) => {
    const v = value.trim();
    if (v) {
      // If it looks like a specific ID search, open drawer directly
      if (/^\d{5,}$/.test(v) || v.includes('@') || v.length > 20) {
        openUser(v);
        return;
      }
    }
    setSearchVal(v);
  };

  const filtered = users.filter(u => {
    if (!searchVal) return true;
    const term = searchVal.toLowerCase();
    return (
      (u.uid && u.uid.toLowerCase().includes(term)) ||
      (u.telegramId && String(u.telegramId).includes(term)) ||
      (u.email && u.email.toLowerCase().includes(term)) ||
      (u.displayName && u.displayName.toLowerCase().includes(term)) ||
      (u.firstName && u.firstName.toLowerCase().includes(term)) ||
      (u.username && u.username.toLowerCase().includes(term))
    );
  });

  const columns = [
    {
      title: 'Пользователь',
      key: 'user',
      render: (_, record) => {
        const name = record.displayName || record.firstName || record.username;
        const id = record.telegramId ? `TG ${record.telegramId}` : record.email || `UID ${(record.uid || '').slice(0, 8)}…`;
        return (
          <div>
            <div>
              <Text strong style={{ fontSize: '13px' }}>{name || 'Без имени'}</Text>
            </div>
            <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }}>{id}</Text>
          </div>
        );
      },
    },
    {
      title: 'Тариф',
      key: 'plan',
      width: 100,
      filters: [
        { text: 'Старт', value: 'trial' },
        { text: 'Про', value: 'base' },
        { text: 'Бизнес', value: 'pro' },
        { text: 'Нет', value: 'none' },
      ],
      onFilter: (value, record) => (record.plan || 'none') === value,
      render: (_, record) => (
        <Tag color={PLAN_COLORS[record.plan] || 'default'}>
          {PLAN_LABELS[record.plan] || record.plan || 'Нет'}
        </Tag>
      ),
    },
    {
      title: 'Кредиты',
      key: 'credits',
      width: 80,
      sorter: (a, b) => (a.credits || 0) - (b.credits || 0),
      render: (_, record) => <Text>{record.credits || 0}</Text>,
    },
    {
      title: 'Генерации',
      key: 'gens',
      width: 90,
      sorter: (a, b) => (a.generationCount || 0) - (b.generationCount || 0),
      render: (_, record) => <Text>{record.generationCount || 0}</Text>,
    },
    {
      title: '',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); openUser(record.uid); }}>
          Открыть
        </Button>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>

      {/* Search + Actions */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <Search
          placeholder="Фильтр по таблице..."
          allowClear
          onSearch={handleSearch}
          onChange={e => { if (!e.target.value) setSearchVal(''); }}
          style={{ maxWidth: '400px', flex: 1 }}
        />
        <Button icon={<ReloadOutlined />} onClick={loadUsers} loading={loading}>Обновить</Button>
      </div>

      {/* Users Table */}
      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="uid"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], showTotal: (total) => `Всего: ${total}` }}
        onRow={(record) => ({
          onClick: () => openUser(record.uid),
          style: { cursor: 'pointer' },
        })}
        locale={{ emptyText: <Empty description="Пользователей не найдено" /> }}
      />

      {/* User Detail Drawer */}
      <UserDetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userId={selectedUserId}
        authHeaders={authHeaders}
        onRefreshList={loadUsers}
      />
    </div>
  );
}
