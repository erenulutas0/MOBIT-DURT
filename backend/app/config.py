from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    whatsapp_verify_token: str = Field(default="", alias="WHATSAPP_VERIFY_TOKEN")
    whatsapp_access_token: str = Field(default="", alias="WHATSAPP_ACCESS_TOKEN")
    whatsapp_api_version: str = Field(default="v20.0", alias="WHATSAPP_API_VERSION")
    whatsapp_phone_number_id: str = Field(default="", alias="WHATSAPP_PHONE_NUMBER_ID")
    whatsapp_graph_base_url: str = Field(
        default="https://graph.facebook.com", alias="WHATSAPP_GRAPH_BASE_URL"
    )
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
