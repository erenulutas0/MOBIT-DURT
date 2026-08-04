import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TenantServerSheet } from "./TenantServerSheet";

const mocks = vi.hoisted(() => ({
  clearTenantServer: vi.fn(),
  currentTenantServer: vi.fn(() => "https://84-46-251-95.sslip.io"),
  hasCustomTenantServer: vi.fn(() => false),
  probeTenantServer: vi.fn(),
  resolveTenantServer: vi.fn((input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed.toLowerCase()}.84-46-251-95.sslip.io`;
  }),
  setTenantServer: vi.fn(),
}));
vi.mock("../api", () => mocks);

describe("TenantServerSheet", () => {
  beforeEach(() => {
    mocks.clearTenantServer.mockReset();
    mocks.probeTenantServer.mockReset();
    mocks.setTenantServer.mockReset();
    mocks.hasCustomTenantServer.mockReturnValue(false);
  });

  it("şirket kodunu sunucuya bağlar ve önce adrese ulaşılabildiğini doğrular", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const onClose = vi.fn();
    mocks.probeTenantServer.mockResolvedValue(true);
    render(<TenantServerSheet onClose={onClose} onChanged={onChanged} />);

    await user.type(screen.getByPlaceholderText("Şirket kodu"), "acme");
    await user.click(screen.getByText("Bağlan"));

    expect(mocks.probeTenantServer).toHaveBeenCalledWith("https://acme.84-46-251-95.sslip.io");
    expect(mocks.setTenantServer).toHaveBeenCalledWith("acme");
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("ulaşılamayan adresi kaydetmez", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mocks.probeTenantServer.mockResolvedValue(false);
    render(<TenantServerSheet onClose={onClose} onChanged={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Şirket kodu"), "yanlis-kod");
    await user.click(screen.getByText("Bağlan"));

    // A typo stored as the server address is an app that cannot sign in and cannot say why.
    expect(await screen.findByText(/Bu adrese ulaşılamadı/)).toBeInTheDocument();
    expect(mocks.setTenantServer).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("bağlanmadan önce hangi adrese gidileceğini gösterir", async () => {
    const user = userEvent.setup();
    render(<TenantServerSheet onClose={vi.fn()} onChanged={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Şirket kodu"), "acme");

    expect(screen.getByText(/https:\/\/acme\.84-46-251-95\.sslip\.io/)).toBeInTheDocument();
  });

  it("varsayılana dönüş yalnızca özel sunucu seçiliyken görünür", async () => {
    const { unmount } = render(<TenantServerSheet onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.queryByText("Varsayılan sunucuya dön")).not.toBeInTheDocument();
    unmount();

    mocks.hasCustomTenantServer.mockReturnValue(true);
    render(<TenantServerSheet onClose={vi.fn()} onChanged={vi.fn()} />);

    expect(screen.getByText("Varsayılan sunucuya dön")).toBeInTheDocument();
  });
});
