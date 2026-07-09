create table erp_direct_message_hidden_receipts (
    id bigserial primary key,
    message_id bigint not null references erp_direct_messages(id) on delete cascade,
    actor_key varchar(64) not null,
    hidden_at timestamp with time zone not null,
    constraint uq_erp_direct_message_hidden_actor unique (message_id, actor_key)
);

create index ix_erp_direct_message_hidden_actor
    on erp_direct_message_hidden_receipts(actor_key, message_id);

create table document_group_message_hidden_receipts (
    id bigserial primary key,
    message_id bigint not null references document_group_messages(id) on delete cascade,
    actor_key varchar(64) not null,
    hidden_at timestamp with time zone not null,
    constraint uq_document_group_message_hidden_actor unique (message_id, actor_key)
);

create index ix_document_group_message_hidden_actor
    on document_group_message_hidden_receipts(actor_key, message_id);
