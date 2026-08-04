import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentAnswer } from "../api";
import { DocumentSearchPanel } from "./DocumentSearchPanel";

const askDocuments = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ askDocuments }));

function answer(overrides: Partial<DocumentAnswer> = {}): DocumentAnswer {
  return {
    ready: true,
    message: "1 ilgili bölüm buldum.",
    passages: [
      {
        document_id: 14,
        document_name: "06-odeme-ve-hakedis.txt",
        chunk_index: 2,
        content: "MADDE 2 - ÖDEME SÜRESİ\nİdare, hakediş raporunu onayladıktan sonra 30 gün içinde ödemeyi gerçekleştirir.",
        similarity: 0.875,
      },
    ],
    ...overrides,
  };
}

describe("DocumentSearchPanel", () => {
  beforeEach(() => {
    askDocuments.mockReset();
  });

  it("cevabı belgenin kendi metniyle ve geldiği dosya adıyla gösterir", async () => {
    const user = userEvent.setup();
    askDocuments.mockResolvedValue(answer());
    render(<DocumentSearchPanel onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Sorunuzu yazın…"), "param ne zaman yatar");
    await user.click(screen.getByLabelText("Ara"));

    // The clause itself, not a paraphrase: a şartname answer has to be checkable in the source.
    expect(await screen.findByText(/30 gün içinde ödemeyi gerçekleştirir/)).toBeInTheDocument();
    // And the citation has to be followable — an id is not something a user can open.
    expect(screen.getByText("06-odeme-ve-hakedis.txt")).toBeInTheDocument();
    expect(askDocuments).toHaveBeenCalledWith("param ne zaman yatar");
  });

  it("cevap yoksa bunu açıkça söyler, en yakın alakasız bölümü cevapmış gibi sunmaz", async () => {
    const user = userEvent.setup();
    askDocuments.mockResolvedValue(answer({
      message: "Dokümanlarınızda bu soruya karşılık gelen bir bölüm bulamadım.",
      passages: [],
    }));
    render(<DocumentSearchPanel onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Sorunuzu yazın…"), "kedim neden mama yemiyor");
    await user.click(screen.getByLabelText("Ara"));

    expect(await screen.findByText(/karşılık gelen bir bölüm bulamadım/)).toBeInTheDocument();
  });

  it("örnek soruya dokunmak aramayı başlatır", async () => {
    const user = userEvent.setup();
    askDocuments.mockResolvedValue(answer());
    render(<DocumentSearchPanel onClose={vi.fn()} />);

    // An empty screen that only offers a text box teaches nobody what to type into it.
    await user.click(screen.getByText("Gecikirsem ne kadar ceza öderim?"));

    expect(askDocuments).toHaveBeenCalledWith("Gecikirsem ne kadar ceza öderim?");
  });

  it("arama başarısız olursa hatayı gösterir, boş sonuç gibi davranmaz", async () => {
    const user = userEvent.setup();
    askDocuments.mockRejectedValue(new Error("Belgelerde arama yapılamadı."));
    render(<DocumentSearchPanel onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Sorunuzu yazın…"), "teminat süresi");
    await user.click(screen.getByLabelText("Ara"));

    // "Bulamadım" and "bağlanamadım" are different answers, and only one of them means the
    // documents have nothing to say.
    expect(await screen.findByText("Belgelerde arama yapılamadı.")).toBeInTheDocument();
  });

  it("boş soru gönderilmez", async () => {
    const user = userEvent.setup();
    render(<DocumentSearchPanel onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Sorunuzu yazın…"), "   ");

    expect(screen.getByLabelText("Ara")).toBeDisabled();
    expect(askDocuments).not.toHaveBeenCalled();
  });
});
