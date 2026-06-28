# Stack

## Migration Decision

The active backend is Java/Spring Boot. Python runtime is disabled and must not be started.

## Target Backend

- Java 21 LTS
- Spring Boot 4.1
- Spring MVC
- Spring Security
- Spring Data JPA
- Bean Validation
- PostgreSQL
- Flyway
- Maven with Maven Wrapper
- JUnit 5
- Spring Boot Test and MockMvc
- Testcontainers for PostgreSQL integration tests
- WireMock for Telegram and external HTTP tests
- Spring Boot Actuator for health and operational endpoints

Architecture:

- Modular monolith.
- Domain packages for auth, ERP, tender, document, ingestion, storage, Telegram, and vault.
- REST API contract remains compatible with the current frontend during migration.
- Local storage is hidden behind a storage interface and can later be replaced with S3/MinIO.

## Archived Legacy Source

The `backend/` directory remains temporarily as read-only migration reference and API contract history. It is not an active service.

Frontend:

- React
- TypeScript
- Vite
- lucide-react
- Recharts
- shadcn-style UI primitives from the Figma export

Storage:

- PostgreSQL for application metadata and permissions
- Local file storage under `data/originals` for the current MVP
- Obsidian-compatible Markdown vault under `vault/ihaleler`
- S3/MinIO as the later production file-storage target

Integrations:

- Telegram Bot API

## Production Direction

Backend:

- Java/Spring Boot modular monolith
- PostgreSQL + Flyway
- Spring Security with access/refresh tokens and RBAC
- Spring Scheduler for initial deadline and maintenance jobs
- Redis only when measured requirements justify distributed cache, locks, or queues
- WebSocket or Server-Sent Events when realtime messaging is implemented

Frontend:

- React + TypeScript for web
- PWA first for mobile-like usage
- Expo React Native later if a real mobile app is needed

Storage:

- S3-compatible object storage such as MinIO or AWS S3
- PostgreSQL for metadata and permissions
- Obsidian vault can remain as generated Markdown export/knowledge layer

Auth:

- JWT sessions for MVP
- Role-based access control
- Owner, manager, employee roles

Notifications:

- In-app notifications first
- Browser notifications / Web Push next
- Firebase Cloud Messaging for mobile later

Document and AI:

- Apache Tika, PDFBox, and Apache POI for Java document extraction
- OpenAI-compatible API for summarization, extraction, comparison, and Q&A
- Deterministic extractors before probabilistic AI processing
- Embeddings/vector search only after document text and permission pipelines are stable

## Why Not Mobile First?

The product still needs workflow validation:

- task assignment rules
- manager views
- document permissions
- tender-to-task handoff
- notifications

A responsive web app is faster to iterate. Once workflows are stable, we can package it as a PWA or build a native mobile app using the same Spring Boot API.

## Local Tooling Status

The current development machine has:

- Maven 3.9.10
- JDK 22

The project target is Java 21 LTS. Install and select a JDK 21 distribution before the Java scaffold is accepted, so local and CI builds use the same release.

See `JAVA_MIGRATION_ROADMAP.md` for the phased transition.
