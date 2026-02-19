/**
 * Types and zero defaults for dashboard. No hardcoded fake data.
 */

export interface ExpiringDomain {
  domain: string;
  days: number;
}

export interface ActivityItem {
  action: "create" | "update" | "delete";
  domain: string;
  type: string;
  time: string;
}

export interface DashboardStats {
  total: number;
  active: number;
  expiring: number;
  expired: number;
}

/** Zero initial stats; all values come from API. */
export const DEFAULT_DASHBOARD_STATS: DashboardStats = {
  total: 0,
  active: 0,
  expiring: 0,
  expired: 0,
};
