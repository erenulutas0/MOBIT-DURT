import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeleteActionSheet, MessageOptionsSheet } from "./MessageActionSheets";

describe("MessageActionSheets", () => {
  it("mesaj seçeneklerini Türkçe gösterir ve aksiyonları çağırır", async () => {
    const onClose = vi.fn();
    const onDelete = vi.fn();
    const onForward = vi.fn();
    const user = userEvent.setup();

    render(
      <MessageOptionsSheet
        title="Merhaba"
        onClose={onClose}
        onDelete={onDelete}
        onForward={onForward}
      />
    );

    expect(screen.getByText("Mesaj seçenekleri")).toBeInTheDocument();
    expect(screen.getByText("Merhaba")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "İlet" }));
    await user.click(screen.getByRole("button", { name: "Sil" }));
    await user.click(screen.getByRole("button", { name: "Kapat" }));

    expect(onForward).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Delete for/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yanıtla" })).not.toBeInTheDocument();
  });

  it("onReply verildiğinde Yanıtla butonunu gösterir ve çağırır", async () => {
    const onReply = vi.fn();
    const user = userEvent.setup();

    render(
      <MessageOptionsSheet
        title="Merhaba"
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onForward={vi.fn()}
        onReply={onReply}
      />
    );

    await user.click(screen.getByRole("button", { name: "Yanıtla" }));
    expect(onReply).toHaveBeenCalledTimes(1);
  });

  it("silme seçeneklerini Türkçe gösterir ve iki farklı silme aksiyonunu ayırır", async () => {
    const onClose = vi.fn();
    const onDeleteForMe = vi.fn();
    const onDeleteForEveryone = vi.fn();
    const user = userEvent.setup();

    render(
      <DeleteActionSheet
        title="foto.jpg"
        onClose={onClose}
        onDeleteForMe={onDeleteForMe}
        onDeleteForEveryone={onDeleteForEveryone}
      />
    );

    expect(screen.getByText("Silme seçeneği")).toBeInTheDocument();
    expect(screen.getByText("foto.jpg")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Herkesten Sil" }));
    await user.click(screen.getByRole("button", { name: "Benden Sil" }));
    await user.click(screen.getByRole("button", { name: "Kapat" }));

    expect(onDeleteForEveryone).toHaveBeenCalledTimes(1);
    expect(onDeleteForMe).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Delete for/i)).not.toBeInTheDocument();
  });

  it("başkasının mesajında herkesten silmeyi hiç önermez", async () => {
    // Sunucu artik bunu 403 ile reddediyor; her zaman basarisiz olan bir secenek sunmak,
    // hic sunmamaktan kotudur.
    render(
      <DeleteActionSheet
        title="Teklifimiz 8.250.000"
        onClose={vi.fn()}
        onDeleteForMe={vi.fn()}
        onDeleteForEveryone={vi.fn()}
        canDeleteForEveryone={false}
      />
    );

    expect(screen.queryByText("Herkesten Sil")).not.toBeInTheDocument();
    expect(screen.getByText("Benden Sil")).toBeInTheDocument();
  });
});
