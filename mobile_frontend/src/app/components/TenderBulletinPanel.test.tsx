import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TenderNotice, TenderWatchProfile } from "../api";
import { TenderBulletinPanel } from "./TenderBulletinPanel";

const mocks = vi.hoisted(() => ({
  getTenderNotices: vi.fn(),
  getTenderCategories: vi.fn(),
  getTenderNoticeDetail: vi.fn(),
  refreshTenderBulletin: vi.fn(),
  getTenderProfile: vi.fn(),
  saveTenderProfile: vi.fn(),
  openTenderTask: vi.fn(),
}));
vi.mock("../api", () => mocks);

const NOW = new Date("2026-08-09T09:00:00Z");

function notice(overrides: Partial<TenderNotice> = {}): TenderNotice {
  return {
    id: 1,
    ikn: "2026/1434625",
    title: "Siirt İli Muhtelif Köylerin Altyapı ile Duvar Yapım İşi",
    authority: "Siirt İl Özel İdaresi",
    province: "Siirt",
    category: "insaat",
    category_label: "İnşaat ve Yapım",
    bulletin_type: "yapim",
    tender_at_text: "26.08.2026 - 10:00",
    tender_at: "2026-08-26T07:00:00Z",
    quantity: "12 km",
    delivery_place: "Siirt",
    address: "Siirt Merkez/Siirt",
    task_id: null,
    ...overrides,
  };
}

/** An untouched profile: nothing narrowed, so the whole bulletin is "ours". */
function profile(overrides: Partial<TenderWatchProfile> = {}): TenderWatchProfile {
  return {
    categories: [], provinces: [], notify_daily: true, matching_count: 0,
    updated_by: null, updated_at: null, ...overrides,
  };
}

