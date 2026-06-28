CREATE INDEX ix_documents_search_vector
    ON documents USING gin (
        to_tsvector(
            'simple',
            coalesce(original_filename, '') || ' ' ||
            coalesce(stored_filename, '') || ' ' ||
            coalesce(caption, '') || ' ' ||
            coalesce(tender_id, '') || ' ' ||
            coalesce(organization, '') || ' ' ||
            coalesce(internal_unit, '') || ' ' ||
            coalesce(document_type, '') || ' ' ||
            coalesce(extracted_text, '')
        )
    );

CREATE INDEX ix_documents_search_filters
    ON documents(organization, year, document_type, tender_id, timestamp DESC);
