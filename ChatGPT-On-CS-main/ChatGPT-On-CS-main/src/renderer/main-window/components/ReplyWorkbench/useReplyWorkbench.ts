import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  batchDeleteSuggestions,
  batchUpdateSuggestionsStatus,
  clearSuggestions,
  emergencyStopReplies,
  getDouyinCollectorHealth,
  getJinmaiCollectorHealth,
  getPddCollectorHealth,
  getQianniuCollectorHealth,
  getQianniuSuggestions,
  getReplyMode,
  getWechatCollectorHealth,
  getWecomCollectorHealth,
  setReplyMode,
} from '../../../common/services/platform/controller';
import { QianniuReplyMode, ReplySuggestion } from '../../../common/services/platform/platform';
import { useWebSocketContext } from '../../hooks/useBroadcastContext';
import { useToast } from '../../hooks/useToast';
import useGlobalStore from '../../../settings-window/stores/useGlobalStore';
import { modeLabels } from './constants';

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function useReplyWorkbench() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registerEventHandler } = useWebSocketContext();
  const [changingMode, setChangingMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchWorking, setBatchWorking] = useState(false);

  const activePlatformId = useGlobalStore((state) => state.activePlatformId);
  const activePlatformIds = useGlobalStore((state) => state.activePlatformIds);
  const setActivePlatformId = useGlobalStore(
    (state) => state.setActivePlatformId,
  );

  const isQianniu = activePlatformId === 'win_qianniu';
  const isWechat = activePlatformId === 'win_wechat';
  const isWecom = activePlatformId === 'win_wecom';
  const isJinmai = activePlatformId === 'win_jinmai';
  const isPdd = activePlatformId === 'win_pdd';
  const isDouyin = activePlatformId === 'win_douyin';
  const supportsModes = isQianniu || isWechat || isWecom || isJinmai || isPdd || isDouyin;

  const modeQuery = useQuery(
    ['reply-mode', activePlatformId],
    () => getReplyMode(activePlatformId || ''),
    { enabled: supportsModes },
  );
  const healthQuery = useQuery(
    ['wechat-collector-health'],
    getWechatCollectorHealth,
    { enabled: isWechat, refetchInterval: 5000 },
  );
  const qianniuHealthQuery = useQuery(
    ['qianniu-collector-health'],
    getQianniuCollectorHealth,
    { enabled: isQianniu, refetchInterval: 5000 },
  );
  const wecomHealthQuery = useQuery(
    ['wecom-collector-health'],
    getWecomCollectorHealth,
    { enabled: isWecom, refetchInterval: 5000 },
  );
  const jinmaiHealthQuery = useQuery(
    ['jinmai-collector-health'],
    getJinmaiCollectorHealth,
    { enabled: isJinmai, refetchInterval: 5000 },
  );
  const pddHealthQuery = useQuery(
    ['pdd-collector-health'],
    getPddCollectorHealth,
    { enabled: isPdd, refetchInterval: 5000 },
  );
  const douyinHealthQuery = useQuery(
    ['douyin-collector-health'],
    getDouyinCollectorHealth,
    { enabled: isDouyin, refetchInterval: 5000 },
  );
  const suggestionsQuery = useQuery(
    ['reply-suggestions', 'all'],
    () => getQianniuSuggestions('all', 'all'),
    { refetchInterval: 3000, enabled: activePlatformIds.length > 0 },
  );

  const mode = modeQuery.data?.data.mode || 'hint';
  const allSuggestions = useMemo<ReplySuggestion[]>(
    () => suggestionsQuery.data?.data ?? [],
    [suggestionsQuery.data?.data],
  );

  const suggestions = useMemo(
    () =>
      activePlatformId === 'all'
        ? allSuggestions.filter((item) =>
            activePlatformIds.includes(item.platform_id),
          )
        : allSuggestions.filter(
            (item) => item.platform_id === activePlatformId,
          ),
    [activePlatformId, activePlatformIds, allSuggestions],
  );

  const pending = useMemo(
    () =>
      suggestions.filter(
        (item) => item.status === 'pending' || item.status === 'failed',
      ),
    [suggestions],
  );
  const handled = useMemo(
    () =>
      suggestions.filter(
        (item) => item.status !== 'pending' && item.status !== 'failed',
      ),
    [suggestions],
  );

  const refresh = useCallback(() => {
    queryClient.invalidateQueries(['reply-suggestions', 'all']);
  }, [queryClient]);

  // 清掉已不存在的选中项
  useEffect(() => {
    if (selectedIds.size > 0) {
      const validIds = new Set(suggestions.map((s) => s.id));
      setSelectedIds((prev) => {
        const next = new Set<number>();
        prev.forEach((id) => {
          if (validIds.has(id)) next.add(id);
        });
        return next;
      });
    }
  }, [selectedIds.size, suggestions]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(suggestions.map((s) => s.id)));
  }, [suggestions]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectPendingOnly = useCallback(() => {
    setSelectedIds(new Set(pending.map((s) => s.id)));
  }, [pending]);

  const handleBatchDismissed = useCallback(async () => {
    const ids =
      selectedIds.size > 0
        ? Array.from(selectedIds)
        : pending.map((s) => s.id);
    if (ids.length === 0) return;
    setBatchWorking(true);
    try {
      await batchUpdateSuggestionsStatus(ids, 'dismissed');
      toast({
        title: `已将 ${ids.length} 条标记为已处理`,
        status: 'success',
        duration: 2500,
        isClosable: true,
      });
      clearSelection();
      refresh();
    } catch (error) {
      toast({
        title: '批量操作失败',
        description: extractErrorMessage(error),
        status: 'error',
      });
    } finally {
      setBatchWorking(false);
    }
  }, [selectedIds, pending, toast, clearSelection, refresh]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`确定要删除选中的 ${selectedIds.size} 条记录吗？`))
      return;
    setBatchWorking(true);
    try {
      await batchDeleteSuggestions(Array.from(selectedIds));
      toast({
        title: `已删除 ${selectedIds.size} 条记录`,
        status: 'success',
        duration: 2500,
        isClosable: true,
      });
      clearSelection();
      refresh();
    } catch (error) {
      toast({
        title: '删除失败',
        description: extractErrorMessage(error),
        status: 'error',
      });
    } finally {
      setBatchWorking(false);
    }
  }, [selectedIds, toast, clearSelection, refresh]);

  const handleClearHandled = useCallback(async () => {
    const targetPlatform =
      activePlatformId === 'all' ? 'all' : activePlatformId || undefined;
    const count = handled.length;
    if (count === 0) {
      toast({ title: '没有可清理的已处理消息', status: 'info', duration: 2000 });
      return;
    }
    if (!window.confirm(`确定要清空所有 ${count} 条已处理的记录吗？`)) return;
    setBatchWorking(true);
    try {
      await clearSuggestions('handled', targetPlatform);
      toast({
        title: `已清空 ${count} 条已处理记录`,
        status: 'success',
        duration: 2500,
        isClosable: true,
      });
      refresh();
    } catch (error) {
      toast({
        title: '清理失败',
        description: extractErrorMessage(error),
        status: 'error',
      });
    } finally {
      setBatchWorking(false);
    }
  }, [activePlatformId, handled, toast, refresh]);

  const changeMode = useCallback(
    async (nextMode: QianniuReplyMode) => {
      if (
        nextMode === 'unattended' &&
        !window.confirm('无人值守模式会自动向买家发送回复，确认开启吗？')
      ) {
        return;
      }
      setChangingMode(true);
      try {
        if (!activePlatformId) return;
        await setReplyMode(activePlatformId, nextMode);
        await modeQuery.refetch();
        toast({
          title: `已切换为${modeLabels[nextMode]}`,
          status: nextMode === 'unattended' ? 'warning' : 'success',
          duration: 3000,
          isClosable: true,
        });
      } catch (error) {
        toast({
          title: '模式切换失败',
          description: extractErrorMessage(error),
          status: 'error',
        });
      } finally {
        setChangingMode(false);
      }
    },
    [activePlatformId, modeQuery, toast],
  );

  const emergencyStop = useCallback(async () => {
    if (
      !activePlatformId ||
      !['win_qianniu', 'win_wechat'].includes(activePlatformId)
    )
      return;
    setChangingMode(true);
    try {
      const result = await emergencyStopReplies(activePlatformId);
      await modeQuery.refetch();
      refresh();
      toast({
        title: '已停止自动投递并切回辅助回复',
        description: `已取消 ${result.data.cancelled} 条待执行任务`,
        status: 'success',
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: '紧急停止失败',
        description: extractErrorMessage(error),
        status: 'error',
      });
    } finally {
      setChangingMode(false);
    }
  }, [activePlatformId, modeQuery, refresh, toast]);

  // WebSocket 事件监听
  useEffect(() => {
    return registerEventHandler((message) => {
      if (
        message.event.startsWith('qianniu_suggestion_') ||
        message.event === 'wechat_suggestion_updated' ||
        message.event === 'wecom_suggestion_updated' ||
        message.event === 'jinmai_suggestion_updated' ||
        message.event === 'jinmai_suggestion_created' ||
        message.event === 'pdd_suggestion_updated' ||
        message.event === 'pdd_suggestion_created' ||
        message.event === 'douyin_suggestion_updated' ||
        message.event === 'douyin_suggestion_created' ||
        message.event === 'reply_suggestion_created' ||
        message.event === 'qianniu_suggestions_deleted' ||
        message.event === 'qianniu_suggestions_cleared'
      ) {
        refresh();
      }
      if (message.event === 'wechat_collector_health_changed') {
        queryClient.invalidateQueries(['wechat-collector-health']);
      }
      if (message.event === 'wecom_collector_health_changed') {
        queryClient.invalidateQueries(['wecom-collector-health']);
      }
      if (message.event === 'jinmai_collector_health_changed') {
        queryClient.invalidateQueries(['jinmai-collector-health']);
      }
      if (message.event === 'pdd_collector_health_changed') {
        queryClient.invalidateQueries(['pdd-collector-health']);
      }
      if (message.event === 'douyin_collector_health_changed') {
        queryClient.invalidateQueries(['douyin-collector-health']);
      }
      if (
        message.event === 'qianniu_reply_mode_changed' ||
        message.event === 'wechat_reply_mode_changed' ||
        message.event === 'wecom_reply_mode_changed' ||
        message.event === 'jinmai_reply_mode_changed' ||
        message.event === 'pdd_reply_mode_changed' ||
        message.event === 'douyin_reply_mode_changed'
      ) {
        queryClient.invalidateQueries(['reply-mode']);
      }
    });
  }, [queryClient, refresh, registerEventHandler]);

  return {
    // state
    activePlatformId,
    activePlatformIds,
    setActivePlatformId,
    changingMode,
    selectedIds,
    batchWorking,
    // derived
    isQianniu,
    isWechat,
    isWecom,
    isJinmai,
    isPdd,
    isDouyin,
    supportsModes,
    mode,
    allSuggestions,
    suggestions,
    pending,
    handled,
    suggestionsLoading: suggestionsQuery.isLoading,
    // health
    collectorHealth: healthQuery.data?.data,
    qianniuCollectorHealth: qianniuHealthQuery.data?.data,
    wecomCollectorHealth: wecomHealthQuery.data?.data,
    jinmaiCollectorHealth: jinmaiHealthQuery.data?.data,
    pddCollectorHealth: pddHealthQuery.data?.data,
    douyinCollectorHealth: douyinHealthQuery.data?.data,
    // actions
    refresh,
    toggleSelect,
    selectAll,
    clearSelection,
    selectPendingOnly,
    handleBatchDismissed,
    handleBatchDelete,
    handleClearHandled,
    changeMode,
    emergencyStop,
  };
}
