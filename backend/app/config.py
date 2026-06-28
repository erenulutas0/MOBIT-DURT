from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    telegram_bot_token: str = Field(default="", alias="TELEGRAM_BOT_TOKEN")
    telegram_admin_user_ids: str = Field(default="", alias="TELEGRAM_ADMIN_USER_IDS")
    erp_admin_username: str = Field(default="admin", alias="ERP_ADMIN_USERNAME")
    erp_admin_password: str = Field(default="admin123", alias="ERP_ADMIN_PASSWORD")
    database_url: str = Field(default="sqlite:///./data/db.sqlite3", alias="DATABASE_URL")
    data_dir: Path = Field(default=PROJECT_ROOT / "data", alias="DATA_DIR")
    vault_dir: Path = Field(default=PROJECT_ROOT / "vault", alias="VAULT_DIR")
    max_file_size_bytes: int = Field(default=25 * 1024 * 1024, alias="MAX_FILE_SIZE_BYTES")
    phone_hash_salt: str = Field(default="", alias="PHONE_HASH_SALT")

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    def resolve_path(self, value: Path) -> Path:
        if value.is_absolute():
            return value
        return (PROJECT_ROOT / value).resolve()

    @property
    def resolved_data_dir(self) -> Path:
        return self.resolve_path(self.data_dir)

    @property
    def resolved_vault_dir(self) -> Path:
        return self.resolve_path(self.vault_dir)

    @property
    def resolved_database_url(self) -> str:
        if self.database_url.startswith("sqlite:///./"):
            db_path = PROJECT_ROOT / self.database_url.removeprefix("sqlite:///./")
            return f"sqlite:///{db_path.as_posix()}"
        return self.database_url

    @property
    def telegram_admin_ids(self) -> set[int]:
        return {
            int(value.strip())
            for value in self.telegram_admin_user_ids.split(",")
            if value.strip().lstrip("-").isdigit()
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
