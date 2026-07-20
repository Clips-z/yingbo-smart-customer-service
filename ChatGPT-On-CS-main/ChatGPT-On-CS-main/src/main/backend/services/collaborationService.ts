import { DispatchService } from './dispatchService';
import { LoggerService } from './loggerService';

/**
 * 协作服务
 * 支持多人客服协作、会话分配、状态同步
 */
export class CollaborationService {
  /** 当前在线的客服列表 */
  private onlineAgents: Map<string, { name: string; lastSeen: number }> = new Map();

  /** 会话分配映射: sessionId → agentId */
  private sessionAssignments: Map<number, string> = new Map();

  /** 客服心跳超时（秒） */
  private static readonly AGENT_TIMEOUT = 30;

  constructor(
    private log: LoggerService,
    private dispatchService: DispatchService,
  ) {}

  /**
   * 客服上线
   */
  agentOnline(agentId: string, name: string): void {
    this.onlineAgents.set(agentId, { name, lastSeen: Date.now() });
    this.broadcastAgentsUpdate();
    this.log.info(`客服上线: ${name} (${agentId})`);
  }

  /**
   * 客服心跳
   */
  agentHeartbeat(agentId: string): void {
    const agent = this.onlineAgents.get(agentId);
    if (agent) {
      agent.lastSeen = Date.now();
      this.onlineAgents.set(agentId, agent);
    }
  }

  /**
   * 客服下线
   */
  agentOffline(agentId: string): void {
    const agent = this.onlineAgents.get(agentId);
    this.onlineAgents.delete(agentId);

    // 释放该客服分配的所有会话
    const released: number[] = [];
    this.sessionAssignments.forEach((aid, sid) => {
      if (aid === agentId) {
        this.sessionAssignments.delete(sid);
        released.push(sid);
      }
    });

    if (agent) {
      this.log.info(`客服下线: ${agent.name} (${agentId})，释放 ${released.length} 个会话`);
    }

    this.broadcastAgentsUpdate();
  }

  /**
   * 获取在线客服列表
   */
  getOnlineAgents(): Array<{ id: string; name: string }> {
    const now = Date.now();
    const timeout = CollaborationService.AGENT_TIMEOUT * 1000;

    // 清理超时的客服
    const timedOut: string[] = [];
    this.onlineAgents.forEach((agent, id) => {
      if (now - agent.lastSeen > timeout) {
        timedOut.push(id);
      }
    });
    timedOut.forEach((id) => {
      this.onlineAgents.delete(id);
      this.sessionAssignments.forEach((aid, sid) => {
        if (aid === id) this.sessionAssignments.delete(sid);
      });
    });

    if (timedOut.length > 0) {
      this.broadcastAgentsUpdate();
    }

    return Array.from(this.onlineAgents.entries()).map(([id, agent]) => ({
      id,
      name: agent.name,
    }));
  }

  /**
   * 分配会话给指定客服
   */
  assignSession(suggestionId: number, agentId: string): boolean {
    const agent = this.onlineAgents.get(agentId);
    if (!agent) return false;

    this.sessionAssignments.set(suggestionId, agentId);

    this.dispatchService.receiveBroadcast({
      event: 'collaboration_session_assigned',
      data: { suggestionId, agentId, agentName: agent.name },
    });

    this.log.info(`会话 #${suggestionId} 分配给 ${agent.name}`);
    return true;
  }

  /**
   * 自动分配会话（轮询分配给在线客服）
   */
  autoAssign(suggestionId: number): string | null {
    const agents = this.getOnlineAgents();
    if (agents.length === 0) return null;

    // 找到当前分配最少的客服
    const assignmentCounts = new Map<string, number>();
    agents.forEach((a) => assignmentCounts.set(a.id, 0));
    this.sessionAssignments.forEach((aid) => {
      assignmentCounts.set(aid, (assignmentCounts.get(aid) || 0) + 1);
    });

    let minAgent = agents[0].id;
    let minCount = Infinity;
    assignmentCounts.forEach((count, aid) => {
      if (count < minCount) {
        minCount = count;
        minAgent = aid;
      }
    });

    this.assignSession(suggestionId, minAgent);
    return minAgent;
  }

  /**
   * 释放会话分配
   */
  releaseSession(suggestionId: number): void {
    this.sessionAssignments.delete(suggestionId);
  }

  /**
   * 获取会话的分配客服
   */
  getAssignedAgent(suggestionId: number): string | null {
    return this.sessionAssignments.get(suggestionId) || null;
  }

  /**
   * 获取客服分配统计
   */
  getAssignmentStats(): Array<{ agentId: string; agentName: string; count: number }> {
    const counts = new Map<string, number>();
    this.sessionAssignments.forEach((aid) => {
      counts.set(aid, (counts.get(aid) || 0) + 1);
    });

    return Array.from(counts.entries()).map(([agentId, count]) => {
      const agent = this.onlineAgents.get(agentId);
      return {
        agentId,
        agentName: agent?.name || agentId,
        count,
      };
    });
  }

  /**
   * 广播在线客服列表更新
   */
  private broadcastAgentsUpdate(): void {
    this.dispatchService.receiveBroadcast({
      event: 'collaboration_agents_updated',
      data: {
        agents: this.getOnlineAgents(),
        stats: this.getAssignmentStats(),
      },
    });
  }
}