describe("TenderBulletinPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getTenderNotices.mockResolvedValue([]);
    mocks.getTenderCategories.mockResolvedValue([]);
    mocks.getTenderProfile.mockResolvedValue(profile());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ilanı işi, idaresi ve iliyle listeler", async () => {
    mocks.getTenderNotices.mockResolvedValue([notice()]);

    render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);

    expect(await screen.findByText(/Muhtelif Köylerin Altyapı/)).toBeInTheDocument();
    expect(screen.getByText("Siirt İl Özel İdaresi")).toBeInTheDocument();
    expect(screen.getByText("İnşaat ve Yapım")).toBeInTheDocument();
    expect(screen.getByText("1 açık ihale")).toBeInTheDocument();
  });

  it("kalan süreyi gün olarak söyler", async () => {
    mocks.getTenderNotices.mockResolvedValue([notice()]);

    render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);

    // A date on its own makes every reader do the subtraction, and the answer to "is this worth
    // opening" is how long is left, not when it closes.
    expect(await screen.findByText("16 gün kaldı")).toBeInTheDocument();
  });

  it("kategoriye tıklayınca listeyi o kategoriyle ister", async () => {
    mocks.getTenderCategories.mockResolvedValue([
      { code: "elektrik", label: "Elektrik ve Enerji", count: 8 },
      { code: "gida", label: "Gıda ve Yemek", count: 0 },
    ]);
    render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);

    await userEvent.click(await screen.findByText("Elektrik ve Enerji 8"));

    await waitFor(() => expect(mocks.getTenderNotices).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: "elektrik" })));
    // An empty category is a chip that does nothing; it is left out rather than shown greyed.
    expect(screen.queryByText(/Gıda ve Yemek/)).not.toBeInTheDocument();
  });

  it("boş sonucu hata gibi değil, boş gibi gösterir", async () => {
    render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);

    expect(await screen.findByText("Bu filtrelerde açık ihale yok.")).toBeInTheDocument();
  });

  it("bülteni çekmeyi yalnızca yöneticiye verir", async () => {
    const { unmount } = render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);
    await screen.findByText("Kamu İhale Bülteni");
    // Pulling reaches out to EKAP's servers; reading what was already pulled does not.
    expect(screen.queryByLabelText("Bülteni çek")).not.toBeInTheDocument();
    unmount();

    render(<TenderBulletinPanel isAdmin onClose={vi.fn()} />);
    expect(await screen.findByLabelText("Bülteni çek")).toBeInTheDocument();
  });

  it("ilan açılınca metnin tamamını gösterir", async () => {
    mocks.getTenderNotices.mockResolvedValue([notice()]);
    mocks.getTenderNoticeDetail.mockResolvedValue({
      notice: notice(),
      body: "3x240/25 mm² XLPE kablo ve montaj işleri",
      section: "İHALE İLANLARI",
    });
    render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);

    await userEvent.click(await screen.findByText(/Muhtelif Köylerin Altyapı/));

    // The line that decides whether a company can do the work lives in the body and nowhere else.
    expect(await screen.findByText(/3x240\/25 mm² XLPE kablo/)).toBeInTheDocument();
  });

  it("varsayılan olarak şirkete uygun ilanları ister", async () => {
    render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);

    // A company that set a profile wants its own work first. One that has not set a profile is
    // watching everything anyway, so the default costs it nothing either way.
    await waitFor(() => expect(mocks.getTenderNotices).toHaveBeenLastCalledWith(
      expect.objectContaining({ mine: true })));
  });

  it("süzgeci kapatınca bültenin tamamını ister", async () => {
    mocks.getTenderProfile.mockResolvedValue(profile({ categories: ["elektrik"], matching_count: 4 }));
    render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);

    await userEvent.click(await screen.findByText("✓ Bize uygun (4)"));

    await waitFor(() => expect(mocks.getTenderNotices).toHaveBeenLastCalledWith(
      expect.objectContaining({ mine: false })));
  });

  it("profil boşken listenin neden kısalmadığını söyler", async () => {
    render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);

    // Otherwise the switch looks broken: it is on, and the list is the whole bulletin.
    expect(await screen.findByText("Henüz iş kolu seçilmedi, bülten olduğu gibi gösteriliyor."))
      .toBeInTheDocument();
  });

  it("profili yalnızca yönetici düzenler", async () => {
    const { unmount } = render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);
    await screen.findByText("Kamu İhale Bülteni");
    // It decides what every employee sees and what the morning notification says.
    expect(screen.queryByText("Profil belirle")).not.toBeInTheDocument();
    unmount();

    render(<TenderBulletinPanel isAdmin onClose={vi.fn()} />);
    expect(await screen.findByText("Profil belirle")).toBeInTheDocument();
  });

  it("profil kaydedilince liste yeniden yüklenir", async () => {
    mocks.getTenderCategories.mockResolvedValue([
      { code: "elektrik", label: "Elektrik ve Enerji", count: 8 },
    ]);
    const saved = profile({ categories: ["elektrik"], matching_count: 8 });
    mocks.saveTenderProfile.mockResolvedValue(saved);
    // The reload after saving reads the profile back from the server, so the fake one has to agree
    // with itself — otherwise the test is asserting against a server that forgot what it just saved.
    mocks.getTenderProfile.mockResolvedValueOnce(profile()).mockResolvedValue(saved);
    render(<TenderBulletinPanel isAdmin onClose={vi.fn()} />);

    await userEvent.click(await screen.findByText("Profil belirle"));
    // Scoped to the sheet: the same chip is on the list behind it, and clicking that one would
    // filter the screen instead of setting the profile.
    const sheet = within((await screen.findByText("İhale profili")).closest("div.fixed")!);
    await userEvent.click(sheet.getByText("Elektrik ve Enerji 8"));
    await userEvent.click(sheet.getByText("Kaydet"));

    await waitFor(() => expect(mocks.saveTenderProfile).toHaveBeenCalledWith(
      expect.objectContaining({ categories: ["elektrik"], notifyDaily: true })));
    expect(await screen.findByText("✓ Bize uygun (8)")).toBeInTheDocument();
  });

  it("ilandan hazırlık görevi açar", async () => {
    mocks.getTenderNotices.mockResolvedValue([notice()]);
    mocks.getTenderNoticeDetail.mockResolvedValue({
      notice: notice(), body: "gövde", section: "İHALE İLANLARI",
    });
    mocks.openTenderTask.mockResolvedValue({ task_id: 42, title: "İhale hazırlığı: ..." });
    render(<TenderBulletinPanel isAdmin onClose={vi.fn()} />);

    await userEvent.click(await screen.findByText(/Muhtelif Köylerin Altyapı/));
    await userEvent.click(await screen.findByText("Hazırlık görevi aç"));

    expect(mocks.openTenderTask).toHaveBeenCalledWith(1);
    // The button becomes the answer to "is anyone on this", so the next person does not open it
    // again from the same screen.
    expect(await screen.findByText("Görev açıldı (#42)")).toBeInTheDocument();
  });

  it("görevi olan ilan tekrar açtırmaz", async () => {
    mocks.getTenderNotices.mockResolvedValue([notice({ task_id: 7 })]);
    mocks.getTenderNoticeDetail.mockResolvedValue({
      notice: notice({ task_id: 7 }), body: "gövde", section: "İHALE İLANLARI",
    });
    render(<TenderBulletinPanel isAdmin onClose={vi.fn()} />);

    await userEvent.click(await screen.findByText(/Muhtelif Köylerin Altyapı/));

    expect(await screen.findByText("Görev açıldı (#7)")).toBeInTheDocument();
    expect(screen.queryByText("Hazırlık görevi aç")).not.toBeInTheDocument();
  });

  it("görev açmayı yalnızca yöneticiye verir", async () => {
    mocks.getTenderNotices.mockResolvedValue([notice()]);
    mocks.getTenderNoticeDetail.mockResolvedValue({
      notice: notice(), body: "gövde", section: "İHALE İLANLARI",
    });
    render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);

    await userEvent.click(await screen.findByText(/Muhtelif Köylerin Altyapı/));

    // Task creation is admin-only everywhere else in the app; the server refuses it either way.
    expect(await screen.findByText("İlan metni")).toBeInTheDocument();
    expect(screen.queryByText("Hazırlık görevi aç")).not.toBeInTheDocument();
  });

  it("çekme sonrası yeni ilan yoksa bunu söyler", async () => {
    mocks.refreshTenderBulletin.mockResolvedValue(0);
    render(<TenderBulletinPanel isAdmin onClose={vi.fn()} />);

    await userEvent.click(await screen.findByLabelText("Bülteni çek"));

    // "Nothing new" and "the pull failed" look identical without this line.
    expect(await screen.findByText("Bülten çekildi, yeni ilan yok.")).toBeInTheDocument();
  });
});
