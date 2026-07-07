import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { AnalyticsService } from '../services/analyticsService';

export class AnalyticsController {
  private analyticsService: AnalyticsService;

  constructor() {
    this.analyticsService = new AnalyticsService();
  }

  /**
   * GET /api/analytics/overview?days=7
   */
  getOverview = asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(String(req.query.days || '7'), 10) || 7;
    const data = await this.analyticsService.getOverview(days);
    res.json({ success: true, data });
  });

  /**
   * GET /api/analytics/daily-trend?days=7
   */
  getDailyTrend = asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(String(req.query.days || '7'), 10) || 7;
    const data = await this.analyticsService.getDailyTrend(days);
    res.json({ success: true, data });
  });

  /**
   * GET /api/analytics/platform-distribution?days=7
   */
  getPlatformDistribution = asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(String(req.query.days || '7'), 10) || 7;
    const data = await this.analyticsService.getPlatformDistribution(days);
    res.json({ success: true, data });
  });

  /**
   * GET /api/analytics/status-distribution?days=7
   */
  getStatusDistribution = asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(String(req.query.days || '7'), 10) || 7;
    const data = await this.analyticsService.getStatusDistribution(days);
    res.json({ success: true, data });
  });

  /**
   * GET /api/analytics/top-senders?days=30&limit=10
   */
  getTopSenders = asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(String(req.query.days || '30'), 10) || 30;
    const limit = parseInt(String(req.query.limit || '10'), 10) || 10;
    const data = await this.analyticsService.getTopSenders(days, limit);
    res.json({ success: true, data });
  });

  /**
   * GET /api/analytics/avg-response-time?days=7
   */
  getAvgResponseTime = asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(String(req.query.days || '7'), 10) || 7;
    const data = await this.analyticsService.getAvgResponseTime(days);
    res.json({ success: true, data });
  });
}
