import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Bell, 
  CheckCheck, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  CheckCircle2, 
  X, 
  RefreshCw, 
  Loader2 
} from 'lucide-react';
import { InAppNotification, NotificationSeverity } from '../../types';
import { supabaseDataService } from '../../services/supabaseDataService';
import { supabase } from '../../lib/supabaseClient';

interface NotificationCenterProps {
  currentUserId: string;
  onNavigate: (tab: string) => void;
}

const SEVERITY_STYLES: Record<string, {
  badgeBg: string;
  text: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconClass: string;
}> = {
  success: {
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    text: 'text-emerald-900',
    icon: CheckCircle2,
    iconClass: 'text-emerald-600'
  },
  warning: {
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
    text: 'text-amber-900',
    icon: AlertTriangle,
    iconClass: 'text-amber-600'
  },
  critical: {
    badgeBg: 'bg-rose-100 text-rose-800 border-rose-200',
    text: 'text-rose-900',
    icon: AlertCircle,
    iconClass: 'text-rose-600'
  },
  info: {
    badgeBg: 'bg-blue-100 text-blue-800 border-blue-200',
    text: 'text-blue-900',
    icon: Info,
    iconClass: 'text-blue-600'
  }
};

function getSeverityConfig(severity: NotificationSeverity) {
  const key = String(severity).toLowerCase();
  return SEVERITY_STYLES[key] || SEVERITY_STYLES.info;
}

function formatNotificationDate(dateString: string): string {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateString;
  }
}

