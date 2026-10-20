-- Fan accounts. Kept in its own migration: a new enum value cannot be used in the transaction that adds it.
alter type public.account_role add value if not exists 'fan';
