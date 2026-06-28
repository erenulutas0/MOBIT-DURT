alter table erp_direct_messages
    add column message_kind varchar(16) not null default 'text',
    add column media_mime_type varchar(128),
    add column media_data text,
    add column media_duration_ms integer;

create index ix_erp_direct_messages_kind on erp_direct_messages(message_kind);
