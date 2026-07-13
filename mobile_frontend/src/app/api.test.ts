import { describe, expect, it, vi } from "vitest";
import {
  clearStoredSession,
  createCompanyWorkflow,
  createERPAccountRequest,
  createERPTask,
  deleteDocumentGroupMessage,
  deleteERPDirectMessage,
  getAssistantBriefing,
  sendAssistantMessage,
  getAuthenticatedMediaBlob,
  getDocumentGroupFileBlob,
  getDocumentGroupFileVersionBlob,
  getDocumentGroupMessages,
  getDocumentGroups,
  getERPDirectMessages,
  getERPOverview,
  getTenderDocumentBlob,
  markDocumentGroupMessagesRead,
  getMobileAppUpdateInfo,
  loginToBackend,
  openChatEventStream,
  requestERPAccountDeletion,
  saveSession,
  sendDocumentGroupMessage,
  sendERPDirectMessage,
  type BackendAuthUser,
} from "./api";

const API_BASE = "http://127.0.0.1:8080";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

function okSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    role: "user",
    name: "Test User",
    user_id: 2,
    email: "user@mobit.com.tr",
    access_token: "access-token",
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: "refresh-token",
    refresh_expires_in: 86400,
    ...overrides,
  };
}

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn();
  responses.forEach((response) => fetchMock.mockResolvedValueOnce(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestBody(call: unknown[]) {
  return JSON.parse(String((call[1] as RequestInit).body));
}

function requestHeader(call: unknown[], name: string) {
  const headers = (call[1] as RequestInit).headers;
  return headers instanceof Headers
    ? headers.get(name)
    : (headers as Record<string, string> | undefined)?.[name];
}

describe("mobil API istemcisi", () => {
  it("gercek bir calisan hesabi admin-benzeri e-postayla bile once employee endpoint'inden giris yapabilir", async () => {
    // "admin@mobit.com.tr" is not a database row by default, but IF one is ever
    // approved with that email, it must still be reachable — the shared admin
    // identity is a fallback, never a shadow over a real account.
    const fetchMock = stubFetch(jsonResponse(okSession({
      role: "user",
      name: "Gercek Admin Calisani",
      user_id: 7,
      email: "admin@mobit.com.tr",
    })));

    const user = await loginToBackend("admin@mobit.com.tr", "gercek-sifre");

    expect(user.role).toBe("user");
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/erp/auth/login`,
      expect.objectContaining({ method: "POST" })
    );
    expect(requestBody(fetchMock.mock.calls[0])).toEqual({
      email: "admin@mobit.com.tr",
      password: "gercek-sifre",
    });
  });

  it("employee girişi başarısız olunca paylaşılan admin kimliğine düşer, prod parolayı sızdırmadan", async () => {
    const fetchMock = stubFetch(
      jsonResponse({ detail: "Invalid credentials" }, { status: 401 }),
      jsonResponse(okSession({
        role: "admin",
        name: "Admin",
        user_id: 1,
        email: "admin@mobit.com.tr",
      }))
    );

    const user = await loginToBackend("admin@mobit.com.tr", "admin123");

    expect(user.role).toBe("admin");
    expect(user.email).toBe("admin@mobit.com.tr");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${API_BASE}/erp/auth/login`,
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${API_BASE}/erp/auth/admin-login`,
      expect.objectContaining({ method: "POST" })
    );
    expect(requestBody(fetchMock.mock.calls[1])).toEqual({
      username: "admin",
      password: "admin123",
    });
  });

  it("normal kullanıcı girişini employee endpoint'i üzerinden yapar", async () => {
    const fetchMock = stubFetch(jsonResponse(okSession()));

    const user = await loginToBackend("user@mobit.com.tr", "user123");

    expect(user.role).toBe("user");
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/erp/auth/login`,
      expect.objectContaining({ method: "POST" })
    );
    expect(requestBody(fetchMock.mock.calls[0])).toEqual({
      email: "user@mobit.com.tr",
      password: "user123",
    });
  });

  it("backend erişilemediğinde Türkçe bağlantı hatası döndürür", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loginToBackend("user@mobit.com.tr", "user123")).rejects.toThrow(
      "Backend'e ulaşılamadı. Sunucu adresini kontrol edin."
    );
  });

  it("kayıt talebinde backend alan hatalarını kullanıcı dostu Türkçe mesaja çevirir", async () => {
    stubFetch(jsonResponse({
      message: "validation failed",
      fieldErrors: { password: "too short" },
    }, { status: 400 }));

    await expect(createERPAccountRequest({
      name: "Yeni Kullanıcı",
      email: "yeni@mobit.com.tr",
      phone: "",
      password: "123",
    })).rejects.toThrow("Şifre en az 10 karakter olmalıdır.");
  });

  it("401 sonrası refresh token ile oturumu yenileyip isteği tekrarlar", async () => {
    const oldSession: BackendAuthUser = {
      id: 2,
      name: "Test User",
      email: "user@mobit.com.tr",
      role: "user",
      dept: "Operasyon",
      accessToken: "old-access",
      refreshToken: "refresh-token",
      expiresIn: 1,
      refreshExpiresIn: 86400,
    };
    saveSession(oldSession);
    const fetchMock = stubFetch(
      jsonResponse({ detail: "unauthorized" }, { status: 401 }),
      jsonResponse(okSession({ access_token: "new-access" })),
      jsonResponse({
        users: [],
        teams: [],
        tasks: [],
        assignments: [],
        documents: [],
        help_messages: [],
        notifications: [],
      })
    );

    const overview = await getERPOverview();

    expect(overview.users).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestHeader(fetchMock.mock.calls[0], "Authorization")).toBe("Bearer old-access");
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE}/erp/auth/refresh`);
    expect(requestHeader(fetchMock.mock.calls[2], "Authorization")).toBe("Bearer new-access");
    expect(JSON.parse(window.localStorage.getItem("docsbot.mobile.auth") || "{}").accessToken).toBe("new-access");
  });

  it("hesap silme talebini oturum token'ı ile backend'e iletir", async () => {
    saveSession({
      id: 2,
      name: "Test User",
      email: "user@mobit.com.tr",
      role: "user",
      dept: "Operasyon",
      accessToken: "user-access",
      refreshToken: "user-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const fetchMock = stubFetch(new Response(null, { status: 202 }));

    await requestERPAccountDeletion();

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/erp/me/account-deletion-request`,
      expect.objectContaining({ method: "POST" })
    );
    expect(requestHeader(fetchMock.mock.calls[0], "Authorization")).toBe("Bearer user-access");
  });

  it("direct mesajlarda ses/fotoğraf/dosya medya alanlarını backend'e gönderir", async () => {
    saveSession({
      id: 1,
      name: "Admin",
      email: "admin@mobit.com.tr",
      role: "admin",
      dept: "Yönetim",
      accessToken: "admin-access",
      refreshToken: "admin-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const fetchMock = stubFetch(jsonResponse({
      id: 10,
      sender_type: "admin",
      sender_user_id: 1,
      sender_name: "Admin",
      recipient_type: "user",
      recipient_user_id: 2,
      recipient_name: "Test User",
      body: "Sesli mesaj",
      message_kind: "voice",
      media_mime_type: "audio/webm",
      media_data: "data:audio/webm;base64,AAAA",
      media_duration_ms: 1200,
      client_message_id: "client-direct-1",
      read_at: null,
      delivered_at: "2026-07-07T00:00:00Z",
      delivery_status: "delivered",
      created_at: "2026-07-07T00:00:00Z",
    }));

    await sendERPDirectMessage({
      body: "Sesli mesaj",
      recipientUserId: 2,
      messageKind: "voice",
      mediaMimeType: "audio/webm",
      mediaData: "data:audio/webm;base64,AAAA",
      mediaDurationMs: 1200,
      clientMessageId: "client-direct-1",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/erp/messages`);
    expect(requestBody(fetchMock.mock.calls[0])).toEqual({
      body: "Sesli mesaj",
      recipient_user_id: 2,
      message_kind: "voice",
      media_mime_type: "audio/webm",
      media_data: "data:audio/webm;base64,AAAA",
      media_duration_ms: 1200,
      client_message_id: "client-direct-1",
      reply_to_message_id: null,
    });
  });

  it("asistan özetini doğru endpoint'ten yetkili başlıkla çeker", async () => {
    saveSession({
      id: 2,
      name: "Test User",
      email: "user@mobit.com.tr",
      role: "user",
      dept: "Operasyon",
      accessToken: "user-access",
      refreshToken: "user-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const briefing = {
      assistant_name: "Mobit-Asistan",
      display_name: "Test User",
      generated_at: "2026-07-13T08:30:00Z",
      overdue: [{ id: 1, title: "Geciken", status: "todo", deadline_at: "2026-07-11T09:00:00Z" }],
      due_today: [],
      due_this_week: [],
      ready_to_start: [],
      blocked: [],
      unread_messages: 3,
      unread_notifications: 1,
    };
    const fetchMock = stubFetch(jsonResponse(briefing));

    const result = await getAssistantBriefing();

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/erp/assistant/briefing`);
    expect(requestHeader(fetchMock.mock.calls[0], "Authorization")).toBe("Bearer user-access");
    expect(result).toEqual(briefing);
  });

  it("asistana sohbet mesajını doğru endpoint'e POST eder ve yanıtı döndürür", async () => {
    saveSession({
      id: 2,
      name: "Test User",
      email: "user@mobit.com.tr",
      role: "user",
      dept: "Operasyon",
      accessToken: "user-access",
      refreshToken: "user-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const fetchMock = stubFetch(jsonResponse({
      assistant_name: "Mobit-Asistan",
      provider: "rule-based",
      reply: "1 geciken görevin var.",
    }));

    const result = await sendAssistantMessage("geciken görevlerim");

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/erp/assistant/chat`);
    expect(requestBody(fetchMock.mock.calls[0])).toEqual({ message: "geciken görevlerim" });
    expect(result.reply).toBe("1 geciken görevin var.");
    expect(result.provider).toBe("rule-based");
  });

  it("oda mesajı gönderirken medya payload'ını snake_case backend sözleşmesine çevirir", async () => {
    saveSession({
      id: 2,
      name: "Test User",
      email: "user@mobit.com.tr",
      role: "user",
      dept: "Operasyon",
      accessToken: "user-access",
      refreshToken: "user-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const fetchMock = stubFetch(jsonResponse({
      id: 7,
      group_id: 3,
      author_user_id: 2,
      author_name: "Test User",
      body: "Fotoğraf",
      message_kind: "image",
      media_mime_type: "image/jpeg",
      media_data: "data:image/jpeg;base64,AAAA",
      media_duration_ms: null,
      client_message_id: "client-room-1",
      delivered_at: "2026-07-07T00:00:00Z",
      sequence_no: 7,
      delivery_status: "delivered",
      created_at: "2026-07-07T00:00:00Z",
    }));

    await sendDocumentGroupMessage(3, {
      body: "Fotoğraf",
      messageKind: "image",
      mediaMimeType: "image/jpeg",
      mediaData: "data:image/jpeg;base64,AAAA",
      clientMessageId: "client-room-1",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/document-groups/3/messages`);
    expect(requestBody(fetchMock.mock.calls[0])).toEqual({
      body: "Fotoğraf",
      message_kind: "image",
      media_mime_type: "image/jpeg",
      media_data: "data:image/jpeg;base64,AAAA",
      media_duration_ms: null,
      client_message_id: "client-room-1",
      reply_to_message_id: null,
    });
  });

  it("oda mesajlarını son görülen mesaja kadar okundu işaretler", async () => {
    saveSession({
      id: 2,
      name: "Test User",
      email: "user@mobit.com.tr",
      role: "user",
      dept: "Operasyon",
      accessToken: "user-access",
      refreshToken: "user-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const fetchMock = stubFetch(jsonResponse({ updated_count: 3 }));

    const result = await markDocumentGroupMessagesRead(4, 22);

    expect(result).toEqual({ updated_count: 3 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/document-groups/4/messages/read-through`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PATCH" });
    expect(requestBody(fetchMock.mock.calls[0])).toEqual({ through_message_id: 22 });
  });

  it("canlı chat SSE akışını yetkili fetch ile açıp eventleri parse eder", async () => {
    saveSession({
      id: 2,
      name: "Test User",
      email: "user@mobit.com.tr",
      role: "user",
      dept: "Operasyon",
      accessToken: "user-access",
      refreshToken: "user-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: direct_message\ndata: {\"messageId\":12}\n\n"));
        controller.close();
      },
    });
    const fetchMock = stubFetch(new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }));
    const events: Array<{ eventName: string; data: unknown }> = [];

    const unsubscribe = await openChatEventStream(event => events.push(event));
    await new Promise(resolve => window.setTimeout(resolve, 0));
    unsubscribe();

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/erp/messages/stream`);
    expect(requestHeader(fetchMock.mock.calls[0], "Authorization")).toBe("Bearer user-access");
    expect(requestHeader(fetchMock.mock.calls[0], "Accept")).toBe("text/event-stream");
    expect(events).toEqual([{ eventName: "direct_message", data: { messageId: 12 } }]);
  });

  it("direkt mesaj silerken silme kapsamını backend'e query olarak gönderir", async () => {
    saveSession({
      id: 2,
      name: "Test User",
      email: "user@mobit.com.tr",
      role: "user",
      dept: "Operasyon",
      accessToken: "user-access",
      refreshToken: "user-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const fetchMock = stubFetch(new Response(null, { status: 204 }));

    await deleteERPDirectMessage(12, "me");

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/erp/messages/12?scope=me`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  });

  it("oda mesajı silerken herkesten sil kapsamını backend'e query olarak gönderir", async () => {
    saveSession({
      id: 2,
      name: "Test User",
      email: "user@mobit.com.tr",
      role: "user",
      dept: "Operasyon",
      accessToken: "user-access",
      refreshToken: "user-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const fetchMock = stubFetch(new Response(null, { status: 204 }));

    await deleteDocumentGroupMessage(3, 12, "everyone");

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/document-groups/3/messages/12?scope=everyone`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  });

  it("direkt mesajları cursor pagination parametreleriyle sorgular", async () => {
    saveSession({
      id: 2,
      name: "Test User",
      email: "user@mobit.com.tr",
      role: "user",
      dept: "Operasyon",
      accessToken: "user-access",
      refreshToken: "user-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const fetchMock = stubFetch(jsonResponse([]));

    await getERPDirectMessages(50, 120);

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/erp/messages?limit=50&before_id=120`);
  });

  it("admin görev oluştururken çoklu çalışan listesini backend'e gönderir", async () => {
    saveSession({
      id: 1,
      name: "Admin",
      email: "admin@mobit.com.tr",
      role: "admin",
      dept: "Yönetim",
      accessToken: "admin-access",
      refreshToken: "admin-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const fetchMock = stubFetch(jsonResponse({
      id: 44,
      title: "Saha kontrol",
      description: "Talimat",
      assigned_by_user_id: 1,
      status: "todo",
      priority: "high",
      deadline_at: "2026-07-10T09:00:00Z",
      completed_at: null,
      created_at: "2026-07-08T09:00:00Z",
    }));

    const task = await createERPTask({
      title: "Saha kontrol",
      description: "Talimat",
      assigneeUserIds: [2, 3],
      responsibleUserId: 2,
      priority: "high",
      deadlineAt: "2026-07-10T09:00:00Z",
    });

    expect(task.id).toBe(44);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/erp/tasks`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(requestBody(fetchMock.mock.calls[0])).toEqual({
      title: "Saha kontrol",
      description: "Talimat",
      assignee_user_ids: [2, 3],
      assignee_team_ids: [],
      responsible_user_id: 2,
      priority: "high",
      deadline_at: "2026-07-10T09:00:00Z",
      parent_task_id: null,
    });
  });

  it("oda mesajlarını cursor pagination parametreleriyle sorgular", async () => {
    saveSession({
      id: 2,
      name: "Test User",
      email: "user@mobit.com.tr",
      role: "user",
      dept: "Operasyon",
      accessToken: "user-access",
      refreshToken: "user-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const fetchMock = stubFetch(jsonResponse([]));

    await getDocumentGroupMessages(3, 50, 120);

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/document-groups/3/messages?limit=50&before_id=120`);
  });

  it("çalışma alanı listesinde okunmamış mesaj sayısını korur", async () => {
    saveSession({
      id: 1,
      name: "Admin",
      email: "admin@mobit.com.tr",
      role: "admin",
      dept: "Yönetim",
      accessToken: "admin-access",
      refreshToken: "admin-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    stubFetch(jsonResponse([{
      id: 3,
      name: "BEDAS Operasyon",
      description: null,
      tender_id: "BEDAS-2026-001",
      year: 2026,
      created_by: "Admin",
      archived_at: null,
      created_at: "2026-07-07T00:00:00Z",
      updated_at: "2026-07-07T00:00:00Z",
      member_count: 2,
      document_count: 4,
      unread_message_count: 5,
    }]));

    const groups = await getDocumentGroups();

    expect(groups[0].unread_message_count).toBe(5);
  });

  it("mesaj medya bloblarını yetkili endpoint üzerinden alır", async () => {
    saveSession({
      id: 2,
      name: "Test User",
      email: "user@mobit.com.tr",
      role: "user",
      dept: "Operasyon",
      accessToken: "user-access",
      refreshToken: "user-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const fetchMock = stubFetch(new Response("image", {
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
    }));

    const result = await getAuthenticatedMediaBlob("/erp/messages/7/media");

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/erp/messages/7/media`);
    expect(requestHeader(fetchMock.mock.calls[0], "Authorization")).toBe("Bearer user-access");
    expect(result.type).toBe("image/jpeg");
    expect(await result.text()).toBe("image");
  });

  it("oda doküman önizleme ve indirme URL'lerinde download bayrağını doğru kurar", async () => {
    saveSession({
      id: 2,
      name: "Test User",
      email: "user@mobit.com.tr",
      role: "user",
      dept: "Operasyon",
      accessToken: "user-access",
      refreshToken: "user-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const fetchMock = stubFetch(
      new Response(new Blob(["preview"], { type: "application/pdf" }), { status: 200 }),
      new Response(new Blob(["download"], { type: "application/pdf" }), { status: 200 }),
      new Response(new Blob(["version"], { type: "application/pdf" }), { status: 200 })
    );

    await getDocumentGroupFileBlob(3, 9, false);
    await getDocumentGroupFileBlob(3, 9, true);
    await getDocumentGroupFileVersionBlob(3, 9, 4, false);

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/document-groups/3/documents/9/content?download=false`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE}/document-groups/3/documents/9/content?download=true`);
    expect(fetchMock.mock.calls[2][0]).toBe(`${API_BASE}/document-groups/3/documents/9/versions/4/content?download=false`);
  });

  it("doküman ağı belge önizleme ve indirme endpointlerini doğru çağırır", async () => {
    saveSession({
      id: 1,
      name: "Admin",
      email: "admin@mobit.com.tr",
      role: "admin",
      dept: "Yönetim",
      accessToken: "admin-access",
      refreshToken: "admin-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const fetchMock = stubFetch(
      new Response("preview", { status: 200, headers: { "Content-Type": "application/pdf" } }),
      new Response("download", { status: 200, headers: { "Content-Type": "application/pdf" } })
    );

    await getTenderDocumentBlob(42, false);
    await getTenderDocumentBlob(42, true);

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/dashboard/files/42/view`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE}/dashboard/files/42`);
    expect(requestHeader(fetchMock.mock.calls[0], "Authorization")).toBe("Bearer admin-access");
  });

  it("uygulama güncelleme bilgisini mevcut sürüm ile sorgular", async () => {
    saveSession({
      id: 1,
      name: "Admin",
      email: "admin@mobit.com.tr",
      role: "admin",
      dept: "Yönetim",
      accessToken: "admin-access",
      refreshToken: "admin-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const fetchMock = stubFetch(jsonResponse({
      current_version: "1.0.6",
      latest_version: "1.0.7",
      minimum_version: "1.0.7",
      update_available: true,
      required: true,
      title: "Yeni sürüm hazır",
      message: "Uygulamayı güncelleyin.",
      play_store_url: "https://play.google.com/store/apps/details?id=com.mobit.docsbotops",
    }));

    const update = await getMobileAppUpdateInfo("1.0.6");

    expect(update.required).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/erp/app-update?current_version=1.0.6`);
  });

  it("şirket oluşturma akışında temiz şirket adını gönderir", async () => {
    saveSession({
      id: 1,
      name: "Admin",
      email: "admin@mobit.com.tr",
      role: "admin",
      dept: "Yönetim",
      accessToken: "admin-access",
      refreshToken: "admin-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    const fetchMock = stubFetch(jsonResponse({
      id: 12,
      tender_id: "IBB-2026-001",
      organization: "IBB",
      year: 2026,
      sequence: 1,
      internal_unit: null,
      title: null,
      status: "active",
      created_at: "2026-07-07T00:00:00Z",
    }));

    await createCompanyWorkflow({ organization: "IBB", year: 2026 });

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/tenders/company`);
    expect(requestBody(fetchMock.mock.calls[0])).toEqual({
      organization: "IBB",
      year: 2026,
      internal_unit: null,
    });
  });

  it("oturumu açıkça temizleyebilir", () => {
    saveSession({
      id: 1,
      name: "Admin",
      email: "admin@mobit.com.tr",
      role: "admin",
      dept: "Yönetim",
      accessToken: "admin-access",
      refreshToken: "admin-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });

    clearStoredSession();

    expect(window.localStorage.getItem("docsbot.mobile.auth")).toBeNull();
  });
});
