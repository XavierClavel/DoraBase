-- Décor de test pour le moteur MySQL (specs 16a → 16c).
--
-- Composition **délibérée**, comme les trois autres décors : chaque cas que les tests vérifient est
-- présent une fois, et les comptages sont connus.
--
-- **Noms inventés**, comme le veut `AGENTS.md`.
--
--   3 tables InnoDB  dont une **vide** et une avec clé étrangère
--   1 table MyISAM   pour que `16c` puisse vérifier le **refus d'écrire sans transaction**
--   1 vue            pour la distinguer d'une table
--   1 déclencheur
--   3 index          dont un unique et un composé
--   types            un par famille, dont `DECIMAL` (exact), `JSON`, `BLOB`, `DATETIME`, `TIMESTAMP`
--   1 mot réservé    une colonne nommée `order`, qui casse tout sans citation au backtick
--
-- Idempotent : les `drop` permettent de le rejouer.

drop view if exists seances_ouvertes;
drop trigger if exists seances_touch;
drop table if exists listes_attente;
drop table if exists seances;
drop table if exists ateliers;
drop table if exists journal_myisam;

create table ateliers (
  id bigint unsigned not null auto_increment primary key,
  nom varchar(120) not null,
  ville varchar(80),
  -- **Un mot réservé comme nom de colonne.** Sans citation au backtick, toute requête qui le touche
  -- échoue — et `16c` en fait un critère.
  `order` int default 0,
  ouvert_le date,
  actif tinyint(1) not null default 1,
  unique key ateliers_nom_uniq (nom)
) engine = InnoDB;

create table seances (
  id bigint unsigned not null auto_increment primary key,
  atelier_id bigint unsigned not null,
  intitule varchar(200) not null,
  places int default 12,
  -- `DECIMAL` : un décimal **exact**, que `Value::Decimal` doit garder en texte. Le convertir en
  -- flottant perdrait la précision — la leçon du défaut du 10 août 2026 en PostgreSQL.
  tarif decimal(10,2),
  metadonnees json,
  empreinte blob,
  -- `DATETIME` **sans fuseau** et `TIMESTAMP` **converti dans le fuseau de session** : deux clients
  -- réglés différemment liraient des valeurs différentes de la même ligne. `16a` force le fuseau.
  cree_le datetime not null default current_timestamp,
  modifie_le timestamp not null default current_timestamp on update current_timestamp,
  constraint seances_atelier_fk foreign key (atelier_id) references ateliers(id) on delete cascade,
  key seances_atelier_idx (atelier_id, intitule)
) engine = InnoDB;

-- Une table **vide** : elle doit apparaître dans l'arbre avec zéro ligne, pas disparaître.
create table listes_attente (
  id bigint unsigned not null auto_increment primary key,
  seance_id bigint unsigned
) engine = InnoDB;

-- **MyISAM ne transige pas.** `16c` doit refuser d'écrire ici — trois modifications s'appliqueraient
-- à moitié, et `06a` promet « tout ou rien ».
create table journal_myisam (
  id int not null auto_increment primary key,
  message varchar(200)
) engine = MyISAM;

create view seances_ouvertes as
  select s.id, s.intitule, a.nom as atelier
  from seances s join ateliers a on a.id = s.atelier_id
  where a.actif = 1;

delimiter //
create trigger seances_touch before update on seances
for each row begin
  set new.places = new.places;
end //
delimiter ;

insert into ateliers (nom, ville, `order`, ouvert_le, actif) values
  ('Reliure', 'Toulouse', 1, '2025-09-01', 1),
  ('Sérigraphie', 'Lille', 2, '2026-01-15', 1),
  ('Gravure', 'Brest', 3, '2024-04-20', 0);

insert into seances (atelier_id, intitule, places, tarif, metadonnees, empreinte, cree_le) values
  (1, 'Couture copte', 8, 45.00, '{"niveau":"initiation"}', x'0102030405060708', '2026-03-04 09:12:00'),
  (1, 'Dos carré collé', 10, 38.50, null, null, '2026-03-05 14:02:00'),
  (2, 'Trame et cadre', 6, 52.75, '{"niveau":"avance"}', x'0807060504030201', '2026-03-07 08:44:00'),
  (3, 'Pointe sèche', 4, 61.20, null, null, '2026-03-09 17:20:00');

insert into journal_myisam (message) values ('démarrage'), ('arrêt');

analyze table ateliers, seances, listes_attente;
