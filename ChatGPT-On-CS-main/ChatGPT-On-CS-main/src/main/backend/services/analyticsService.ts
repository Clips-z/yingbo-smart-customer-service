import { Op, fn, col, literal } from 'sequelize';
import { ReplySuggestion } from '../entities/replySuggestion';

/**
 * 客服数据分析服务
 * 提供消息量统计、平台分布、回复效率等分析
 */
export class AnalyticsService {
  /**
   * 获取概览统计
   */
  async getOverview(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const total = await ReplySuggestion.count({ where: { created_at: { [Op.gte]: since } } });
    const pending = await ReplySuggestion.count({ where: { created_at: { [Op.gte]: since }, status: 'pending' } });
    const sent = await ReplySuggestion.count({ where: { created_at: { [Op.gte]: since }, status: 'sent' } });
    const failed = await ReplySuggestion.count({ where: { created_at: { [Op.gte]: since }, status: 'failed' } });

    return { total, pending, sent, failed, days };
  }

  /**
   * 获取每日消息趋势
   */
  async getDailyTrend(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const results = await ReplySuggestion.findAll({
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('COUNT', col('id')), 'count'],
      ],
      where: { created_at: { [Op.gte]: since } },
      group: [fn('DATE', col('created_at'))],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true,
    });

    return results.map((r: any) => ({ date: r.date, count: Number(r.count) }));
  }

  /**
   * 获取平台分布
   */
  async getPlatformDistribution(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const results = await ReplySuggestion.findAll({
      attributes: [
        'platform_id',
        [fn('COUNT', col('id')), 'count'],
      ],
      where: { created_at: { [Op.gte]: since } },
      group: ['platform_id'],
      raw: true,
    });

    return results.map((r: any) => ({
      platformId: r.platform_id,
      platformName: this.getPlatformName(r.platform_id),
      count: Number(r.count),
    }));
  }

  /**
   * 获取状态分布
   */
  async getStatusDistribution(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const results = await ReplySuggestion.findAll({
      attributes: [
        'status',
        [fn('COUNT', col('id')), 'count'],
      ],
      where: { created_at: { [Op.gte]: since } },
      group: ['status'],
      raw: true,
    });

    const statusLabels: Record<string, string> = {
      pending: '待回复',
      prepared: '已填入',
      sent: '已发送',
      failed: '发送失败',
      dismissed: '已处理',
    };

    return results.map((r: any) => ({
      status: r.status,
      label: statusLabels[r.status] || r.status,
      count: Number(r.count),
    }));
  }

  /**
   * 获取高频客户 Top N
   */
  async getTopSenders(days: number = 30, limit: number = 10) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const results = await ReplySuggestion.findAll({
      attributes: [
        'sender',
        [fn('COUNT', col('id')), 'count'],
      ],
      where: { created_at: { [Op.gte]: since } },
      group: ['sender'],
      order: [[fn('COUNT', col('id')), 'DESC']],
      limit,
      raw: true,
    });

    return results.map((r: any) => ({
      sender: r.sender,
      count: Number(r.count),
    }));
  }

  /**
   * 获取平均响应时间估算（基于 created_at → sent 时间差）
   */
  async getAvgResponseTime(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const results = await ReplySuggestion.findAll({
      attributes: [
        [literal("AVG(CAST(strftime('%s', updated_at) - strftime('%s', created_at) AS REAL))"), 'avg_seconds'],
      ],
      where: {
        created_at: { [Op.gte]: since },
        status: 'sent',
      },
      raw: true,
    });

    const avgSeconds = (results[0] as any)?.avg_seconds || 0;
    return {
      avgSeconds: Math.round(Number(avgSeconds)),
      avgMinutes: Math.round(Number(avgSeconds) / 60 * 10) / 10,
    };
  }

  private getPlatformName(platformId: string): string {
    const names: Record<string, string> = {
      win_qianniu: '千牛',
      win_wechat: '微信',
      win_jinmai: '京麦',
      win_wecom: '企微',
      win_pdd: '拼多多',
      win_douyin: '抖音电商',
    };
    return names[platformId] || platformId;
  }
}
