import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getOrgs, type OrgRecord } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface OrgContextValue {
  orgs: OrgRecord[];
  selectedOrgId: string | null;
  setSelectedOrgId: (id: string | null) => void;
  loading: boolean;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { idToken, user } = useAuth();
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [selectedOrgId, setSelectedOrgIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !idToken) {
      setOrgs([]);
      setSelectedOrgIdState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    getOrgs(idToken)
      .then(({ orgs: list }) => {
        setOrgs(list);
        setSelectedOrgIdState((prev) => {
          if (list.length === 0) return null;
          if (prev && list.some((o) => o.id === prev)) return prev;
          return list[0].id;
        });
      })
      .catch(() => setOrgs([]))
      .finally(() => setLoading(false));
  }, [user, idToken]);

  const setSelectedOrgId = useCallback((id: string | null) => {
    setSelectedOrgIdState(id);
  }, []);

  const value: OrgContextValue = {
    orgs,
    selectedOrgId,
    setSelectedOrgId,
    loading,
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue | null {
  return useContext(OrgContext);
}
