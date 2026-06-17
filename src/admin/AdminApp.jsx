import React, { useState, useEffect, createContext, useContext, useMemo, lazy, Suspense } from 'react';
import { ConfigProvider, theme, Layout, Menu, Spin, Result, Button, Avatar } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  SettingOutlined,
  SoundOutlined,
  BugOutlined,
  RobotOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import ruRU from 'antd/locale/ru_RU';

const { Header, Sider, Content } = Layout;

// ═══════════════════════════════════════════
//  Admin Context
// ═══════════════════════════════════════════
const AdminContext = createContext(null);
export const useAdmin = () => useContext(AdminContext);

// ── Ленивая загрузка страниц ──
const SummaryPage = lazy(() => import('./pages/SummaryPage'));
const UsersPage   = lazy(() => import('./pages/UsersPage'));
const LogTab      = lazy(() => import('./pages/LogTab'));
const Errors      = lazy(() => import('./pages/Errors'));
const Broadcasts  = lazy(() => import('./pages/Broadcasts'));
const Prompts     = lazy(() => import('./pages/Prompts'));

const PAGES = {
  summary:    { component: SummaryPage,  label: 'Сводка',           icon: <DashboardOutlined /> },
  users:      { component: UsersPage,    label: 'Пользователи',     icon: <TeamOutlined /> },
  log:        { component: LogTab,       label: 'Лог генераций',    icon: <ThunderboltOutlined /> },
  errors:     { component: Errors,       label: 'Ошибки',           icon: <BugOutlined /> },
  prompts:    { component: Prompts,      label: 'Промпты',          icon: <RobotOutlined /> },
  broadcasts: { component: Broadcasts,   label: 'Рассылки',         icon: <SoundOutlined /> },
};

export default function AdminApp() {
  const [status, setStatus]         = useState('loading');
  const [adminUser, setAdminUser]   = useState(null);
  const [errorMsg, setErrorMsg]     = useState('');
  const [activePage, setActivePage] = useState('summary');
  const [collapsed, setCollapsed]   = useState(false);

  const accessKey = useMemo(() => new URLSearchParams(window.location.search).get('key') || '', []);
  const initData = useMemo(() => {
    try { return window.Telegram?.WebApp?.initData || ''; }
    catch { return ''; }
  }, []);

  useEffect(() => {
    try {
      const tg = window.Telegram?.WebApp;
      if (tg) { tg.expand(); tg.setHeaderColor('#141414'); tg.setBackgroundColor('#141414'); }
    } catch { /* ok */ }

    if (!accessKey && !initData && import.meta.env.DEV) {
      setAdminUser({ id: 0, firstName: 'Dev', username: 'devmode' });
      setStatus('ready');
      return;
    }
    if (!accessKey && !initData) {
      setErrorMsg('Откройте через Telegram бот командой /admin');
      setStatus('error');
      return;
    }

    fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: initData || undefined, accessKey: accessKey || undefined }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) { setAdminUser(data.user); setStatus('ready'); }
        else { setErrorMsg('Нет доступа'); setStatus('error'); }
      })
      .catch(() => { setErrorMsg('Ошибка подключения к серверу'); setStatus('error'); });
  }, [accessKey, initData]);

  const authHeaders = useMemo(() => ({
    'X-Admin-Key': accessKey || '',
    'X-Admin-Init-Data': initData || '',
  }), [accessKey, initData]);

  const contextValue = useMemo(() => ({
    adminUser, accessKey, authHeaders,
  }), [adminUser, accessKey, authHeaders]);

  if (status === 'loading') {
    return (
      <ConfigProvider locale={ruRU} theme={{ algorithm: theme.darkAlgorithm }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#141414' }}>
          <Spin size="large" tip="Загрузка…" />
        </div>
      </ConfigProvider>
    );
  }

  if (status === 'error') {
    return (
      <ConfigProvider locale={ruRU} theme={{ algorithm: theme.darkAlgorithm }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#141414' }}>
          <Result status="403" title="Доступ закрыт" subTitle={errorMsg} />
        </div>
      </ConfigProvider>
    );
  }

  const PageComponent = PAGES[activePage]?.component || SummaryPage;

  const menuItems = Object.entries(PAGES).map(([key, val]) => ({
    key,
    icon: val.icon,
    label: val.label,
  }));

  return (
    <ConfigProvider
      locale={ruRU}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#818cf8',
          borderRadius: 8,
          fontFamily: "'Inter', -apple-system, sans-serif",
        },
      }}
    >
      <AdminContext.Provider value={contextValue}>
        <Layout style={{ minHeight: '100vh' }}>
          {/* ── Sidebar ── */}
          <Sider
            collapsible
            collapsed={collapsed}
            onCollapse={setCollapsed}
            breakpoint="lg"
            collapsedWidth={0}
            trigger={null}
            width={220}
            style={{
              background: '#1a1a1a',
              borderRight: '1px solid rgba(255,255,255,0.06)',
              position: 'fixed',
              height: '100vh',
              left: 0,
              top: 0,
              zIndex: 100,
            }}
          >
            <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>
                Seller Bot
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>
                Админ-панель
              </div>
            </div>
            <Menu
              theme="dark"
              mode="inline"
              selectedKeys={[activePage]}
              onClick={({ key }) => { setActivePage(key); if (window.innerWidth < 992) setCollapsed(true); }}
              items={menuItems}
              style={{ background: 'transparent', borderRight: 'none', marginTop: '8px' }}
            />
          </Sider>

          {/* ── Main Layout ── */}
          <Layout style={{ marginLeft: collapsed ? 0 : (window.innerWidth < 992 ? 0 : 220), transition: 'margin-left 0.2s' }}>
            <Header style={{
              background: '#1a1a1a',
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              position: 'sticky',
              top: 0,
              zIndex: 50,
              height: '56px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Button
                  type="text"
                  icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={() => setCollapsed(!collapsed)}
                  style={{ color: 'rgba(255,255,255,0.65)', fontSize: '18px' }}
                />
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>
                  {PAGES[activePage]?.icon} {PAGES[activePage]?.label || 'Seller Bot'}
                </span>
              </div>
              <Avatar style={{ background: 'linear-gradient(135deg, #818cf8, #c084fc)' }} size={32}>
                {(adminUser?.firstName || 'A')[0].toUpperCase()}
              </Avatar>
            </Header>

            <Content style={{ padding: '16px', minHeight: 'calc(100vh - 56px)', overflow: 'auto' }}>
              <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', paddingTop: '60px' }}><Spin size="large" /></div>}>
                <PageComponent />
              </Suspense>
            </Content>
          </Layout>

          {/* ── Mobile overlay ── */}
          {!collapsed && window.innerWidth < 992 && (
            <div
              onClick={() => setCollapsed(true)}
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.5)',
                zIndex: 99,
              }}
            />
          )}
        </Layout>
      </AdminContext.Provider>
    </ConfigProvider>
  );
}
