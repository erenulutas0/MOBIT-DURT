alter table erp_users
    add column document_network_visible boolean not null default false;

alter table document_groups
    add column tender_id varchar(128),
    add column year integer;

alter table document_group_documents
    add column tender_id varchar(128),
    add column year integer;

create index idx_document_groups_tender_year on document_groups(tender_id, year);
create index idx_document_group_documents_tender_year on document_group_documents(tender_id, year);
