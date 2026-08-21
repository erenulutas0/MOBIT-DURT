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
  getBidForNotice: vi.fn(),
  recordBid: vi.fn(),
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
    task_id: null,
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

/** No bid recorded yet — every field null, which is what the endpoint returns for a fresh ilan. */
function bid(overrides = {}) {
  return {
    id: null, ikn: null, amount: null, bid_at: null,
    note: null, outcome: null, recorded_by: null, ...overrides,
  };
}

/** Opens the ilan dialog the way a person does: by clicking the row. */
async function openNotice() {
  mocks.getTenderNotices.mockResolvedValue([notice()]);
  mocks.getTenderNoticeDetail.mockResolvedValue({ notice: notice(), body: 'Bu ilanin tam metni.' });
  render(<TenderBulletinPage />);
  await userEvent.click(await screen.findByText(/Muhtelif Köylerin Altyapı/));
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
    mocks.getBidForNotice.mockResolvedValue(bid());
    mocks.recordBid.mockImplementation(async (_id: number, payload: { amount: number }) =>
      bid({ amount: String(payload.amount) }));
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

  it('ilandan teklif kaydeder ve Türkçe binlik ayıracını çözer', async () => {
    await openNotice();

    await userEvent.type(await screen.findByLabelText('Teklif tutarı'), '8.250.000');
    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    // The one number no bulletin service has, and the reason a loss margin is computable at all.
    await waitFor(() => expect(mocks.recordBid).toHaveBeenCalledWith(1, { amount: 8250000 }));
    expect(await screen.findByText(/8\.250\.000 TRY/)).toBeInTheDocument();
  });

  it('kayıtlı teklifi açar açmaz gösterir', async () => {
    mocks.getBidForNotice.mockResolvedValue(bid({ id: 5, amount: '6200000' }));
    await openNotice();

    // Shown before the box invites a new figure, so a second bid is never typed over a first by
    // somebody who could not tell one had been recorded.
    expect(await screen.findByText(/6\.200\.000 TRY/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Güncelle' })).toBeInTheDocument();
  });

  it('geçersiz tutarı göndermez', async () => {
    await openNotice();

    await userEvent.type(await screen.findByLabelText('Teklif tutarı'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Geçerli bir tutar girin.')).toBeInTheDocument();
    expect(mocks.recordBid).not.toHaveBeenCalled();
  });

  it('teklif kaydı okunamazsa ilanı yine de açar', async () => {
    mocks.getBidForNotice.mockRejectedValue(new Error('Teklif kaydı alınamadı.'));
    await openNotice();

    // The ilan is what the click asked for; whether a bid exists is a detail on top of it.
    expect(await screen.findByText('Bu ilanin tam metni.')).toBeInTheDocument();
    expect(screen.getByLabelText('Teklif tutarı')).toBeInTheDocument();
  });
});