function getTargetTab(entityType: string, eventType: string): string | null {
  // Primary: Entity Type
  switch (entityType) {
    case 'raw_material_receipt':
    case 'raw_material_receipt_correction':
    case 'raw_material':
    case 'raw_material_stock_movement':
      return 'stock';
    case 'production_run':
    case 'production_plan':
      return 'productionPlan';
    case 'finished_goods_stock':
    case 'finished_goods_movement':
      return 'finishedGoods';
  }

  // Fallback: Event Type
  switch (eventType) {
    case 'raw_material_receipt_created':
    case 'raw_material_receipt_corrected':
    case 'raw_material_stock_adjusted':
    case 'raw_material_critical_stock_reached':
      return 'stock';
    case 'finished_goods_stock_adjusted':
    case 'finished_goods_shipped':
    case 'finished_goods_shipment_reversed':
      return 'finishedGoods';
    case 'production_completed':
    case 'production_reversed':
    case 'production_plan_closed_with_shortage':
      return 'productionPlan';
  }

  return null;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  currentUserId,
  onNavigate
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const markingReadIdsRef = useRef<Set<string>>(new Set());
  
  // Race condition & refresh coordination refs
  const isRefreshingRef = useRef<boolean>(false);
  const hasQueuedRefreshRef = useRef<boolean>(false);
  const requestSeqRef = useRef<number>(0);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch notifications & unread count from RPCs with generation tracking
  const fetchNotificationsData = useCallback(async (showLoading = false) => {
    const seq = ++requestSeqRef.current;
    const targetUserId = currentUserId;

    if (showLoading) setIsLoading(true);
    setError(null);

    try {
      const [count, list] = await Promise.all([
        supabaseDataService.getUnreadNotificationCount(),
        supabaseDataService.getInAppNotifications(30)
      ]);

      // Ensure request is still valid and user hasn't changed
      if (seq !== requestSeqRef.current || targetUserId !== currentUserId) {
        return;
      }

      setUnreadCount(count);
      setNotifications(list);
    } catch (err: any) {
      if (seq !== requestSeqRef.current || targetUserId !== currentUserId) {
        return;
      }
      console.error("NotificationCenter fetch error:", err);
      setError("Bildirimler yüklenirken bir hata oluştu.");
    } finally {
      if (seq === requestSeqRef.current && targetUserId === currentUserId) {
        setIsLoading(false);
      }
    }
  }, [currentUserId]);

  // Execute refresh with trailing queue to prevent dropping Realtime refresh requests
  const executeRefresh = useCallback(async () => {
    if (isRefreshingRef.current) {
      hasQueuedRefreshRef.current = true;
      return;
    }

    isRefreshingRef.current = true;
    hasQueuedRefreshRef.current = false;

    try {
      await fetchNotificationsData(false);
    } finally {
      isRefreshingRef.current = false;
      if (hasQueuedRefreshRef.current) {
        hasQueuedRefreshRef.current = false;
        void executeRefresh();
      }
    }
  }, [fetchNotificationsData]);

  // Debounced refresh for realtime INSERTs
  const handleRealtimeRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      void executeRefresh();
    }, 200);
  }, [executeRefresh]);

  // Initial load & Realtime Subscription
  useEffect(() => {
    if (!currentUserId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    // Invalidate any existing in-flight requests and clear state on user change
    requestSeqRef.current++;
    hasQueuedRefreshRef.current = false;
    setNotifications([]);
    setUnreadCount(0);

    fetchNotificationsData(true);

    // Setup realtime subscription
    const channelName = `notifications_${currentUserId}_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_deliveries',
          filter: `recipient_user_id=eq.${currentUserId}`
        },
        () => {
          handleRealtimeRefresh();
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeError(null);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Realtime subscription issue:', status, err);
          setRealtimeError('Realtime bildirim akışında aksama oluştu.');
        }
      });

    return () => {
      requestSeqRef.current++;
      hasQueuedRefreshRef.current = false;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, fetchNotificationsData, handleRealtimeRefresh]);

  // Click outside & Escape key listeners
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Optimistic & Non-blocking Single Notification Click Handler
  const handleNotificationClick = (notification: InAppNotification) => {
    const { deliveryId, readAt, entityType, eventType } = notification;

    // 1. Immediately determine target tab, close panel, and navigate
    const targetTab = getTargetTab(entityType, eventType);
    setIsOpen(false);
    if (targetTab) {
      onNavigate(targetTab);
    }

    // 2. Mark as read if unread and not already pending
    if (!readAt && !markingReadIdsRef.current.has(deliveryId)) {
      markingReadIdsRef.current.add(deliveryId);

      // Optimistic state update
      setNotifications((prev) =>
        prev.map((n) =>
          n.deliveryId === deliveryId
            ? { ...n, readAt: new Date().toISOString() }
            : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      // Background RPC execution & state verification
      (async () => {
        try {
          await supabaseDataService.markNotificationReadAtomic(deliveryId);
        } catch (err) {
          console.error("markNotificationReadAtomic failed:", err);
        } finally {
          markingReadIdsRef.current.delete(deliveryId);
          void executeRefresh();
        }
      })();
    }
  };

  // Mark All Notifications Read Handler
  const handleMarkAllRead = async () => {
    if (isMarkingAllRead || unreadCount === 0) return;

    setIsMarkingAllRead(true);
    setError(null);

    try {
      await supabaseDataService.markAllNotificationsReadAtomic();
      await executeRefresh();
    } catch (err: any) {
      console.error("markAllNotificationsReadAtomic error:", err);
      setError("Tümünü okundu işaretlerken hata oluştu.");
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Bildirimler"
        aria-expanded={isOpen}
        title="Bildirimler"
        className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer flex items-center justify-center"
      >
        <Bell size={18} className="shrink-0" />
        
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full min-w-[18px] text-center shadow-xs border-2 border-white animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-150">
          
          {/* Panel Header */}
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 text-sm">Bildirimler</span>
              {unreadCount > 0 && (
                <span className="bg-rose-100 text-rose-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {unreadCount} yeni
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={isMarkingAllRead}
                  className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  title="Tümünü Okundu Yap"
                >
                  {isMarkingAllRead ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <CheckCheck size={14} />
                  )}
                  <span>Tümünü okundu yap</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Kapat"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Realtime Warning Banner (if any) */}
          {realtimeError && (
            <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-800 flex items-center justify-between shrink-0">
              <span>{realtimeError}</span>
              <button
                type="button"
                onClick={() => fetchNotificationsData(false)}
                className="text-amber-700 underline font-semibold cursor-pointer ml-2 shrink-0"
              >
                Yenile
              </button>
            </div>
          )}

          {/* Panel Content Body */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
                <Loader2 size={24} className="animate-spin text-emerald-600" />
                <span className="text-xs font-medium">Bildirimler yükleniyor...</span>
              </div>
            ) : error ? (
              <div className="p-6 text-center space-y-3">
                <AlertCircle size={28} className="mx-auto text-rose-500" />
                <p className="text-xs text-slate-600 font-medium">{error}</p>
                <button
                  type="button"
                  onClick={() => fetchNotificationsData(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                >
                  <RefreshCw size={12} />
                  <span>Yeniden dene</span>
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 px-4 text-center text-slate-400 space-y-2">
                <Bell size={28} className="mx-auto text-slate-300" />
                <p className="text-xs font-medium text-slate-500">Henüz bildirim bulunmuyor.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {notifications.map((n) => {
                  const severityConfig = getSeverityConfig(n.severity);
                  const SeverityIcon = severityConfig.icon;
                  const isUnread = !n.readAt;

                  return (
                    <button
                      key={n.deliveryId}
                      type="button"
                      onClick={() => handleNotificationClick(n)}
                      className={`w-full text-left p-3.5 transition-colors cursor-pointer flex items-start gap-3 relative ${
                        isUnread
                          ? 'bg-slate-50/90 hover:bg-slate-100/80 font-medium'
                          : 'bg-white hover:bg-slate-50/80 opacity-80'
                      }`}
                    >
                      {/* Unread Indicator Dot */}
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                      )}

                      {/* Severity Icon */}
                      <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${severityConfig.badgeBg}`}>
                        <SeverityIcon size={14} className={severityConfig.iconClass} />
                      </div>

                      {/* Notification Body */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className={`text-xs font-bold truncate ${isUnread ? 'text-slate-900' : 'text-slate-700'}`}>
                            {n.title}
                          </h4>
                          <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">
                            {formatNotificationDate(n.occurredAt || n.deliveryCreatedAt)}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 mt-1 leading-relaxed break-words">
                          {n.message}
                        </p>

                        {n.actorEmail && (
                          <span className="inline-block text-[10px] text-slate-400 mt-1">
                            İşlemi yapan: {n.actorEmail}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Panel Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400 text-center shrink-0">
              En son {notifications.length} bildirim gösteriliyor
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
