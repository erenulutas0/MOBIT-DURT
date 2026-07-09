import { useEffect, useState } from "react";
import {
  ApiDocument,
  ApiTender,
  ApiTree,
  ApiVaultNote,
  ERPAccountRequest,
  ERPNotification,
  ERPOverview,
  ERPSession,
  getDocuments,
  getERPAccountRequests,
  getERPNotifications,
  getERPOverview,
  getFolderTree,
  getERPNotificationPreferences,
  getTenders,
  getVaultNotes,
  subscribeERPNotificationStream,
} from "../api";
import type { LiveData } from "../lib/types";
import { isAdmin, setBrowserNotificationsEnabled, showBrowserNotification, mergeNotification } from "../lib/helpers";

export function useLiveData(session: ERPSession | null): LiveData {
  const [overview, setOverview] = useState<ERPOverview | null>(null);
  const [documents, setDocuments] = useState<ApiDocument[]>([]);
  const [tenders, setTenders] = useState<ApiTender[]>([]);
  const [folderTree, setFolderTree] = useState<ApiTree | null>(null);
  const [vaultNotes, setVaultNotes] = useState<ApiVaultNote[]>([]);
  const [accountRequests, setAccountRequests] = useState<ERPAccountRequest[]>([]);
  const [notifications, setNotifications] = useState<ERPNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!session) {
      setOverview(null);
      setDocuments([]);
      setTenders([]);
      setFolderTree(null);
      setVaultNotes([]);
      setAccountRequests([]);
      setNotifications([]);
      setLoading(false);
      setError("");
      return () => {
        alive = false;
      };
    }
    setLoading(true);
    setError("");
    const admin = isAdmin(session);
    Promise.all([
      getERPOverview(),
      admin ? getDocuments() : Promise.resolve([]),
      admin ? getTenders() : Promise.resolve([]),
      admin ? getFolderTree() : Promise.resolve(null),
      admin ? getVaultNotes() : Promise.resolve({ vault_root: "vault/ihaleler", notes: [] }),
      admin ? getERPAccountRequests("pending") : Promise.resolve([]),
      getERPNotifications(admin ? 0 : session.user_id),
    ])
      .then(([erp, docs, tenderList, tree, vault, requests, notifList]) => {
        if (!alive) return;
        setOverview(erp);
        setDocuments(docs);
        setTenders(tenderList);
        setFolderTree(tree);
        setVaultNotes(vault.notes);
        setAccountRequests(requests);
        setNotifications(notifList);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Veriler yüklenemedi");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    const timer = window.setInterval(() => {
      getERPOverview().then((erp) => alive && setOverview(erp)).catch(() => undefined);
      getERPNotifications(isAdmin(session) ? 0 : session.user_id).then((items) => alive && setNotifications(items)).catch(() => undefined);
    }, 7000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [refreshIndex, session?.role, session?.user_id]);

  useEffect(() => {
    if (!session) return;
    getERPNotificationPreferences()
      .then((preference) => setBrowserNotificationsEnabled(preference.browser_push_enabled))
      .catch(() => undefined);
  }, [session?.access_token, session?.role, session?.user_id]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    let reconnectTimer: number | undefined;
    let controller: AbortController | null = null;

    const connect = () => {
      if (!alive) return;
      controller = new AbortController();
      subscribeERPNotificationStream((event) => {
        if (!alive) return;
        if (event.event === "notification") {
          setNotifications((items) => mergeNotification(items, event.notification));
          showBrowserNotification(event.notification);
        }
      }, controller.signal).catch(() => {
        if (!alive) return;
        reconnectTimer = window.setTimeout(connect, 2500);
      });
    };

    connect();

    return () => {
      alive = false;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      controller?.abort();
    };
  }, [session?.access_token, session?.role, session?.user_id]);

  return {
    overview,
    documents,
    tenders,
    folderTree,
    vaultNotes,
    accountRequests,
    notifications,
    loading,
    error,
    refresh: () => setRefreshIndex((value) => value + 1),
  };
}
