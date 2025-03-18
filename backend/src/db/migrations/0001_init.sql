DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_type_enum') THEN
        CREATE TYPE user_type_enum AS ENUM ('COMPANY_USER', 'CUSTOMER');
    END IF;
END $$;

-- Create tables
CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Updated users table definition with user_type column
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    user_type user_type_enum NOT NULL DEFAULT 'COMPANY_USER',
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);

-- Create enums only if they do not already exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'file_status_enum') THEN
        CREATE TYPE file_status_enum AS ENUM ('uploaded', 'batched', 'processing', 'completed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'field_type_enum') THEN
        CREATE TYPE field_type_enum AS ENUM ('short_text', 'long_text', 'number', 'single_select', 'multiple_select');
    END IF;
END $$;

-- Table to store product meta information (non-partitioned)
CREATE TABLE IF NOT EXISTS product_list (
    id SERIAL,
    company_id INTEGER NOT NULL,
    list_name VARCHAR(255) NOT NULL,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT,
    PRIMARY KEY (id, company_id),
    UNIQUE (company_id, list_name)
);

-- Create new product_list_meta table with new columns
CREATE TABLE IF NOT EXISTS product_list_meta (
    id SERIAL,
    company_id INTEGER NOT NULL,
    product_list_id INTEGER NOT NULL,
    file_path VARCHAR(255),
    invite_code VARCHAR(255),
    batched_files_path VARCHAR(255),
    file_status file_status_enum,
    total_batches INTEGER,
    processed_batches INTEGER,
    last_processed_at BIGINT,
    is_invite_expired BOOLEAN DEFAULT FALSE,
    error TEXT,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT,
    PRIMARY KEY (id, company_id),
    UNIQUE (company_id, invite_code),
    FOREIGN KEY (product_list_id, company_id) REFERENCES product_list (id, company_id)
);

-- Table to store product details (non-partitioned)
CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL,
    company_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    image_url VARCHAR(255),
    brand VARCHAR(255),
    barcode VARCHAR(255) NOT NULL,
    product_list_id INTEGER NOT NULL,
    is_ai_enriched BOOLEAN DEFAULT FALSE,
    has_image BOOLEAN DEFAULT FALSE,
    enriched_at BIGINT,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT,
    deleted_at BIGINT,
    PRIMARY KEY (id, company_id),
    FOREIGN KEY (product_list_id, company_id) REFERENCES product_list (id, company_id),
    UNIQUE (company_id, product_list_id, barcode)
) PARTITION BY LIST (company_id);

-- Table to store AI-enriched fields (non-partitioned)
CREATE TABLE IF NOT EXISTS product_ai_fields (
    id SERIAL,
    company_id INTEGER NOT NULL,
    product_list_id INTEGER NOT NULL,
    field_name VARCHAR(255) NOT NULL,
    enrichment_prompt TEXT,
    grouping_criteria VARCHAR(255),
    is_ai_editable BOOLEAN DEFAULT TRUE,
    is_sortable BOOLEAN DEFAULT FALSE,
    is_filterable BOOLEAN DEFAULT FALSE,
    type field_type_enum NOT NULL,
    options VARCHAR(255)[],
    is_ai_suggested BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT,
    deleted_at BIGINT,
    PRIMARY KEY (id, company_id),
    UNIQUE (company_id, field_name)
);

-- Table to store AI-enriched values in JSONB (non-partitioned)
CREATE TABLE IF NOT EXISTS product_ai_field_values (
    id BIGSERIAL,
    company_id INTEGER NOT NULL,
    product_id BIGINT NOT NULL,
    data JSONB,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT,
    PRIMARY KEY (id, company_id)
) PARTITION BY LIST (company_id);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_product_list_meta_company_id_is_invite_expired ON product_list_meta (company_id, is_invite_expired);
CREATE INDEX IF NOT EXISTS idx_product_ai_fields_company_id_product_list_id_is_deleted_field_name ON product_ai_fields (company_id, product_list_id, is_deleted, field_name);
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_product_list_company_id ON product_list(company_id);
CREATE INDEX IF NOT EXISTS idx_product_list_meta_company_id ON product_list_meta(company_id);

-- Function to create partitions dynamically for a new company
CREATE OR REPLACE FUNCTION create_company_partitions(company_id INTEGER) 
RETURNS VOID AS $$
BEGIN
    -- Create partition for products if not exists
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS products_%s PARTITION OF products FOR VALUES IN (%s)',
        company_id, company_id
    );
    
    -- Create partition for product_ai_field_values if not exists
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS product_ai_field_values_%s PARTITION OF product_ai_field_values FOR VALUES IN (%s)',
        company_id, company_id
    );
