-- =====================================================================
-- AI Investigator — Veritabanı Şeması v1
-- =====================================================================

-- pgcrypto: gen_random_uuid() için
create extension if not exists "pgcrypto";

-- =====================================================================
-- 1) officers — Polis kullanıcıları
-- =====================================================================
create table if not exists officers (
  id            uuid primary key default gen_random_uuid(),
  badge_id      text unique not null,
  password_hash text not null,
  full_name     text not null,
  created_at    timestamptz not null default now()
);

create index if not exists officers_badge_id_idx on officers (badge_id);

-- =====================================================================
-- 2) cases — Vakalar
-- =====================================================================
create table if not exists cases (
  id                  uuid primary key default gen_random_uuid(),
  case_code           text unique not null,
  officer_id          uuid not null references officers(id) on delete cascade,
  suspect_tc          text not null check (suspect_tc ~ '^[0-9]{11}$'),
  suspect_name        text not null,
  suspect_surname     text not null,
  suspect_age         integer not null check (suspect_age between 1 and 150),
  suspect_gender      text not null check (suspect_gender in ('erkek','kadın')),
  suspect_photo_url   text,
  crime_type          text not null,
  initial_statement   text not null,
  crime_scene_notes   text not null,
  status              text not null default 'open' check (status in ('open','closed')),
  created_at          timestamptz not null default now()
);

create index if not exists cases_officer_id_idx on cases (officer_id);
create index if not exists cases_status_idx on cases (status);
create index if not exists cases_case_code_idx on cases (case_code);

-- =====================================================================
-- 3) sessions — Sorgu seansları
-- =====================================================================
create table if not exists sessions (
  id                    uuid primary key default gen_random_uuid(),
  case_id               uuid not null references cases(id) on delete cascade,
  contradiction_score   real not null default 0 check (contradiction_score between 0 and 100),
  avoidance_score       real not null default 0 check (avoidance_score between 0 and 100),
  stress_score          real not null default 0 check (stress_score between 0 and 100),
  inconsistency_score   real not null default 0 check (inconsistency_score between 0 and 100),
  current_phase         text not null default 'opening'
                        check (current_phase in ('opening','story_locking','evidence_pressure','confession_approach')),
  active_tactic         text,
  strategic_plan        jsonb,
  question_count        integer not null default 0,
  questions_in_phase    integer not null default 0,
  created_at            timestamptz not null default now()
);

create index if not exists sessions_case_id_idx on sessions (case_id);

-- =====================================================================
-- 4) messages — Soru/Cevap mesajları
-- =====================================================================
create table if not exists messages (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null references sessions(id) on delete cascade,
  sequence_no           integer not null,
  move_type             text not null check (move_type in ('question','statement','empathy','bluff','silence_prompt')),
  tactic_used           text,
  question              text not null,
  answer                text,
  answer_audio_url      text,
  body_language_input   jsonb,
  voice_tone_input      jsonb,
  signal_interpretation jsonb,
  analysis_notes        jsonb,
  metrics_before        jsonb,
  metrics_after         jsonb,

  -- Adaptif ağırlık takibi için (kararımız gereği eklendi)
  ai_stress_input       real,
  police_stress_input   real,

  created_at            timestamptz not null default now(),
  unique (session_id, sequence_no)
);

create index if not exists messages_session_id_idx on messages (session_id);
create index if not exists messages_session_seq_idx on messages (session_id, sequence_no);

-- =====================================================================
-- 5) survey_responses — Sorgu sonu anket
-- =====================================================================
create table if not exists survey_responses (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null unique references sessions(id) on delete cascade,
  responses   jsonb not null,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- 6) tactic_performance — Taktik etkinlik skorları
-- =====================================================================
create table if not exists tactic_performance (
  id              uuid primary key default gen_random_uuid(),
  tactic_id       text not null,
  score           real not null check (score between -100 and 100),
  session_id      uuid not null references sessions(id) on delete cascade,
  message_id      uuid references messages(id) on delete set null,

  -- Adaptif ağırlık takibi için (kararımız gereği eklendi)
  dominant_source text check (dominant_source in ('ai','police')),
  ai_input        real,
  police_input    real,

  created_at      timestamptz not null default now()
);

create index if not exists tactic_performance_tactic_idx on tactic_performance (tactic_id);
create index if not exists tactic_performance_session_idx on tactic_performance (session_id);

-- =====================================================================
-- 7) adaptive_weights — Seans arası öğrenen ağırlık tablosu (yeni)
-- =====================================================================
create table if not exists adaptive_weights (
  id            uuid primary key default gen_random_uuid(),
  ai_weight     real not null default 0.5 check (ai_weight between 0.25 and 0.75),
  police_weight real not null default 0.5 check (police_weight between 0.25 and 0.75),
  session_count integer not null default 0,
  trigger_session uuid references sessions(id) on delete set null,
  trigger_tactic_score real,
  updated_at    timestamptz not null default now()
);

create index if not exists adaptive_weights_updated_at_idx on adaptive_weights (updated_at desc);

-- Sistem ilk başlatıldığında varsayılan satırı oluştur
insert into adaptive_weights (ai_weight, police_weight, session_count)
select 0.5, 0.5, 0
where not exists (select 1 from adaptive_weights);

-- =====================================================================
-- RLS — Edge Function'lar service_role ile çalıştığı için RLS kapalı
-- (Üniversite araştırma projesi olduğu için minimal güvenlik)
-- =====================================================================
alter table officers           disable row level security;
alter table cases              disable row level security;
alter table sessions           disable row level security;
alter table messages           disable row level security;
alter table survey_responses   disable row level security;
alter table tactic_performance disable row level security;
alter table adaptive_weights   disable row level security;

-- =====================================================================
-- Storage Bucket'ları — Edge Function veya Dashboard üzerinden açılır
-- =====================================================================
-- "suspect-photos"  : public read, authenticated write
-- "answer-audio"    : private (Edge Function üzerinden okunur)
--
-- Uygulama custom JWT kullandığı için Supabase Storage RLS'i her zaman
-- anon rolü görür. Bucket'lar zaten private — sadece yazma izni veriyoruz.
create policy "allow_anon_audio_upload"
on storage.objects for insert to anon
with check (bucket_id = 'answer-audio');

create policy "allow_anon_photo_upload"
on storage.objects for insert to anon
with check (bucket_id = 'suspect-photos');

create policy "allow_anon_photo_read"
on storage.objects for select to anon
using (bucket_id = 'suspect-photos');
