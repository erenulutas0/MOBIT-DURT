alter table document_group_messages
    add column message_kind varchar(16) not null default 'text',
    add column media_mime_type varchar(128),
    add column media_data text,
    add column media_duration_ms integer;

create index idx_document_group_messages_kind on document_group_messages(message_kind);
