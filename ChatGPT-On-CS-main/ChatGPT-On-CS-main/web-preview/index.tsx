/**
 * Web 预览入口 — 主窗口
 * 在浏览器中独立运行，使用 mock 数据模拟 Electron 环境
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import theme from '../../src/renderer/common/styles/theme';
import '../../src/renderer/common/App.css';

// Mock Electron API
(window as any).electron = {
  ipcRenderer: {
    get: (channel: string) => {
      if (channel === 'get-version') return '1.5.0-web-preview';
      if (channel === 'get-health-status') return true;
      return null;
    },
    on: (_channel: string, _handler: Function) => {},
    removeListener: () => {},
    sendMessage: (channel: string, _data?: any) => {
      console.log('[IPC] sendMessage:', channel, _data);
    },
  },
  getArgs: () => [],
};

// Mock WebSocket context
const MockBroadcastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { createContext, useContext, useCallback, useState, useEffect } = require('react');
  const BroadcastCtx = createContext<any>(null);

  const value = {
    registerEventHandler: useCallback((_handler: Function) => {
      return () => {};
    }, []),
  };

  return React.createElement(BroadcastCtx.Provider, { value }, children);
};

// 模拟数据
const mockPlatforms = [
  { id: 'win_qianniu', name: '千牛', type: 'E_COMMERCE', env: 'desktop', running: true },
  { id: 'win_wechat', name: '微信', type: 'HOT', env: 'desktop', running: true },
  { id: 'win_wecom', name: '企微', type: 'HOT', env: 'desktop', running: false },
  { id: 'win_jinmai', name: '京麦', type: 'E_COMMERCE', env: 'desktop', running: true },
  { id: 'win_pdd', name: '拼多多', type: 'E_COMMERCE', env: 'desktop', running: false },
  { id: 'win_douyin', name: '抖音电商', type: 'E_COMMERCE', env: 'desktop', running: true },
];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

// 入口页面（简化版 HomePage，展示所有 UI 组件）
const PreviewApp = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider theme={theme}>
        <MockBroadcastProvider>
          <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto', background: '#f7fafc', minHeight: '100vh' }}>
            {/* 模拟 Navbar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 24px', background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(16px)', borderBottom: '1px solid #f1f5f9',
              borderRadius: '16px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '34px', height: '34px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
                }}>
                  <span style={{ color: 'white', fontWeight: 900, fontSize: '15px' }}>YB</span>
                </div>
                <div>
                  <h1 style={{
                    fontSize: '1.25em', fontWeight: 800, margin: 0,
                    background: 'linear-gradient(135deg, #6366F1 0%, #06B6D4 50%, #818CF8 100%)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  }}>迎波智能客服</h1>
                  <p style={{ fontSize: '9px', color: '#94a3b8', margin: 0, letterSpacing: '0.1em' }}>AI CUSTOMER SERVICE</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button style={navBtnStyle}>📋 记录</button>
                <button style={navBtnStyle}>🔑 关键词</button>
                <button style={{...navBtnStyle, background: '#6366F1', color: 'white', boxShadow: '0 2px 6px rgba(99,102,241,0.25)' }}>⚙️ 设置</button>
              </div>
            </div>

            {/* 平台卡片 */}
            <div style={{
              background: 'white', borderRadius: '16px', padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '16px',
              border: '1px solid #f1f5f9',
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px' }}>📡 平台管理</h3>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {mockPlatforms.map((p) => (
                  <div key={p.id} style={{
                    background: 'white', borderRadius: '12px', padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: '12px',
                    boxShadow: p.running ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                    opacity: p.running ? 1 : 0.5,
                    border: '1px solid #e2e8f0',
                    cursor: p.running ? 'pointer' : 'default',
                    minWidth: '160px', transition: 'all 0.2s',
                  }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '8px',
                      background: p.id === 'win_wechat' ? '#ecfdf5' : p.id === 'win_wecom' ? '#eff6ff' : p.id === 'win_jinmai' ? '#fef2f2' : p.id === 'win_pdd' ? '#fef2f2' : '#fff7ed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: '18px' }}>
                        {p.id === 'win_qianniu' ? '🐂' : p.id === 'win_wechat' ? '💬' : p.id === 'win_wecom' ? '🏢' : p.id === 'win_jinmai' ? '📦' : p.id === 'win_pdd' ? '🛒' : '🎵'}
                      </span>
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{p.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <span style={{
                          width: '6px', height: '6px', borderRadius: '50%',
                          background: p.running ? '#4ade80' : '#d4d4d4',
                          animation: p.running ? 'pulse-ring 2s infinite' : 'none',
                        }} />
                        <span style={{ fontSize: '11px', color: p.running ? '#16a34a' : '#94a3b8' }}>{p.running ? '在线' : '离线'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* 底部状态栏 */}
              <div style={{
                background: 'white', borderRadius: '12px', padding: '10px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                border: '1px solid #f1f5f9', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <span style={{ fontSize: '12px', color: '#334155' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80', display: 'inline-block', marginRight: '4px' }} />
                    <strong>4</strong> 个在线
                  </span>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#d4d4d4', display: 'inline-block', marginRight: '4px' }} />
                    <strong>2</strong> 个离线
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>点击卡片选择平台 · 仅在线可操作</span>
              </div>
            </div>

            {/* 回复工作台 */}
            <div style={{
              background: 'white', borderRadius: '16px', padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '16px',
              border: '1px solid #f1f5f9',
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px' }}>💼 回复工作台</h3>

              {/* 平台标签 */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {[{ id: 'all', label: '全部', count: 12, active: true },
                  { id: 'win_wechat', label: '微信', count: 5, active: false },
                  { id: 'win_qianniu', label: '千牛', count: 4, active: false },
                  { id: 'win_jinmai', label: '京麦', count: 3, active: false },
                ].map((tab) => (
                  <button key={tab.id} style={{
                    padding: '6px 16px', borderRadius: '24px', border: tab.active ? 'none' : '1px solid #e2e8f0',
                    background: tab.active ? '#6366F1' : 'white', color: tab.active ? 'white' : '#64748b',
                    fontSize: '12px', fontWeight: tab.active ? 600 : 500, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    {tab.label}
                    <span style={{
                      background: tab.active ? 'rgba(255,255,255,0.3)' : '#f1f5f9',
                      color: tab.active ? 'white' : '#64748b',
                      borderRadius: '12px', padding: '0 6px', fontSize: '10px',
                    }}>{tab.count}</span>
                  </button>
                ))}
              </div>

              {/* 模式切换 Segmented Control */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', margin: 0 }}>微信 · 回复工作台</h4>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>仅生成建议，不操作客服客户端</p>
                </div>
                <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '12px', padding: '3px', gap: '2px' }}>
                  {[
                    { key: 'hint', label: '💡 仅提示', active: true, color: '#6366F1' },
                    { key: 'assist', label: '🤝 辅助回复', active: false, color: '#22c55e' },
                    { key: 'unattended', label: '🤖 无人值守', active: false, color: '#ef4444' },
                  ].map((m) => (
                    <button key={m.key} style={{
                      padding: '6px 14px', borderRadius: '10px', border: 'none',
                      background: m.active ? m.color : 'transparent',
                      color: m.active ? 'white' : '#64748b',
                      fontSize: '12px', fontWeight: m.active ? 600 : 500,
                      cursor: 'pointer', boxShadow: m.active ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                    }}>{m.label}</button>
                  ))}
                </div>
              </div>

              {/* 回复卡片 */}
              {[
                { sender: '张三', platform: '微信', status: 'pending', statusLabel: '待回复', statusColor: '#f97316', msg: '你好，这个衣服有没有XXL码的？', reply: '亲，有的哦～XXL码库存充足，现在下单今天就能发货呢', time: '2分钟前' },
                { sender: '李四', platform: '千牛', status: 'prepared', statusLabel: '已填入', statusColor: '#3b82f6', msg: '我买的鞋怎么还没发货？已经3天了', reply: '非常抱歉让您久等了！我帮您查一下物流情况，稍等一下哦', time: '5分钟前' },
                { sender: '王五', platform: '京麦', status: 'dismissed', statusLabel: '已处理', statusColor: '#94a3b8', msg: '能便宜点吗？我看别家才卖99', reply: '亲，我们家品质有保障哦，这个价格已经是活动价了呢～', time: '15分钟前' },
              ].map((card, i) => (
                <div key={i} style={{
                  background: 'white', borderRadius: '12px', padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '8px',
                  border: '1px solid #f1f5f9', borderLeft: `4px solid ${card.statusColor}`,
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#6366f1' }}>👤</span>
                      <strong style={{ fontSize: '13px', color: '#1e293b' }}>{card.sender}</strong>
                      <span style={{
                        fontSize: '10px', padding: '2px 8px', borderRadius: '6px',
                        background: card.platform === '微信' ? '#ecfdf5' : card.platform === '千牛' ? '#fff7ed' : '#fef2f2',
                        color: card.platform === '微信' ? '#059669' : card.platform === '千牛' ? '#c2410c' : '#dc2626',
                      }}>{card.platform}</span>
                      <span style={{
                        fontSize: '10px', padding: '2px 8px', borderRadius: '6px',
                        background: card.statusColor + '15', color: card.statusColor,
                      }}>{card.statusLabel}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{card.time}</span>
                  </div>

                  {/* 买家原话气泡 */}
                  <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>买家原话</span>
                    <p style={{ fontSize: '13px', color: '#475569', margin: '4px 0 0', lineHeight: 1.6 }}>{card.msg}</p>
                  </div>

                  {/* 建议回复 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>建议回复</span>
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>可编辑 · {card.reply.length}/300</span>
                    </div>
                    <textarea style={{
                      width: '100%', minHeight: '60px', padding: '10px 12px',
                      borderRadius: '8px', border: '1px solid #e2e8f0',
                      fontSize: '13px', color: '#334155', resize: 'vertical',
                      background: 'white',
                    }} defaultValue={card.reply} />
                  </div>

                  {/* 操作栏 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button style={iconBtnStyle}>📋</button>
                      <button style={iconBtnStyle}>✅</button>
                    </div>
                    <button style={{
                      padding: '6px 16px', borderRadius: '10px', border: 'none',
                      background: card.platform === '微信' ? '#10b981' : card.platform === '千牛' ? '#f97316' : '#ef4444',
                      color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    }}>✏️ 填入{card.platform}</button>
                  </div>
                </div>
              ))}
            </div>

            {/* 控制面板 */}
            <div style={{
              background: 'white', borderRadius: '16px', padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '16px',
              border: '1px solid #f1f5f9',
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px' }}>🎛️ 控制面板</h3>
              <div style={{ display: 'flex', gap: '24px' }}>
                {/* 播放按钮 */}
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  background: '#f0fdf4', borderRadius: '16px', padding: '16px 24px',
                  border: '1px solid #bbf7d0',
                }}>
                  <div style={{
                    width: '56px', height: '56px', borderRadius: '50%',
                    background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 20px rgba(34,197,94,0.4)', cursor: 'pointer',
                  }}>
                    <span style={{ color: 'white', fontSize: '24px' }}>▶</span>
                  </div>
                  <span style={{ marginTop: '8px', fontSize: '13px', fontWeight: 700, color: '#16a34a' }}>运行中</span>
                </div>

                {/* 开关列表 */}
                <div style={{ flex: 1 }}>
                  {[
                    { label: '关键词匹配', desc: '优先匹配关键词，未匹配则调用 AI', on: true },
                    { label: 'GPT 回复', desc: '关闭后仅使用关键词回复', on: true },
                    { label: '关键词转人工', desc: '匹配关键词自动暂停并提醒', on: true },
                    { label: '关键词替换', desc: '自动替换回复中的敏感词', on: false },
                    { label: 'ESC 自动暂停', desc: '按 ESC 键时自动暂停回复', on: true },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#334155' }}>{item.label}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{item.desc}</div>
                      </div>
                      <div style={{
                        width: '36px', height: '20px', borderRadius: '10px',
                        background: item.on ? '#6366F1' : '#cbd5e1',
                        position: 'relative', cursor: 'pointer',
                      }}>
                        <div style={{
                          width: '16px', height: '16px', borderRadius: '50%',
                          background: 'white', position: 'absolute', top: '2px',
                          left: item.on ? '18px' : '2px', transition: 'all 0.2s',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 日志面板 */}
            <div style={{
              background: 'white', borderRadius: '16px', padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              border: '1px solid #f1f5f9',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', margin: 0 }}>📜 运行日志 <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>8 条记录</span></h3>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button style={iconBtnStyle}>🗑️</button>
                  <button style={iconBtnStyle}>📂</button>
                </div>
              </div>
              <div style={{
                border: '1px solid #f1f5f9', borderRadius: '8px', overflow: 'hidden',
                background: '#f8fafc', maxHeight: '200px', overflowY: 'auto',
              }}>
                {[
                  { time: '14:32:01', level: 'info', text: '检测到微信，微信自动回复采集已启动', dot: '#3b82f6' },
                  { time: '14:32:02', level: 'info', text: '检测到千牛，千牛自动回复采集已启动', dot: '#3b82f6' },
                  { time: '14:32:05', level: 'success', text: '匹配关键词: 亲，有的哦～XXL码库存充足', dot: '#22c55e' },
                  { time: '14:33:10', level: 'warn', text: '未匹配到关键词，开始使用 GPT 生成回复', dot: '#f97316' },
                  { time: '14:33:12', level: 'success', text: 'GPT 生成回复: 非常抱歉让您久等了...', dot: '#22c55e' },
                  { time: '14:35:00', level: 'error', text: '千牛采集异常退出（代码 1），4 秒后重试', dot: '#ef4444' },
                ].map((log, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 12px',
                    background: i % 2 === 0 ? 'white' : '#f8fafc',
                    borderBottom: '1px solid #f1f5f9',
                  }}>
                    <span style={{
                      width: '6px', height: '6px', borderRadius: '50%', background: log.dot,
                      flexShrink: 0, marginTop: '5px',
                    }} />
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', minWidth: '52px' }}>{log.time}</span>
                    <span style={{ fontSize: '12px', color: log.dot === '#ef4444' ? '#dc2626' : log.dot === '#f97316' ? '#ea580c' : '#334155', lineHeight: 1.5 }}>{log.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div style={{
              textAlign: 'center', padding: '16px', marginTop: '20px',
              color: '#94a3b8', fontSize: '11px',
            }}>
              📘 使用手册 · © 2026 YinBo. All rights reserved. · 预览版本
            </div>
          </div>
        </MockBroadcastProvider>
      </ChakraProvider>
    </QueryClientProvider>
  );
};

const navBtnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: '24px', border: 'none',
  background: 'transparent', color: '#475569', fontSize: '12px',
  fontWeight: 500, cursor: 'pointer',
};

const iconBtnStyle: React.CSSProperties = {
  width: '28px', height: '28px', borderRadius: '8px', border: 'none',
  background: 'transparent', color: '#94a3b8', cursor: 'pointer',
  fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(React.createElement(PreviewApp));
