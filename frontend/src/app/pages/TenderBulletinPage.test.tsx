import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TenderNotice } from '../api';
import { TenderBulletinPage } from './TenderBulletinPage';

const mocks = vi.hoisted(() => ({
  getTenderNotices: vi.fn(),
  getTenderCategories: vi.fn(),
  getTenderProvinces: vi.fn(),
  getTenderNoticeDetail: vi.fn(),
  refreshTenderBulletin: vi.fn(),
  getTenderProfile: vi.fn(),
  saveTenderProfile: vi.fn(),
}));
vi.mock('../api', () => mocks);

const NOW = new Date('2026-08-09T09:00:00Z');

function notice(overrides: Partial<TenderNotice> = {}): TenderNotice {
  return {
    id: 1,
    ikn: '2026/1434625',
    title: 'Siirt İli Muhtelif Köylerin Altyapı ile Duvar Yapım İşi',
    authority: 'Siirt İl Özel İdaresi',
    province: 'Siirt',
    category: 'insaat',
    category_label: 'İnşaat ve Yapım',
    bulletin_type: 'yapim',
    tender_at_text: '26.08.2026 - 10:00',
    tender_at: '2026-08-26T07:00:00Z',
    quantity: '12 km',
    delivery_place: 'Siirt',
    address: 'Siirt Merkez/Siirt',
    ...overrides,
  };
}

/** An untouched profile: nothing narrowed, so the whole bulletin counts as "ours". */
function watchProfile(overrides = {}) {
  return {
    categories: [], provinces: [], notify_daily: true, matching_count: 0,
    updated_by: null, updated_at: null, ...overrides,
  };
}

describe('TenderBulletinPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getTenderNotices.mockResolvedValue([]);
    mocks.getTenderCategories.mockResolvedValue([]);
    mocks.getTenderProvinces.mockResolvedValue([]);
    mocks.getTenderProfile.mockResolvedValue(watchProfile());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ilanı işi, idaresi ve kalan süresiyle listeler', async () => {
    mocks.getTenderNotices.mockResolvedValue([notice()]);

    render(<TenderBulletinPage />);

    expect(await screen.findByText(/Muhtelif Köylerin Altyapı/)).toBeInTheDocument();
    expect(screen.getByText('Siirt İl Özel İdaresi')).toBeInTheDocument();
    // A date alone makes every reader do the subtraction; how long is left is the actual question.
    expect(screen.getByText('16 gün kaldı')).toBeInTheDocument();
  });

  it('il çubuğuna tıklayınca listeyi o ille ister', async () => {
    mocks.getTenderProvinces.mockResolvedValue([
      { province: 'Ankara', count: 12 },
      { province: 'Siirt', count: 3 },
    ]);
    render(<TenderBulletinPage />);

    await userEvent.click(await screen.findByText('Ankara'));

    await waitFor(() => expect(mocks.getTenderNotices).toHaveBeenLastCalledWith(
      expect.objectContaining({ province: 'Ankara' })));
  });

  it('boş sonucu hata gibi değil, boş gibi gösterir', async () => {
    render(<TenderBulletinPage />);

    expect(await screen.findByText('Bu filtrelerde açık ihale yok.')).toBeInTheDocument();
  });

  it('çekme sonrası kaç yeni ilan geldiğini söyler', async () => {
    mocks.refreshTenderBulletin.mockResolvedValue(7);
    render(<TenderBulletinPage />);

    await userEvent.click(await screen.findByText('Bülteni çek'));

    // Without the number, "nothing new today" and "the pull failed" are the same silent screen.
    expect(await screen.findByText('7 yeni ilan eklendi.')).toBeInTheDocument();
  });
});
