import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentAnswer, DocumentIndexStatus } from "../api";
import { DocumentSearchPanel } from "./DocumentSearchPanel";

const mocks = vi.hoisted(() => ({ askDocuments: vi.fn(), getDocumentIndexStatus: vi.fn() }));
vi.mock("../api", () => mocks);
const { askDocuments, getDocumentIndexStatus } = mocks;

function status(overrides: Partial<DocumentIndexStatus> = {}): DocumentIndexStatus {
  return {
    ready: true,
    model: "intfloat/multilingual-e5-base",
    indexed_documents: 16,
    pending_documents: 0,
    awaiting_text: 0,
    ...overrides,
  };
}

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
    getDocumentIndexStatus.mockReset();
    getDocumentIndexStatus.mockResolvedValue(status());
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

  it("arşiv boşken örnek soru önermez, ne yapılacağını söyler ve oraya götürür", async () => {
    const user = userEvent.setup();
    const onOpenArchive = vi.fn();
    getDocumentIndexStatus.mockResolvedValue(status({ indexed_documents: 0 }));
    render(<DocumentSearchPanel onClose={vi.fn()} onOpenArchive={onOpenArchive} />);

    // Four suggestions that all come back "bulamadım" read as a broken feature, not an empty one.
    expect(await screen.findByText("Arşivde aranacak belge yok")).toBeInTheDocument();
    expect(screen.queryByText("Gecikirsem ne kadar ceza öderim?")).not.toBeInTheDocument();

    await user.click(screen.getByText("Belge yükle"));
    expect(onOpenArchive).toHaveBeenCalled();
  });

  it("belgeler sıradayken beklemeyi söyler, boş arşivle karıştırmaz", async () => {
    getDocumentIndexStatus.mockResolvedValue(
      status({ indexed_documents: 0, pending_documents: 3, awaiting_text: 2 })
    );
    render(<DocumentSearchPanel onClose={vi.fn()} onOpenArchive={vi.fn()} />);

    // "Nothing uploaded" and "uploaded, still being read" need different answers: only one of
    // them asks the user to do something, and uploading again is not it.
    expect(await screen.findByText("5 belge sıraya alındı")).toBeInTheDocument();
    expect(screen.queryByText("Belge yükle")).not.toBeInTheDocument();
  });

  it("servis hazır değilken soruyu değiştirmeyi önermez", async () => {
    const user = userEvent.setup();
    getDocumentIndexStatus.mockRejectedValue(new Error("durum alınamadı"));
    askDocuments.mockResolvedValue(answer({
      ready: false,
      message: "Doküman asistanı henüz hazırlanıyor.",
      passages: [],
    }));
    render(<DocumentSearchPanel onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Sorunuzu yazın…"), "teminat süresi");
    await user.click(screen.getByLabelText("Ara"));

    // Rephrasing cannot help when nothing is searchable; saying so is the difference between a
    // user who waits and a user who concludes the feature does not work.
    expect(await screen.findByText(/soruyu değiştirmek işe yaramaz/)).toBeInTheDocument();
  });

  it("kaç belge içinde arandığını söyler", async () => {
    render(<DocumentSearchPanel onClose={vi.fn()} />);

    // "Belgelerinizde yok" means one thing over sixteen files and another over four hundred.
    expect(await screen.findByText(/16 belge içinde aranıyor/)).toBeInTheDocument();
  });

  it("durum okunamazsa ekran eskisi gibi çalışır", async () => {
    getDocumentIndexStatus.mockRejectedValue(new Error("durum alınamadı"));
    render(<DocumentSearchPanel onClose={vi.fn()} />);

    // A status probe is a nicety; losing it must not cost the feature.
    expect(await screen.findByText("Gecikirsem ne kadar ceza öderim?")).toBeInTheDocument();
  });

  it("boş soru gönderilmez", async () => {
    const user = userEvent.setup();
    render(<DocumentSearchPanel onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Sorunuzu yazın…"), "   ");

    expect(screen.getByLabelText("Ara")).toBeDisabled();
    expect(askDocuments).not.toHaveBeenCalled();
  });
});
