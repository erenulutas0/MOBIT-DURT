# DocsBot Ops Java Backend

This is the target Spring Boot backend created during the incremental migration from FastAPI.

## Requirements

- JDK 21 LTS
- Maven Wrapper included in this directory

The current developer machine can compile the project with JDK 22 because the compiler release is fixed to Java 21. CI and production should use JDK 21.

## Run

```powershell
cd java-backend
.\mvnw.cmd spring-boot:run
```

The service listens on `http://127.0.0.1:8080`.

```text
GET /health
GET /actuator/health
```

## Test

```powershell
.\mvnw.cmd test
```

Database auto-configuration is intentionally disabled during migration Phase 1. It will be enabled when the PostgreSQL schema and Flyway migrations are introduced in Phase 2.