END;
$$ LANGUAGE plpgsql;


-- Create the trigger function with a better name
CREATE OR REPLACE FUNCTION handle_new_company_partitioning() 
RETURNS TRIGGER AS $$
BEGIN
    -- Call the function to create partitions
    PERFORM create_company_partitions(NEW.id);

    -- Add an index on product_id for the newly created partition of product_ai_field_values
    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_product_ai_field_values_product_id_%s ON product_ai_field_values_%s (product_id)',
        NEW.id, NEW.id
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger on the companies table
CREATE TRIGGER trg_handle_new_company_partitioning
AFTER INSERT ON companies
FOR EACH ROW
EXECUTE FUNCTION handle_new_company_partitioning();

-- Create the trigger function for products partition index creation
CREATE OR REPLACE FUNCTION create_products_partition_indexes(p_company_id INTEGER) 
RETURNS VOID AS $$
DECLARE
    partition_name TEXT;
BEGIN
    -- Get the partition name dynamically
    partition_name := format('products_%s', p_company_id);

    -- Create indexes if not exist for this partition
    EXECUTE format('
        CREATE INDEX IF NOT EXISTS idx_%s_company_product_name 
        ON %s (company_id, product_list_id, name);', 
        partition_name, partition_name);

    EXECUTE format('
        CREATE INDEX IF NOT EXISTS idx_%s_company_product_brand 
        ON %s (company_id, product_list_id, brand);', 
        partition_name, partition_name);

    EXECUTE format('
        CREATE INDEX IF NOT EXISTS idx_%s_company_product_has_image 
        ON %s (company_id, product_list_id, has_image);', 
        partition_name, partition_name);

    EXECUTE format('
        CREATE INDEX IF NOT EXISTS idx_%s_company_product_is_deleted 
        ON %s (company_id, product_list_id, is_deleted);', 
        partition_name, partition_name);

    EXECUTE format('
        CREATE INDEX IF NOT EXISTS idx_%s_company_product_created_at 
        ON %s (company_id, product_list_id, created_at);', 
        partition_name, partition_name);
END;
$$ LANGUAGE plpgsql;

-- Create the trigger function for batch index update
CREATE OR REPLACE FUNCTION trigger_batch_index_update() 
RETURNS TRIGGER AS $$
DECLARE
    affected_company_ids INTEGER[];
    company_id INTEGER;
BEGIN
    -- Get distinct company_id values affected in the batch
    SELECT ARRAY_AGG(DISTINCT company_id) INTO affected_company_ids FROM inserted_rows;

    -- Loop through each company_id and create indexes on its partition
    FOREACH company_id IN ARRAY affected_company_ids LOOP
        PERFORM create_products_partition_indexes(company_id);
    END LOOP;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to create or refresh indexes per company partition
CREATE OR REPLACE FUNCTION manage_product_ai_indexes() RETURNS TRIGGER AS $$
DECLARE
    index_name_gin TEXT;
    index_name_btree TEXT;
BEGIN
    index_name_gin := format('idx_product_ai_field_values_gin_%s_%s', NEW.company_id, NEW.id);
    index_name_btree := format('idx_product_ai_field_values_btree_%s_%I', NEW.company_id, NEW.id);

    -- Create or refresh GIN index if is_sortable is true, else drop the index
    IF NEW.is_sortable THEN
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %s ON product_ai_field_values_%s USING gin ((data->>''%I''))',
            index_name_gin, NEW.company_id, NEW.id
        );
    ELSE
        EXECUTE format(
            'DROP INDEX IF EXISTS %s',
            index_name_gin
        );
    END IF;

    -- Create or refresh BTREE index if is_filterable is true, else drop the index
    IF NEW.is_filterable THEN
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %s ON product_ai_field_values_%s USING btree ((data->>''%I''))',
            index_name_btree, NEW.company_id, NEW.id
        );
    ELSE
        EXECUTE format(
            'DROP INDEX IF EXISTS %s',
            index_name_btree
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function on insert or update
CREATE TRIGGER trg_manage_product_ai_indexes
AFTER INSERT OR UPDATE ON product_ai_fields
FOR EACH ROW
EXECUTE FUNCTION manage_product_ai_indexes();