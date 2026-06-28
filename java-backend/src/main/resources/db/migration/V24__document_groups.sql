create table document_groups (
    id bigserial primary key,
    name varchar(160) not null,
    description text,
    created_by varchar(255) not null,
    archived_at timestamptz,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create table document_group_members (
    id bigserial primary key,
    group_id bigint not null references document_groups(id) on delete cascade,
    user_id bigint not null references erp_users(id) on delete cascade,
    role varchar(32) not null,
    added_by varchar(255) not null,
    created_at timestamptz not null,
    unique (group_id, user_id)
);

create table document_group_documents (
    id bigserial primary key,
    group_id bigint not null references document_groups(id) on delete cascade,
    document_id bigint not null references documents(id) on delete cascade,
    uploaded_by_user_id bigint references erp_users(id) on delete set null,
    uploaded_by varchar(255) not null,
    note text,
    created_at timestamptz not null,
    unique (group_id, document_id)
);

create index idx_document_group_members_user_id on document_group_members(user_id);
create index idx_document_group_documents_group_created on document_group_documents(group_id, created_at desc, id desc);
