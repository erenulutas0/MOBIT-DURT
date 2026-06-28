import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import * as api from './api';

vi.mock('./api', () => ({
  approveERPAccountRequest: vi.fn(),
  approveERPTaskCompletion: vi.fn(),
  createERPAccountRequest: vi.fn(),
  createERPTask: vi.fn(),
  createERPTaskComment: vi.fn(),
  createTaskFromTenderDocument: vi.fn(),
  createERPUser: vi.fn(),
  deleteERPTaskDocument: vi.fn(),
  displayStatus: vi.fn((status: string) => status),
  downloadBlob: vi.fn(),
  fileType: vi.fn((document: { mime_type?: string | null }) => document.mime_type || 'file'),
  formatBytes: vi.fn((value: number | null | undefined) => value ? `${value} B` : '-'),
  getDocuments: vi.fn(),
  getERPAccountRequests: vi.fn(),
  getERPNotifications: vi.fn(),
  getERPOverview: vi.fn(),
  getERPTaskDocumentBlob: vi.fn(),
  getERPWebPushConfig: vi.fn(),
  getDashboardTreeFileBlob: vi.fn(),
  getFolderTree: vi.fn(),
  getERPNotificationPreferences: vi.fn(),
  getTenders: vi.fn(),
  getTenderDocumentBlob: vi.fn(),
  getVaultNote: vi.fn(),
  getVaultNotes: vi.fn(),
  loginERPAdmin: vi.fn(),
  loginERPUser: vi.fn(),
  logoutERP: vi.fn(),
  markERPNotificationRead: vi.fn(),
  markAllERPNotificationsRead: vi.fn(),
  openBlob: vi.fn(),
  rejectERPAccountRequest: vi.fn(),
  rejectERPTaskCompletion: vi.fn(),
  registerERPWebPushSubscription: vi.fn(),
  requestERPTaskCompletion: vi.fn(),
  subscribeERPNotificationStream: vi.fn(),
  updateERPTaskStatus: vi.fn(),
  updateERPNotificationPreferences: vi.fn(),
  uploadTenderDocument: vi.fn(),
  uploadERPTaskDocument: vi.fn(),
  deleteERPWebPushSubscription: vi.fn(),
}));

const adminSession = {
  role: 'admin',
  name: 'Admin',
  user_id: null,
  email: null,
  access_token: 'test-token',
  refresh_token: 'refresh-token',
};

const overview = {
  users: [
    {
      id: 1,
      name: 'Ayşe Demir',
      role: 'employee',
      status: 'online',
      email: 'ayse@example.com',
      phone: null,
      last_seen_at: '2026-06-23T09:00:00Z',
      approved_at: '2026-06-20T09:00:00Z',
      created_at: '2026-06-20T09:00:00Z',
    },
    {
      id: 2,
      name: 'Mehmet Kaya',
      role: 'employee',
      status: 'offline',
      email: 'mehmet@example.com',
      phone: null,
      last_seen_at: '2026-06-21T09:00:00Z',
      approved_at: '2026-06-20T09:00:00Z',
      created_at: '2026-06-20T09:00:00Z',
    },
  ],
  teams: [],
  tasks: [
    {
      id: 10,
      title: 'Geciken teklif dosyasını kontrol et',
      description: 'Deadline geçmiş kritik görev',
      assigned_by_user_id: null,
      status: 'overdue',
      priority: 'urgent',
      deadline_at: '2026-06-20T10:00:00Z',
      completed_at: null,
      created_at: '2026-06-19T10:00:00Z',
    },
    {
      id: 11,
      title: 'Yeni şartnameyi oku',
      description: null,
      assigned_by_user_id: null,
      status: 'todo',
      priority: 'normal',
      deadline_at: '2026-06-30T10:00:00Z',
      completed_at: null,
      created_at: '2026-06-22T10:00:00Z',
    },
  ],
  assignments: [
    {
      id: 1,
      task_id: 10,
      assignee_user_id: 1,
      assignee_team_id: null,
      created_at: '2026-06-19T10:00:00Z',
    },
    {
      id: 2,
      task_id: 11,
      assignee_user_id: 2,
      assignee_team_id: null,
      created_at: '2026-06-22T10:00:00Z',
    },
  ],
  documents: [],
  help_messages: [],
  notifications: [],
};

function storeSession() {
  window.localStorage.setItem('docsbot.erp.session', JSON.stringify(adminSession));
}

function mockApi() {
  vi.mocked(api.getERPOverview).mockResolvedValue(overview);
  vi.mocked(api.getDocuments).mockResolvedValue([]);
  vi.mocked(api.getTenders).mockResolvedValue([]);
  vi.mocked(api.getFolderTree).mockResolvedValue({
    data_originals: { name: 'originals', path: 'originals', type: 'folder', children: [] },
    obsidian_vault: { name: 'ihaleler', path: 'ihaleler', type: 'folder', children: [] },
  });
  vi.mocked(api.getVaultNotes).mockResolvedValue({ vault_root: 'vault/ihaleler', notes: [] });
  vi.mocked(api.getERPAccountRequests).mockResolvedValue([]);
  vi.mocked(api.getERPNotifications).mockResolvedValue([]);
  vi.mocked(api.getERPNotificationPreferences).mockResolvedValue({
    user_id: 0,
    task_assigned_enabled: true,
    manager_message_enabled: true,
    employee_help_message_enabled: true,
    completion_updates_enabled: true,
    deadline_alerts_enabled: true,
    browser_push_enabled: false,
    email_enabled: false,
    updated_at: '2026-06-23T09:00:00Z',
  });
  vi.mocked(api.getERPWebPushConfig).mockResolvedValue({ enabled: false, public_key: '' });
  vi.mocked(api.subscribeERPNotificationStream).mockResolvedValue(undefined);
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    storeSession();
    mockApi();
  });

  it('renders the ERP overview from live data', async () => {
    render(<App />);

    expect(await screen.findByText('Geciken teklif dosyasını kontrol et')).toBeInTheDocument();
    expect(screen.getByText('Gecikmiş Çalışanlar')).toBeInTheDocument();
    expect(screen.getAllByText('Ayşe Demir').length).toBeGreaterThan(0);
  });

  it('opens the overdue employee drilldown from the overview', async () => {
    const user = userEvent.setup();
    render(<App />);

    const panel = await screen.findByText('Gecikmiş Çalışanlar');
    await user.click(within(panel.closest('div')!).getByText('Tümü'));

    expect(await screen.findByText('1 çalışan gecikmiş görev filtresinde gösteriliyor.')).toBeInTheDocument();
    expect(screen.getByText('Ayşe Demir')).toBeInTheDocument();
    expect(screen.queryByText('Mehmet Kaya')).not.toBeInTheDocument();
  });
});
