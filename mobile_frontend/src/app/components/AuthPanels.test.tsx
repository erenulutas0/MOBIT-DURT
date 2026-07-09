import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthFeedback, AuthModeToggle } from "./AuthPanels";

describe("AuthPanels", () => {
  it("giriş ve hesap talebi modlarını Türkçe gösterir ve seçimleri döndürür", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<AuthModeToggle mode="login" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Hesap Talebi" }));
    await user.click(screen.getByRole("button", { name: "Giriş" }));

    expect(onChange).toHaveBeenNthCalledWith(1, "request");
    expect(onChange).toHaveBeenNthCalledWith(2, "login");
  });

  it("başarı mesajını hata mesajına göre öncelikli gösterir", () => {
    render(<AuthFeedback success="Hesap talebiniz admin onayına gönderildi." error="Hata var" />);

    expect(screen.getByText("Hesap talebiniz admin onayına gönderildi.")).toBeInTheDocument();
    expect(screen.queryByText("Hata var")).not.toBeInTheDocument();
  });

  it("hata mesajını Türkçe görünür kılar", () => {
    render(<AuthFeedback error="E-posta ve şifre zorunludur." />);

    expect(screen.getByText("E-posta ve şifre zorunludur.")).toBeInTheDocument();
  });

  it("mesaj yoksa görünür içerik üretmez", () => {
    const { container } = render(<AuthFeedback />);

    expect(container).toBeEmptyDOMElement();
  });
});
