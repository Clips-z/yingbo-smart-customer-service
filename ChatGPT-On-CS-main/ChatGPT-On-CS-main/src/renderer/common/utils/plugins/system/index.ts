import { NORMAL_PLUGIN } from './normal';

// 转换为 JSON 格式
// https://www.lambdatest.com/free-online-tools/json-escape
export const SystemPluginList = [
  {
    type: 'guide',
    title: '我有兴趣为迎波智能客服\n贡献工具',
    description: '',
    tags: [],
    icon: '📘',
  },
  {
    type: 'plugin',
    title: '基础对话插件',
    author: '系统插件',
    description:
      '默认的回复流程，会根据设置去选择使用关键词回复或者使用 GPT 回复。',
    tags: ['系统'],
    code: NORMAL_PLUGIN,
    icon: '⚙️',
  },
];
