-- Décor de test pour le moteur SQLite (specs 17a, 17b).
--
-- **Aucun conteneur, aucun serveur** : c'est le seul moteur du projet dont le décor est un fichier
-- que le test crée lui-même. Ce script est donc appliqué depuis le code Rust, et non par un script
-- de démarrage — mais il vit ici, avec les deux autres décors, pour qu'on sache où le lire.
--
-- **Noms inventés**, comme le veut `AGENTS.md`.
--
--   3 tables       dont une **vide** et une avec clé étrangère
--   1 vue          pour la distinguer d'une table (`17b`)
--   1 déclencheur
--   2 index        dont un unique
--   affinités      un exemple par famille, plus une colonne **sans type déclaré**
--   1 valeur hors type : du texte dans une colonne `INTEGER`, ce que SQLite autorise

create table ateliers (
  id integer primary key autoincrement,
  nom text not null,
  ville varchar(80),
  ouvert_le date,
  -- Une colonne **sans type déclaré** : légal en SQLite, et le catalogue doit le dire plutôt que
  -- d'inventer un type.
  divers,
  actif boolean default 1
);
create unique index ateliers_nom_uniq on ateliers (nom);

create table seances (
  id integer primary key,
  atelier_id integer not null references ateliers(id) on delete cascade,
  intitule text not null,
  places integer default 12,
  tarif_cents integer,
  empreinte blob
);
create index seances_atelier_idx on seances (atelier_id, intitule);

-- Une table **vide** : elle doit apparaître dans l'arbre avec zéro ligne, pas disparaître.
create table listes_attente (
  id integer primary key,
  seance_id integer references seances(id)
);

create view seances_ouvertes as
  select s.id, s.intitule, a.nom as atelier
  from seances s join ateliers a on a.id = s.atelier_id
  where a.actif = 1;

create trigger seances_touch after update on seances
begin
  select 1;
end;

insert into ateliers (nom, ville, ouvert_le, divers, actif) values
  ('Reliure', 'Toulouse', '2025-09-01', 'salle 2', 1),
  ('Sérigraphie', 'Lille', '2026-01-15', null, 1),
  ('Gravure', 'Brest', '2024-04-20', 'fermé l''hiver', 0);

insert into seances (atelier_id, intitule, places, tarif_cents, empreinte) values
  (1, 'Couture copte', 8, 4500, x'0102030405060708'),
  (1, 'Dos carré collé', 10, 3800, null),
  (2, 'Trame et cadre', 6, 5200, x'0807060504030201'),
  (3, 'Pointe sèche', 4, 6100, null);

-- **Du texte dans une colonne `INTEGER`** : SQLite a une affinité de type, pas un type. La grille
-- doit l'afficher sans erreur, et c'est ce qui distingue ce moteur des deux autres (`17b`).
insert into seances (atelier_id, intitule, places, tarif_cents) values
  (2, 'Atelier libre', 'variable', null);
