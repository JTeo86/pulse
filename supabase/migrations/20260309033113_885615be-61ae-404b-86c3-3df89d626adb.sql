
ALTER TABLE public.platform_api_keys DROP CONSTRAINT platform_api_keys_category_check;
ALTER TABLE public.platform_api_keys ADD CONSTRAINT platform_api_keys_category_check CHECK (category = ANY (ARRAY['Reviews'::text, 'Editor'::text, 'Publishing'::text, 'Other'::text, 'Video'::text]));
