import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DocumentGroupSummary, ERPUser } from "../api";
import { ForwardActionSheet } from "./ForwardActionSheet";

function user(overrides: Partial<ERPUser>): ERPUser {
  return {
    id: overrides.id ?? 2,
    name: overrides.name ?? "Test User",
    role: overrides.role ?? "user",
    status: overrides.status ?? "online",
    email: overrides.email ?? "user@mobit.com.tr",
    phone: overrides.phone ?? null,
    document_network_visible: overrides.document_network_visible ?? false,
    last_seen_at: overrides.last_seen_at ?? null,
    approved_at: overrides.approved_at ?? "2026-07-07T00:00:00Z",
    created_at: overrides.created_at ?? "2026-07-07T00:00:00Z",
  };
}

function room(overrides: Partial<DocumentGroupSummary>): DocumentGroupSummary {
  return {
    id: overrides.id ?? 5,
    name: overrides.name ?? "BEDAS Çalışma Alanı",
    description: overrides.description ?? null,
    tender_id: overrides.tender_id ?? "BEDAS-2026-001",
    year: overrides.year ?? 2026,
    created_by: overrides.created_by ?? "Admin",
    archived_at: overrides.archived_at ?? null,
    created_at: overrides.created_at ?? "2026-07-07T00:00:00Z",
    updated_at: overrides.updated_at ?? "2026-07-07T00:00:00Z",
    member_count: overrides.member_count ?? 3,
    document_count: overrides.document_count ?? 4,
  };
}

describe("ForwardActionSheet", () => {
  it("kişileri ve odaları Türkçe bölümler altında gösterir", () => {
    render(
      <ForwardActionSheet
        title="teklif.pdf"
        people={[user({ name: "Admin", role: "admin" }), user({ name: "Test User", role: "user" })]}
        rooms={[room({ name: "BEDAS Çalışma Alanı", member_count: 3 })]}
        onClose={vi.fn()}
        onForwardToPerson={vi.fn()}
        onForwardToRoom={vi.fn()}
      />
    );

    expect(screen.getByText("İlet")).toBeInTheDocument();
    expect(screen.getByText("teklif.pdf")).toBeInTheDocument();
    expect(screen.getByText("Kişi Seç")).toBeInTheDocument();
    expect(screen.getByText("Oda Seç")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Yönetici")).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("Kullanıcı")).toBeInTheDocument();
    expect(screen.getByText("BEDAS Çalışma Alanı")).toBeInTheDocument();
    expect(screen.getByText("3 üye")).toBeInTheDocument();
  });

  it("kişi, oda ve kapat aksiyonlarını çağırır", async () => {
    const selectedPerson = user({ id: 7, name: "Ayşe Yılmaz" });
    const selectedRoom = room({ id: 9, name: "IBB Operasyon" });
    const onClose = vi.fn();
    const onForwardToPerson = vi.fn();
    const onForwardToRoom = vi.fn();
    const eventUser = userEvent.setup();

    render(
      <ForwardActionSheet
        title="Ses mesajı"
        people={[selectedPerson]}
        rooms={[selectedRoom]}
        onClose={onClose}
        onForwardToPerson={onForwardToPerson}
        onForwardToRoom={onForwardToRoom}
      />
    );

    await eventUser.click(screen.getByRole("button", { name: /Ayşe Yılmaz/i }));
    await eventUser.click(screen.getByRole("button", { name: /IBB Operasyon/i }));
    await eventUser.click(screen.getByRole("button", { name: "Kapat" }));

    expect(onForwardToPerson).toHaveBeenCalledWith(selectedPerson);
    expect(onForwardToRoom).toHaveBeenCalledWith(selectedRoom);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("boş hedef listeleri için Türkçe boş durum gösterir", () => {
    render(
      <ForwardActionSheet
        title="Merhaba"
        people={[]}
        rooms={[]}
        onClose={vi.fn()}
        onForwardToPerson={vi.fn()}
        onForwardToRoom={vi.fn()}
      />
    );

    expect(screen.getByText("Uygun kişi yok.")).toBeInTheDocument();
    expect(screen.getByText("Uygun oda yok.")).toBeInTheDocument();
  });
});
