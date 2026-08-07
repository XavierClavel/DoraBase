-- Schéma de test pour l'introspection PostgreSQL (specs 06c, 06d).
--
-- Composition **délibérée** : chaque cas que les tests vérifient est présent une fois, et
-- les comptages sont connus, ce qui permet d'assener des valeurs exactes plutôt que des
-- « au moins un ». Modifier ce fichier casse des tests par conception — c'est le but.
--
--   2 tables       dont une avec clé étrangère et contrainte CHECK
--   1 vue          jamais analysée, donc `reltuples = -1`
--   2 fonctions    dont une de trigger
--   4 index        deux clés primaires, une unicité, un index secondaire
--   1 trigger      non interne
--   9 colonnes     sur `orders`, couvrant les huit catégories de type
--   commentaires   de schéma, de table et de colonne
--
-- Idempotent : le `drop ... cascade` permet de le rejouer.
--
-- Local :
--   docker exec -i dorabase-test-pg psql -U dorabase -d dorabase_test < scripts/schema-test-pg.sql
-- CI : voir le job `engine` de .github/workflows/ci.yml

drop schema if exists introspection cascade;
create schema introspection;
comment on schema introspection is 'schéma de test pour 06c';

create table introspection.users (
  id bigserial primary key,
  email text not null unique,
  name varchar(120),
  created_at timestamptz not null default now()
);
comment on table introspection.users is 'les comptes';
comment on column introspection.users.email is 'unique, sert d''identifiant';

-- Neuf colonnes couvrant les huit catégories de `TypeCategory`, dont les trois que
-- `typcategory = 'U'` confond : jsonb, uuid, bytea.
create table introspection.orders (
  id bigserial primary key,
  user_id bigint not null references introspection.users(id),
  status text not null default 'pending',
  total_cents integer,
  metadata jsonb,
  ref uuid,
  paid boolean,
  blob bytea,
  created_at timestamptz not null default now(),
  constraint total_positif check (total_cents is null or total_cents >= 0)
);
create index orders_status_idx on introspection.orders (status);

create view introspection.paid_orders as
  select * from introspection.orders where status = 'paid';

create function introspection.compte_commandes() returns bigint
  language sql as 'select count(*) from introspection.orders';

create function introspection.touch() returns trigger
  language plpgsql as 'begin return new; end';

create trigger orders_touch before update on introspection.orders
  for each row execute function introspection.touch();

insert into introspection.users (email, name)
  select 'u' || g || '@x.io', 'U' || g from generate_series(1, 50) g;

insert into introspection.orders (user_id, status, total_cents)
  select 1 + (g % 50),
         case when g % 3 = 0 then 'paid' else 'pending' end,
         g * 100
    from generate_series(1, 500) g;

-- `analyze` peuple `reltuples` et `last_analyze` : sans lui, les tests sur l'estimation et
-- sur la colonne « Dernier ANALYZE » de `A4` n'auraient rien à observer. La vue, elle, reste
-- volontairement non analysée — c'est le cas `reltuples = -1`.
analyze introspection.users;
analyze introspection.orders;
