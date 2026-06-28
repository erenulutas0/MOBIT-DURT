import { expect, test } from '@playwright/test';

const adminSession = {
  role: 'admin',
  name: 'Admin',
  user_id: null,
  email: null,
  access_token: 'e2e-token',
  refresh_token: 'e2e-refresh',
};

const users = [
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
];

test('switches ERP modules and creates a task', async ({ page }) => {
  const tasks = [
    {
      id: 10,
      title: 'Mevcut ihale kontrolü',
      description: null,
      assigned_by_user_id: null,
      status: 'todo',
      priority: 'normal',
      deadline_at: '2026-06-30T10:00:00Z',
      completed_at: null,
      created_at: '2026-06-22T10:00:00Z',
    },
  ];
  const assignments = [
    {
      id: 1,
      task_id: 10,
      assignee_user_id: 1,
      assignee_team_id: null,
      created_at: '2026-06-22T10:00:00Z',
    },
  ];

  await page.addInitScript((session) => {
    window.localStorage.setItem('docsbot.erp.session', JSON.stringify(session));
  }, adminSession);

  await page.route('**/api/erp/overview', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        users,
        teams: [],
        tasks,
        assignments,
        documents: [],
        help_messages: [],
        notifications: [],
      }),
    });
  });
  await page.route('**/api/erp/tasks', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const payload = route.request().postDataJSON() as {
      title: string;
      description: string | null;
      assignee_user_ids: number[];
      priority: string;
      deadline_at: string | null;
    };
    const task = {
      id: 11,
      title: payload.title,
      description: payload.description,
      assigned_by_user_id: null,
      status: 'todo',
      priority: payload.priority,
      deadline_at: payload.deadline_at,
      completed_at: null,
      created_at: '2026-06-23T09:00:00Z',
    };
    tasks.unshift(task);
    if (payload.assignee_user_ids[0]) {
      assignments.unshift({
        id: 2,
        task_id: task.id,
        assignee_user_id: payload.assignee_user_ids[0],
        assignee_team_id: null,
        created_at: task.created_at,
      });
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(task) });
  });
  await page.route('**/api/erp/notification-preferences', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user_id: 0,
        task_assigned_enabled: true,
        manager_message_enabled: true,
        employee_help_message_enabled: true,
        completion_updates_enabled: true,
        deadline_alerts_enabled: true,
        browser_push_enabled: false,
        email_enabled: false,
        updated_at: '2026-06-23T09:00:00Z',
      }),
    });
  });
  await page.route('**/api/erp/notifications**', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
  });
  await page.route('**/api/erp/account-requests**', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
  });
  await page.route('**/api/documents', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
  });
  await page.route('**/api/tenders', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
  });
  await page.route('**/api/dashboard/tree', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data_originals: { name: 'originals', path: 'originals', type: 'folder', children: [] },
        obsidian_vault: { name: 'ihaleler', path: 'ihaleler', type: 'folder', children: [] },
      }),
    });
  });
  await page.route('**/api/dashboard/vault/notes', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ vault_root: 'vault/ihaleler', notes: [] }),
    });
  });

  await page.goto('/');
  await expect(page.getByText('Mevcut ihale kontrolü')).toBeVisible();

  await page.getByRole('button', { name: /Çalışanlar/ }).click();
  await expect(page.getByText('Ayşe Demir')).toBeVisible();

  await page.getByRole('button', { name: /Görevler/ }).click();
  await page.getByRole('button', { name: /Görev Oluştur/ }).click();
  await page.getByPlaceholder('Görev başlığı').fill('E2E ihale görevini hazırla');
  await page.locator('select').first().selectOption('1');
  await page.getByPlaceholder('Görev açıklaması').fill('Smoke test tarafından oluşturuldu.');
  await page.getByRole('button', { name: 'Oluştur', exact: true }).click();

  await expect(page.getByText('E2E ihale görevini hazırla')).toBeVisible();
});
