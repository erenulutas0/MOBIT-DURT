import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MobileAppUpdateInfo } from "../api";
import { AppUpdateBanner } from "./AppUpdateBanner";

function updateInfo(overrides: Partial<MobileAppUpdateInfo> = {}): MobileAppUpdateInfo {
  return {
    current_version: "1.0.6",
    latest_version: "1.0.7",
    minimum_version: "1.0.7",
    update_available: true,
    required: true,
    title: "",
    message: "",
    play_store_url: "https://play.google.com/store/apps/details?id=com.mobit.docsbotops",
    ...overrides,
  };
}

describe("AppUpdateBanner", () => {
  it("zorunlu güncelleme metnini Türkçe gösterir", () => {
    render(<AppUpdateBanner update={updateInfo()} />);

    expect(screen.getByText("Yeni versiyon geldi")).toBeInTheDocument();
    expect(screen.getByText("Uygulamanızı düzgün kullanmanız için güncellemeniz gerekmektedir.")).toBeInTheDocument();
    expect(screen.getByText("v1.0.6 → v1.0.7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Güncelle" })).toBeInTheDocument();
  });

  it("opsiyonel güncellemede backend başlık ve mesajını gösterir", () => {
    render(<AppUpdateBanner update={updateInfo({
      required: false,
      title: "Yeni sürüm hazır",
      message: "Yeni sürümü yüklemeniz önerilir.",
      minimum_version: "1.0.5",
    })} />);

    expect(screen.getByText("Yeni sürüm hazır")).toBeInTheDocument();
    expect(screen.getByText("Yeni sürümü yüklemeniz önerilir.")).toBeInTheDocument();
  });

  it("Güncelle butonu Play Store linkini yeni pencerede açar", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const user = userEvent.setup();

    render(<AppUpdateBanner update={updateInfo()} />);
    await user.click(screen.getByRole("button", { name: "Güncelle" }));

    expect(open).toHaveBeenCalledWith(
      "https://play.google.com/store/apps/details?id=com.mobit.docsbotops",
      "_blank",
      "noopener,noreferrer"
    );
  });
});
