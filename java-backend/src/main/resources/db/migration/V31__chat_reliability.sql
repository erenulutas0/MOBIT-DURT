alter table erp_direct_messages
    add column if not exists client_message_id varchar(128);

alter table erp_direct_messages
    add column if not exists delivered_at timestamptz;

update erp_direct_messages
set delivered_at = created_at
where delivered_at is null;

create index if not exists idx_erp_direct_messages_client_id
    on erp_direct_messages(sender_type, sender_user_id, client_message_id);

alter table document_group_messages
    add column if not exists client_message_id varchar(128);

alter table document_group_messages
    add column if not exists delivered_at timestamptz;

alter table document_group_messages
    add column if not exists sequence_no bigint;

update document_group_messages
set delivered_at = created_at
where delivered_at is null;

update document_group_messages
set sequence_no = id
where sequence_no is null;

create index if not exists idx_document_group_messages_client_id
    on document_group_messages(group_id, author_user_id, client_message_id);

create index if not exists idx_document_group_messages_sequence
    on document_group_messages(group_id, sequence_no);

create table if not exists document_group_message_read_receipts (
    id bigserial primary key,
    message_id bigint not null references document_group_messages(id) on delete cascade,
    actor_key varchar(64) not null,
    read_at timestamptz not null,
    constraint uq_document_group_message_read_actor unique (message_id, actor_key)
);

create index if not exists idx_document_group_message_read_actor
    on document_group_message_read_receipts(actor_key, read_at);
