create table document_group_messages (
    id bigserial primary key,
    group_id bigint not null references document_groups(id) on delete cascade,
    author_user_id bigint references erp_users(id) on delete set null,
    author_name varchar(255) not null,
    body text not null,
    created_at timestamptz not null
);

create index idx_document_group_messages_group_created on document_group_messages(group_id, created_at asc, id asc);
