-- ============================================================================
-- PacePath Supabase Schema & Idempotent Migration
-- Safe to re-run: uses "if not exists", "add column if not exists",
-- and "create or replace function".
-- ============================================================================

-- 1. Extensions
create extension if not exists pgcrypto with schema extensions;

-- 2. Core Tables

create table if not exists classes (
  code text primary key,
  name text not null,
  teacher_name text not null default '',
  grade int not null default 8,
  pin_hash text not null, -- stored via extensions.crypt(p_pin, extensions.gen_salt('bf'))
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- Safe migration for existing classes tables
alter table classes add column if not exists teacher_name text not null default '';
alter table classes add column if not exists grade int not null default 8;

create table if not exists students (
  id text primary key,
  name text not null,
  name_key text,
  grade int not null,
  avatar text not null,
  class_code text references classes(code) on delete set null,
  pin_hash text,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- Safe migration for existing students tables
alter table students add column if not exists name_key text;
alter table students add column if not exists pin_hash text;

update students set name_key = lower(trim(name)) where name_key is null and name is not null;

create index if not exists idx_students_class_code on students(class_code);
create unique index if not exists idx_students_class_name_key on students(class_code, name_key) where class_code is not null;

create table if not exists sessions (
  id text primary key,
  student_id text not null references students(id) on delete cascade,
  started_at bigint not null,
  ended_at bigint,
  active_seconds int default 0
);

create index if not exists idx_sessions_student on sessions(student_id);

create table if not exists attempts (
  id text primary key,
  student_id text not null references students(id) on delete cascade,
  session_id text not null references sessions(id) on delete cascade,
  question_id text not null,
  concept_id text not null,
  correct boolean not null,
  chosen_index int,
  user_answer text,
  mistake_tag text,
  hints_used int default 0,
  time_taken_ms int not null,
  confidence text not null,
  attempt_type text not null,
  attempted_at bigint not null
);

-- Safe migration if column timestamp was previously created in attempts
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_name = 'attempts' and column_name = 'timestamp'
  ) then
    alter table attempts rename column "timestamp" to attempted_at;
  end if;
end $$;

alter table attempts add column if not exists attempted_at bigint;

create index if not exists idx_attempts_student on attempts(student_id);
create index if not exists idx_attempts_concept on attempts(concept_id);
create index if not exists idx_attempts_session on attempts(session_id);
create index if not exists idx_attempts_attempted_at on attempts(attempted_at desc);

create table if not exists gap_reports (
  id text primary key,
  student_id text not null references students(id) on delete cascade,
  target_concept_id text not null,
  root_cause_concept_id text not null,
  confidence numeric not null,
  prereq_chain text[] not null,
  status text not null default 'active',
  created_at bigint not null
);

create index if not exists idx_gap_reports_student on gap_reports(student_id);

create table if not exists misconception_events (
  id text primary key,
  student_id text not null references students(id) on delete cascade,
  misconception_id text not null,
  question_id text not null,
  attempt_id text not null references attempts(id) on delete cascade,
  confidence numeric not null,
  divergence_step int,
  student_confirmed boolean,
  source text not null check (source in ('rule', 'student_confirmed', 'llm')),
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists idx_misconception_events_student on misconception_events(student_id);
create index if not exists idx_misconception_events_misc on misconception_events(misconception_id);
create index if not exists idx_misconception_events_created on misconception_events(created_at desc);

-- 3. Row Level Security (RLS)
-- Anon has NO direct table SELECT. All reads and batch mutations are mediated
-- by authenticated SECURITY DEFINER RPCs.

alter table classes enable row level security;
alter table students enable row level security;
alter table sessions enable row level security;
alter table attempts enable row level security;
alter table gap_reports enable row level security;
alter table misconception_events enable row level security;

-- Drop legacy permissive policies if present
drop policy if exists "Allow read classes" on classes;
drop policy if exists "Allow read students" on students;
drop policy if exists "Allow read sessions" on sessions;
drop policy if exists "Allow read attempts" on attempts;
drop policy if exists "Allow read gap_reports" on gap_reports;
drop policy if exists "Allow read misconception_events" on misconception_events;

-- ============================================================================
-- 4. SECURITY DEFINER RPC: sync_batch(p_payload jsonb)
-- Batch upserts students, sessions, attempts, gap_reports, and misconception_events.
-- Idempotent by id. Rejects rows whose class_code does not exist (null class_code allowed).
-- ============================================================================

create or replace function sync_batch(p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_student jsonb;
  v_session jsonb;
  v_attempt jsonb;
  v_gap jsonb;
  v_event jsonb;
  v_students_count int := 0;
  v_sessions_count int := 0;
  v_attempts_count int := 0;
  v_gaps_count int := 0;
  v_events_count int := 0;
  v_rejected_students int := 0;
  v_class_code text;
begin
  -- 1. Students Upsert
  if p_payload ? 'students' then
    for v_student in select * from jsonb_array_elements(p_payload->'students')
    loop
      v_class_code := nullif(trim(v_student->>'class_code'), '');
      
      -- Reject student if class_code is provided but does not exist
      if v_class_code is not null and not exists (select 1 from classes where code = v_class_code) then
        v_rejected_students := v_rejected_students + 1;
      else
        insert into students (id, name, name_key, grade, avatar, class_code, pin_hash, created_at)
        values (
          v_student->>'id',
          v_student->>'name',
          coalesce(v_student->>'name_key', lower(trim(v_student->>'name'))),
          (v_student->>'grade')::int,
          v_student->>'avatar',
          v_class_code,
          v_student->>'pin_hash',
          (v_student->>'created_at')::bigint
        )
        on conflict (id) do update set
          name = excluded.name,
          name_key = excluded.name_key,
          grade = excluded.grade,
          avatar = excluded.avatar,
          class_code = excluded.class_code;
        
        v_students_count := v_students_count + 1;
      end if;
    end loop;
  end if;

  -- 2. Sessions Upsert
  if p_payload ? 'sessions' then
    for v_session in select * from jsonb_array_elements(p_payload->'sessions')
    loop
      insert into sessions (id, student_id, started_at, ended_at, active_seconds)
      values (
        v_session->>'id',
        v_session->>'student_id',
        (v_session->>'started_at')::bigint,
        (v_session->>'ended_at')::bigint,
        coalesce((v_session->>'active_seconds')::int, 0)
      )
      on conflict (id) do update set
        ended_at = excluded.ended_at,
        active_seconds = excluded.active_seconds;
      
      v_sessions_count := v_sessions_count + 1;
    end loop;
  end if;

  -- 3. Attempts Upsert
  if p_payload ? 'attempts' then
    for v_attempt in select * from jsonb_array_elements(p_payload->'attempts')
    loop
      insert into attempts (
        id, student_id, session_id, question_id, concept_id, correct,
        chosen_index, user_answer, mistake_tag, hints_used, time_taken_ms,
        confidence, attempt_type, attempted_at
      )
      values (
        v_attempt->>'id',
        v_attempt->>'student_id',
        v_attempt->>'session_id',
        v_attempt->>'question_id',
        v_attempt->>'concept_id',
        (v_attempt->>'correct')::boolean,
        (v_attempt->>'chosen_index')::int,
        v_attempt->>'user_answer',
        v_attempt->>'mistake_tag',
        coalesce((v_attempt->>'hints_used')::int, 0),
        (v_attempt->>'time_taken_ms')::int,
        v_attempt->>'confidence',
        v_attempt->>'attempt_type',
        coalesce(
          (v_attempt->>'attempted_at')::bigint,
          (v_attempt->>'timestamp')::bigint
        )
      )
      on conflict (id) do update set
        user_answer = excluded.user_answer,
        mistake_tag = excluded.mistake_tag,
        hints_used = excluded.hints_used;
      
      v_attempts_count := v_attempts_count + 1;
    end loop;
  end if;

  -- 4. Gap Reports Upsert
  if p_payload ? 'gap_reports' then
    for v_gap in select * from jsonb_array_elements(p_payload->'gap_reports')
    loop
      insert into gap_reports (
        id, student_id, target_concept_id, root_cause_concept_id,
        confidence, prereq_chain, status, created_at
      )
      values (
        v_gap->>'id',
        v_gap->>'student_id',
        v_gap->>'target_concept_id',
        v_gap->>'root_cause_concept_id',
        (v_gap->>'confidence')::numeric,
        (select array_agg(x::text) from jsonb_array_elements_text(v_gap->'prereq_chain') t(x)),
        coalesce(v_gap->>'status', 'active'),
        (v_gap->>'created_at')::bigint
      )
      on conflict (id) do update set
        status = excluded.status;
      
      v_gaps_count := v_gaps_count + 1;
    end loop;
  end if;

  -- 5. Misconception Events Upsert
  if p_payload ? 'misconception_events' then
    for v_event in select * from jsonb_array_elements(p_payload->'misconception_events')
    loop
      insert into misconception_events (
        id, student_id, misconception_id, question_id, attempt_id,
        confidence, divergence_step, student_confirmed, source, created_at
      )
      values (
        v_event->>'id',
        v_event->>'student_id',
        v_event->>'misconception_id',
        v_event->>'question_id',
        v_event->>'attempt_id',
        (v_event->>'confidence')::numeric,
        (v_event->>'divergence_step')::int,
        (v_event->>'student_confirmed')::boolean,
        v_event->>'source',
        (v_event->>'created_at')::bigint
      )
      on conflict (id) do update set
        student_confirmed = excluded.student_confirmed,
        source = excluded.source;
      
      v_events_count := v_events_count + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'success', true,
    'synced_counts', jsonb_build_object(
      'students', v_students_count,
      'sessions', v_sessions_count,
      'attempts', v_attempts_count,
      'gap_reports', v_gaps_count,
      'misconception_events', v_events_count,
      'rejected_students', v_rejected_students
    )
  );
end;
$$;

-- ============================================================================
-- 5. Class Management RPCs
-- ============================================================================

/**
 * create_class(p_name text, p_teacher_name text, p_pin text, p_grade int)
 * Generates a unique code like "MATH-7K2P" retrying on collision until unique.
 * Stores pin_hash using extensions.crypt and extensions.gen_salt('bf').
 */
create or replace function create_class(
  p_name text,
  p_teacher_name text,
  p_pin text,
  p_grade int default 8
)
returns text
language plpgsql
security definer
as $$
declare
  v_code text;
  v_chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_pin_hash text;
  v_done boolean := false;
  v_i int;
  v_suffix text;
begin
  if length(trim(p_name)) = 0 then
    raise exception 'Class name cannot be empty';
  end if;
  if length(trim(p_teacher_name)) = 0 then
    raise exception 'Teacher name cannot be empty';
  end if;
  if length(trim(p_pin)) < 4 or length(trim(p_pin)) > 6 then
    raise exception 'PIN must be between 4 and 6 digits';
  end if;

  v_pin_hash := extensions.crypt(trim(p_pin), extensions.gen_salt('bf'));

  -- Loop until unique code generated
  while not v_done loop
    v_suffix := '';
    for v_i in 1..4 loop
      v_suffix := v_suffix || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    end loop;

    v_code := 'MATH-' || v_suffix;

    if not exists (select 1 from classes where code = v_code) then
      insert into classes (code, name, teacher_name, grade, pin_hash)
      values (v_code, trim(p_name), trim(p_teacher_name), coalesce(p_grade, 8), v_pin_hash);
      v_done := true;
    end if;
  end loop;

  return v_code;
end;
$$;

/**
 * class_exists(p_code text)
 * Checks if a class code exists (used during student onboarding).
 */
create or replace function class_exists(p_code text)
returns boolean
language plpgsql
security definer
as $$
begin
  return exists (
    select 1 from classes
    where code = upper(trim(coalesce(p_code, '')))
  );
end;
$$;

-- ============================================================================
-- 6. Teacher Read RPCs (PIN Protected via extensions.crypt)
-- ============================================================================

create or replace function get_class_students(
  p_class_code text,
  p_pin text
)
returns table (
  id text,
  name text,
  grade int,
  avatar text,
  class_code text,
  created_at bigint
)
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from classes
    where code = upper(trim(p_class_code))
      and pin_hash = extensions.crypt(trim(p_pin), pin_hash)
  ) then
    raise exception 'Invalid class code or teacher PIN' using errcode = 'P0001';
  end if;

  return query
  select s.id, s.name, s.grade, s.avatar, s.class_code, s.created_at
  from students s
  where s.class_code = upper(trim(p_class_code))
  order by s.created_at desc;
end;
$$;

create or replace function get_class_sessions(
  p_class_code text,
  p_pin text
)
returns table (
  id text,
  student_id text,
  started_at bigint,
  ended_at bigint,
  active_seconds int
)
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from classes
    where code = upper(trim(p_class_code))
      and pin_hash = extensions.crypt(trim(p_pin), pin_hash)
  ) then
    raise exception 'Invalid class code or teacher PIN' using errcode = 'P0001';
  end if;

  return query
  select ses.id, ses.student_id, ses.started_at, ses.ended_at, ses.active_seconds
  from sessions ses
  inner join students s on s.id = ses.student_id
  where s.class_code = upper(trim(p_class_code));
end;
$$;

create or replace function get_class_attempts(
  p_class_code text,
  p_pin text
)
returns table (
  id text,
  student_id text,
  session_id text,
  question_id text,
  concept_id text,
  correct boolean,
  chosen_index int,
  user_answer text,
  mistake_tag text,
  hints_used int,
  time_taken_ms int,
  confidence text,
  attempt_type text,
  attempted_at bigint
)
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from classes
    where code = upper(trim(p_class_code))
      and pin_hash = extensions.crypt(trim(p_pin), pin_hash)
  ) then
    raise exception 'Invalid class code or teacher PIN' using errcode = 'P0001';
  end if;

  return query
  select
    a.id, a.student_id, a.session_id, a.question_id, a.concept_id, a.correct,
    a.chosen_index, a.user_answer, a.mistake_tag, a.hints_used, a.time_taken_ms,
    a.confidence, a.attempt_type, a.attempted_at
  from attempts a
  inner join students s on s.id = a.student_id
  where s.class_code = upper(trim(p_class_code))
  order by a.attempted_at asc;
end;
$$;

create or replace function get_class_gap_reports(
  p_class_code text,
  p_pin text
)
returns table (
  id text,
  student_id text,
  target_concept_id text,
  root_cause_concept_id text,
  confidence numeric,
  prereq_chain text[],
  status text,
  created_at bigint
)
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from classes
    where code = upper(trim(p_class_code))
      and pin_hash = extensions.crypt(trim(p_pin), pin_hash)
  ) then
    raise exception 'Invalid class code or teacher PIN' using errcode = 'P0001';
  end if;

  return query
  select
    g.id, g.student_id, g.target_concept_id, g.root_cause_concept_id,
    g.confidence, g.prereq_chain, g.status, g.created_at
  from gap_reports g
  inner join students s on s.id = g.student_id
  where s.class_code = upper(trim(p_class_code));
end;
$$;

create or replace function get_class_misconception_summary(
  p_class_code text,
  p_pin text
)
returns table (
  misconception_id text,
  distinct_students bigint,
  total_events bigint,
  student_ids text[],
  is_alert boolean
)
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from classes
    where code = upper(trim(p_class_code))
      and pin_hash = extensions.crypt(trim(p_pin), pin_hash)
  ) then
    raise exception 'Invalid class code or teacher PIN' using errcode = 'P0001';
  end if;

  return query
  select
    me.misconception_id,
    count(distinct me.student_id) as distinct_students,
    count(me.id) as total_events,
    array_agg(distinct me.student_id) as student_ids,
    (count(distinct me.student_id) >= 3 and count(me.id) >= 5) as is_alert
  from misconception_events me
  inner join students s on s.id = me.student_id
  where s.class_code = upper(trim(p_class_code))
  group by me.misconception_id
  order by total_events desc, distinct_students desc;
end;
$$;

create or replace function get_class_misconception_details(
  p_class_code text,
  p_pin text,
  p_misconception_id text default null
)
returns table (
  id text,
  student_id text,
  student_name text,
  student_avatar text,
  student_grade int,
  misconception_id text,
  question_id text,
  attempt_id text,
  confidence numeric,
  divergence_step int,
  student_confirmed boolean,
  source text,
  created_at bigint
)
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from classes
    where code = upper(trim(p_class_code))
      and pin_hash = extensions.crypt(trim(p_pin), pin_hash)
  ) then
    raise exception 'Invalid class code or teacher PIN' using errcode = 'P0001';
  end if;

  return query
  select
    me.id,
    me.student_id,
    s.name as student_name,
    s.avatar as student_avatar,
    s.grade as student_grade,
    me.misconception_id,
    me.question_id,
    me.attempt_id,
    me.confidence,
    me.divergence_step,
    me.student_confirmed,
    me.source,
    me.created_at
  from misconception_events me
  inner join students s on s.id = me.student_id
  where s.class_code = upper(trim(p_class_code))
    and (p_misconception_id is null or me.misconception_id = p_misconception_id)
  order by me.created_at desc;
end;
$$;


-- ============================================================================
-- 7. Student Auth & Class Join RPCs (PIN Protected via extensions.crypt)
-- ============================================================================

/**
 * get_class_info(p_code text)
 * Returns public class name, teacher name and grade so student can confirm class.
 */
create or replace function get_class_info(p_code text)
returns table (
  code text,
  name text,
  teacher_name text,
  grade int
)
language plpgsql
security definer
as $$
begin
  return query
  select c.code, c.name, c.teacher_name, c.grade
  from classes c
  where c.code = upper(trim(coalesce(p_code, '')));
end;
$$;

/**
 * student_join(p_class_code, p_name, p_grade, p_avatar, p_pin, p_student_id)
 * Registers student to class if name_key is available.
 */
create or replace function student_join(
  p_class_code text,
  p_name text,
  p_grade int default 7,
  p_avatar text default '🦁',
  p_pin text default '',
  p_student_id text default null
)
returns table (
  id text,
  name text,
  grade int,
  avatar text,
  class_code text,
  created_at bigint
)
language plpgsql
security definer
as $$
declare
  v_class_code text;
  v_name text;
  v_name_key text;
  v_pin_hash text;
  v_id text;
  v_grade int;
  v_avatar text;
  v_created_at bigint;
begin
  v_class_code := upper(trim(coalesce(p_class_code, '')));
  v_name := trim(coalesce(p_name, ''));
  v_name_key := lower(v_name);

  if length(v_name) = 0 then
    raise exception 'Name cannot be empty';
  end if;
  if not exists (select 1 from classes where code = v_class_code) then
    raise exception 'Class code % not found', v_class_code;
  end if;

  if exists (select 1 from students where class_code = v_class_code and name_key = v_name_key) then
    raise exception 'This name is already taken in this class, try Log back in' using errcode = 'P0002';
  end if;

  v_id := coalesce(p_student_id, gen_random_uuid()::text);
  v_grade := coalesce(p_grade, 7);
  v_avatar := coalesce(nullif(p_avatar, ''), '🦁');
  v_created_at := (extract(epoch from now()) * 1000)::bigint;

  if length(trim(coalesce(p_pin, ''))) > 0 then
    v_pin_hash := extensions.crypt(trim(p_pin), extensions.gen_salt('bf'));
  else
    v_pin_hash := null;
  end if;

  insert into students (id, name, name_key, grade, avatar, class_code, pin_hash, created_at)
  values (v_id, v_name, v_name_key, v_grade, v_avatar, v_class_code, v_pin_hash, v_created_at);

  return query select v_id, v_name, v_grade, v_avatar, v_class_code, v_created_at;
end;
$$;

-- ============================================================================
-- Security Note: A 4-digit PIN with server-side rate-limiting (max 10 failed
-- attempts per hour per class code + student) is hackathon-level security
-- suitable for classroom devices.
-- ============================================================================

create table if not exists student_login_attempts (
  id text primary key,
  class_code text not null,
  name_key text not null,
  attempted_at bigint not null,
  success boolean not null default false
);

create index if not exists idx_login_attempts_lookup 
  on student_login_attempts(class_code, name_key, attempted_at desc);

alter table student_login_attempts enable row level security;

/**
 * student_login(p_class_code, p_name, p_pin)
 * Verifies PIN and returns student row.
 * Enforces server-side rate-limiting: max 10 failed attempts per hour per class code + name.
 */
create or replace function student_login(
  p_class_code text,
  p_name text,
  p_pin text
)
returns table (
  id text,
  name text,
  grade int,
  avatar text,
  class_code text,
  created_at bigint
)
language plpgsql
security definer
as $$
declare
  v_class_code text;
  v_name_key text;
  v_id text;
  v_name text;
  v_grade int;
  v_avatar text;
  v_pin_hash text;
  v_created_at bigint;
  v_failed_count int;
  v_now bigint;
begin
  v_class_code := upper(trim(coalesce(p_class_code, '')));
  v_name_key := lower(trim(coalesce(p_name, '')));
  v_now := (extract(epoch from now()) * 1000)::bigint;

  if not exists (select 1 from classes where code = v_class_code) then
    raise exception 'Class code % not found', v_class_code;
  end if;

  -- 1. Server-side Rate Limit Check: max 10 failed attempts in the last 1 hour
  select count(*) into v_failed_count
  from student_login_attempts
  where class_code = v_class_code
    and name_key = v_name_key
    and attempted_at >= (v_now - 3600000)
    and success = false;

  if v_failed_count >= 10 then
    raise exception 'Too many failed login attempts. Account temporarily locked for 1 hour.' using errcode = 'P0004';
  end if;

  select s.id, s.name, s.grade, s.avatar, s.pin_hash, s.created_at
  into v_id, v_name, v_grade, v_avatar, v_pin_hash, v_created_at
  from students s
  where s.class_code = v_class_code and s.name_key = v_name_key;

  if not found then
    raise exception 'Student not found with this name in this class' using errcode = 'P0003';
  end if;

  if v_pin_hash is not null and v_pin_hash != extensions.crypt(trim(p_pin), v_pin_hash) then
    -- Record failed attempt on the server
    insert into student_login_attempts (id, class_code, name_key, attempted_at, success)
    values (gen_random_uuid()::text, v_class_code, v_name_key, v_now, false);

    raise exception 'Invalid PIN' using errcode = 'P0001';
  end if;

  -- Record successful attempt on the server
  insert into student_login_attempts (id, class_code, name_key, attempted_at, success)
  values (gen_random_uuid()::text, v_class_code, v_name_key, v_now, true);

  return query select v_id, v_name, v_grade, v_avatar, v_class_code, v_created_at;
end;
$$;

/**
 * get_my_history(p_class_code, p_student_id, p_pin)
 * Fetches all historical student records (sessions, attempts, gaps, misconceptions)
 * so student can seamlessly continue on another device.
 * Rate-limited server-side to prevent PIN brute-forcing.
 */
create or replace function get_my_history(
  p_class_code text,
  p_student_id text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_class_code text;
  v_name_key text;
  v_pin_hash text;
  v_failed_count int;
  v_now bigint;
  v_student jsonb;
  v_sessions jsonb;
  v_attempts jsonb;
  v_gaps jsonb;
  v_events jsonb;
begin
  v_class_code := upper(trim(coalesce(p_class_code, '')));
  v_now := (extract(epoch from now()) * 1000)::bigint;

  select pin_hash, name_key into v_pin_hash, v_name_key
  from students
  where id = p_student_id and class_code = v_class_code;

  if not found then
    raise exception 'Student not found in this class' using errcode = 'P0003';
  end if;

  -- Server-side rate limit check (10 failures/hr)
  select count(*) into v_failed_count
  from student_login_attempts
  where class_code = v_class_code
    and name_key = v_name_key
    and attempted_at >= (v_now - 3600000)
    and success = false;

  if v_failed_count >= 10 then
    raise exception 'Too many failed attempts. Temporarily locked for 1 hour.' using errcode = 'P0004';
  end if;

  if v_pin_hash is not null and v_pin_hash != extensions.crypt(trim(p_pin), v_pin_hash) then
    insert into student_login_attempts (id, class_code, name_key, attempted_at, success)
    values (gen_random_uuid()::text, v_class_code, v_name_key, v_now, false);

    raise exception 'Invalid PIN' using errcode = 'P0001';
  end if;

  select to_jsonb(s) into v_student
  from students s where s.id = p_student_id;

  select coalesce(jsonb_agg(to_jsonb(ses)), '[]'::jsonb) into v_sessions
  from sessions ses where ses.student_id = p_student_id;

  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_attempts
  from attempts a where a.student_id = p_student_id;

  select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) into v_gaps
  from gap_reports g where g.student_id = p_student_id;

  select coalesce(jsonb_agg(to_jsonb(me)), '[]'::jsonb) into v_events
  from misconception_events me where me.student_id = p_student_id;

  return jsonb_build_object(
    'student', v_student,
    'sessions', v_sessions,
    'attempts', v_attempts,
    'gap_reports', v_gaps,
    'misconception_events', v_events
  );
end;
$$;

-- ============================================================================
-- PART B: TESTS AND ASSIGNMENTS SCHEMA & RPCS
-- ============================================================================

create table if not exists assignments (
  id text primary key,
  class_code text not null references classes(code) on delete cascade,
  title text not null,
  description text,
  question_ids text[] not null default '{}',
  custom_questions jsonb not null default '[]'::jsonb,
  time_limit_minutes int,
  due_date bigint,
  is_closed boolean not null default false,
  closed_at bigint,
  show_answers_after text not null default 'submit',
  created_at bigint not null
);

-- Migration safety for existing assignments table
alter table assignments add column if not exists closed_at bigint;
alter table assignments add column if not exists show_answers_after text not null default 'submit';

create index if not exists idx_assignments_class on assignments(class_code, created_at desc);
alter table assignments enable row level security;

create table if not exists assignment_submissions (
  id text primary key,
  assignment_id text not null references assignments(id) on delete cascade,
  student_id text not null references students(id) on delete cascade,
  class_code text not null,
  answers jsonb not null default '{}'::jsonb,
  score numeric not null default 0,
  total_questions int not null default 0,
  is_late boolean not null default false,
  submitted_at bigint not null,
  constraint uq_assignment_student unique (assignment_id, student_id)
);

create index if not exists idx_submissions_assignment on assignment_submissions(assignment_id);
create index if not exists idx_submissions_student on assignment_submissions(student_id);
create index if not exists idx_submissions_class on assignment_submissions(class_code);
alter table assignment_submissions enable row level security;

/**
 * create_assignment(p_class_code, p_pin, p_assignment)
 * Teacher creates or edits an assignment. Requires valid teacher PIN.
 */
create or replace function create_assignment(
  p_class_code text,
  p_pin text,
  p_assignment jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_class_code text;
  v_stored_hash text;
  v_id text;
  v_title text;
  v_desc text;
  v_question_ids text[];
  v_custom_q jsonb;
  v_time_limit int;
  v_due_date bigint;
  v_created_at bigint;
  v_result jsonb;
begin
  v_class_code := upper(trim(coalesce(p_class_code, '')));
  select pin_hash into v_stored_hash from classes where code = v_class_code;
  if not found or v_stored_hash is null or v_stored_hash != extensions.crypt(trim(p_pin), v_stored_hash) then
    raise exception 'Invalid class code or teacher PIN' using errcode = 'P0001';
  end if;

  v_id := coalesce(p_assignment->>'id', gen_random_uuid()::text);
  v_title := trim(coalesce(p_assignment->>'title', ''));
  if length(v_title) = 0 then
    raise exception 'Assignment title is required';
  end if;

  v_desc := p_assignment->>'description';
  select array_agg(value::text) into v_question_ids
  from jsonb_array_elements_text(coalesce(p_assignment->'question_ids', '[]'::jsonb));
  v_question_ids := coalesce(v_question_ids, '{}');

  v_custom_q := coalesce(p_assignment->'custom_questions', '[]'::jsonb);
  v_time_limit := (p_assignment->>'time_limit_minutes')::int;
  v_due_date := (p_assignment->>'due_date')::bigint;
  v_created_at := coalesce((p_assignment->>'created_at')::bigint, (extract(epoch from now()) * 1000)::bigint);

  insert into assignments (id, class_code, title, description, question_ids, custom_questions, time_limit_minutes, due_date, is_closed, show_answers_after, created_at)
  values (v_id, v_class_code, v_title, v_desc, v_question_ids, v_custom_q, v_time_limit, v_due_date, false, coalesce(p_assignment->>'show_answers_after', 'submit'), v_created_at)
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    question_ids = excluded.question_ids,
    custom_questions = excluded.custom_questions,
    time_limit_minutes = excluded.time_limit_minutes,
    due_date = excluded.due_date,
    show_answers_after = excluded.show_answers_after;

  select to_jsonb(a) into v_result from assignments a where a.id = v_id;
  return v_result;
end;
$$;

/**
 * close_assignment(p_class_code, p_pin, p_assignment_id)
 * Closes an assignment so no further submissions are accepted.
 * Records closed_at timestamp for offline submission validation.
 */
create or replace function close_assignment(
  p_class_code text,
  p_pin text,
  p_assignment_id text
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_class_code text;
  v_stored_hash text;
  v_now bigint;
begin
  v_class_code := upper(trim(coalesce(p_class_code, '')));
  select pin_hash into v_stored_hash from classes where code = v_class_code;
  if not found or v_stored_hash is null or v_stored_hash != extensions.crypt(trim(p_pin), v_stored_hash) then
    raise exception 'Invalid class code or teacher PIN' using errcode = 'P0001';
  end if;

  v_now := (extract(epoch from now()) * 1000)::bigint;

  update assignments
  set is_closed = true,
      closed_at = coalesce(closed_at, v_now)
  where id = p_assignment_id and class_code = v_class_code;

  return true;
end;
$$;

/**
 * submit_assignment(p_assignment_id, p_student_id, p_class_code, p_answers, p_client_submission_id, p_submitted_at)
 * Idempotently saves a student's submission.
 * - Enforces class membership: verifies student belongs to class_code and assignment belongs to class.
 * - Idempotent: returns existing row if already submitted; retries will not duplicate or alter accepted score.
 * - Evaluates closed and late status using client-side submitted_at.
 * - Submissions made before assignment closed_at are accepted even if synced after close.
 * - Rejects only submissions whose client timestamp was after closed_at, or in the future (>60s skew).
 * - Recomputes score on the server for custom teacher questions.
 */
create or replace function submit_assignment(
  p_assignment_id text,
  p_student_id text,
  p_class_code text,
  p_answers jsonb,
  p_client_submission_id text default null,
  p_submitted_at bigint default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_class_code text;
  v_assignment record;
  v_existing record;
  v_student record;
  v_sub_id text;
  v_server_now bigint;
  v_submitted_at bigint;
  v_is_late boolean;
  v_custom_q jsonb;
  v_elem jsonb;
  v_q_id text;
  v_correct_idx int;
  v_student_ans text;
  v_correct_cnt int := 0;
  v_total_cnt int := 0;
  v_score numeric := 0;
  v_bank_q_ids text[];
begin
  v_class_code := upper(trim(coalesce(p_class_code, '')));
  v_server_now := (extract(epoch from now()) * 1000)::bigint;
  v_submitted_at := coalesce(p_submitted_at, v_server_now);

  -- 1. Idempotency Check: if already submitted, return existing submission without altering
  select * into v_existing
  from assignment_submissions
  where assignment_id = p_assignment_id and student_id = p_student_id;

  if found then
    return to_jsonb(v_existing);
  end if;

  -- 2. Verify student exists and belongs to class
  select * into v_student
  from students
  where id = p_student_id and class_code = v_class_code;

  if not found then
    raise exception 'Student does not belong to this class' using errcode = 'P0007';
  end if;

  -- 3. Lookup assignment and verify class match
  select * into v_assignment from assignments where id = p_assignment_id;
  if not found then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;

  if v_assignment.class_code != v_class_code then
    raise exception 'Assignment does not belong to this class' using errcode = 'P0007';
  end if;

  -- 4. Timestamp skew check: reject timestamps in the future (> 60s tolerance)
  if v_submitted_at > (v_server_now + 60000) then
    raise exception 'Invalid submission timestamp: future timestamp detected' using errcode = 'P0006';
  end if;

  -- 5. Closed Check: accept submission if student submitted before closed_at, reject if submitted at or after
  if v_assignment.is_closed then
    if v_assignment.closed_at is not null and v_submitted_at >= v_assignment.closed_at then
      raise exception 'Assignment is closed: submission made after close time' using errcode = 'P0005';
    elsif v_assignment.closed_at is null then
      raise exception 'Assignment is closed' using errcode = 'P0005';
    end if;
  end if;

  -- 6. Late Check: use client-side submitted_at against assignment due_date
  v_is_late := false;
  if v_assignment.due_date is not null and v_submitted_at > v_assignment.due_date then
    v_is_late := true;
  end if;

  -- 7. Server-Side Score Recomputation
  -- A. Custom teacher-authored questions
  v_custom_q := coalesce(v_assignment.custom_questions, '[]'::jsonb);
  for v_elem in select * from jsonb_array_elements(v_custom_q) loop
    v_total_cnt := v_total_cnt + 1;
    v_q_id := v_elem->>'id';
    v_correct_idx := (v_elem->>'correct_index')::int;
    v_student_ans := p_answers->>v_q_id;
    if v_student_ans is not null and v_student_ans = v_correct_idx::text then
      v_correct_cnt := v_correct_cnt + 1;
    end if;
  end loop;

  -- B. Standard bank questions
  v_bank_q_ids := v_assignment.question_ids;
  if array_length(v_bank_q_ids, 1) is not null then
    for i in 1..array_length(v_bank_q_ids, 1) loop
      v_total_cnt := v_total_cnt + 1;
      v_q_id := v_bank_q_ids[i];
      if p_answers->v_q_id is not null then
        if (p_answers->v_q_id->>'correct')::boolean = true or p_answers->>v_q_id = 'correct' or p_answers->>v_q_id = '1' then
          v_correct_cnt := v_correct_cnt + 1;
        end if;
      end if;
    end loop;
  end if;

  if v_total_cnt > 0 then
    v_score := round(((v_correct_cnt::numeric / v_total_cnt::numeric) * 100), 1);
  else
    v_score := 0;
  end if;

  v_sub_id := coalesce(p_client_submission_id, gen_random_uuid()::text);

  insert into assignment_submissions (
    id, assignment_id, student_id, class_code, answers, score, total_questions, is_late, submitted_at
  ) values (
    v_sub_id, p_assignment_id, p_student_id, v_class_code, p_answers, v_score, v_total_cnt, v_is_late, v_submitted_at
  )
  on conflict (assignment_id, student_id) do nothing;

  select * into v_existing
  from assignment_submissions
  where assignment_id = p_assignment_id and student_id = p_student_id;

  return to_jsonb(v_existing);
end;
$$;

/**
 * get_class_assignments(p_class_code, p_pin)
 * Returns all assignments and submissions for the class. Requires teacher PIN.
 */
create or replace function get_class_assignments(
  p_class_code text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_class_code text;
  v_stored_hash text;
  v_assignments jsonb;
  v_submissions jsonb;
begin
  v_class_code := upper(trim(coalesce(p_class_code, '')));
  select pin_hash into v_stored_hash from classes where code = v_class_code;
  if not found or v_stored_hash is null or v_stored_hash != extensions.crypt(trim(p_pin), v_stored_hash) then
    raise exception 'Invalid class code or teacher PIN' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  into v_assignments
  from assignments a
  where a.class_code = v_class_code;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'assignment_id', s.assignment_id,
      'student_id', s.student_id,
      'student_name', st.name,
      'student_avatar', st.avatar,
      'class_code', s.class_code,
      'answers', s.answers,
      'score', s.score,
      'total_questions', s.total_questions,
      'is_late', s.is_late,
      'submitted_at', s.submitted_at
    ) order by s.submitted_at desc
  ), '[]'::jsonb)
  into v_submissions
  from assignment_submissions s
  join students st on st.id = s.student_id
  where s.class_code = v_class_code;

  return jsonb_build_object(
    'assignments', v_assignments,
    'submissions', v_submissions
  );
end;
$$;

/**
 * get_student_assignments(p_class_code, p_student_id)
 * Returns all assignments for the student's class with their personal submission status.
 * Enforces class membership verification.
 */
create or replace function get_student_assignments(
  p_class_code text,
  p_student_id text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_class_code text;
  v_student record;
  v_result jsonb;
begin
  v_class_code := upper(trim(coalesce(p_class_code, '')));

  -- Verify student belongs to this class
  select * into v_student
  from students
  where id = p_student_id and class_code = v_class_code;

  if not found then
    raise exception 'Student does not belong to this class' using errcode = 'P0007';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'assignment', to_jsonb(a),
      'submission', to_jsonb(s)
    ) order by a.created_at desc
  ), '[]'::jsonb)
  into v_result
  from assignments a
  left join assignment_submissions s on s.assignment_id = a.id and s.student_id = p_student_id
  where a.class_code = v_class_code;

  return v_result;
end;
$$;

-- ============================================================================
-- PART C: DOUBTS AND ANNOUNCEMENTS SCHEMA & RPCS
-- ============================================================================

create table if not exists doubts (
  id text primary key,
  class_code text not null references classes(code) on delete cascade,
  student_id text not null references students(id) on delete cascade,
  question_id text,
  question_title text,
  student_answer text,
  misconception_tag text,
  status text not null default 'open' check (status in ('open', 'answered', 'resolved')),
  created_at bigint not null,
  updated_at bigint not null,
  last_message_at bigint not null
);

create index if not exists idx_doubts_class on doubts(class_code, status, updated_at desc);
create index if not exists idx_doubts_student on doubts(student_id, updated_at desc);
alter table doubts enable row level security;

create table if not exists doubt_messages (
  id text primary key,
  doubt_id text not null references doubts(id) on delete cascade,
  sender_type text not null check (sender_type in ('student', 'teacher')),
  sender_id text not null,
  sender_name text not null,
  content text not null,
  flagged boolean not null default false,
  flag_reason text,
  created_at bigint not null
);

create index if not exists idx_doubt_messages_doubt on doubt_messages(doubt_id, created_at asc);
create index if not exists idx_doubt_messages_sender on doubt_messages(sender_id, created_at desc);
alter table doubt_messages enable row level security;

create table if not exists announcements (
  id text primary key,
  class_code text not null references classes(code) on delete cascade,
  title text not null,
  content text not null,
  created_at bigint not null
);

create index if not exists idx_announcements_class on announcements(class_code, created_at desc);
alter table announcements enable row level security;

/**
 * create_doubt(p_class_code, p_student_id, p_content, p_question_id, p_question_title, p_student_answer, p_misconception_tag, p_doubt_id, p_message_id)
 * Student opens a doubt thread with optional question context.
 * - Enforces class membership.
 * - Rate limit: max 20 messages per hour per student.
 * - Enforces message length: 1 to 500 characters.
 */
create or replace function create_doubt(
  p_class_code text,
  p_student_id text,
  p_content text,
  p_question_id text default null,
  p_question_title text default null,
  p_student_answer text default null,
  p_misconception_tag text default null,
  p_doubt_id text default null,
  p_message_id text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_class_code text;
  v_student record;
  v_doubt_id text;
  v_msg_id text;
  v_now bigint;
  v_one_hour_ago bigint;
  v_msg_count int;
  v_content text;
  v_result jsonb;
begin
  v_class_code := upper(trim(coalesce(p_class_code, '')));
  v_content := trim(coalesce(p_content, ''));

  -- 1. Validate content length (1 - 500 characters)
  if length(v_content) = 0 or length(v_content) > 500 then
    raise exception 'Message must be between 1 and 500 characters' using errcode = 'P0009';
  end if;

  -- 2. Verify student exists and belongs to class
  select * into v_student
  from students
  where id = p_student_id and class_code = v_class_code;

  if not found then
    raise exception 'Student does not belong to this class' using errcode = 'P0007';
  end if;

  -- 3. Rate limit check (max 20 messages per hour per student)
  v_now := (extract(epoch from now()) * 1000)::bigint;
  v_one_hour_ago := v_now - 3600000;
  select count(*) into v_msg_count
  from doubt_messages
  where sender_id = p_student_id and created_at > v_one_hour_ago;

  if v_msg_count >= 20 then
    raise exception 'Rate limit exceeded: maximum 20 messages per hour allowed' using errcode = 'P0008';
  end if;

  v_doubt_id := coalesce(p_doubt_id, gen_random_uuid()::text);
  v_msg_id := coalesce(p_message_id, gen_random_uuid()::text);

  insert into doubts (
    id, class_code, student_id, question_id, question_title, student_answer, misconception_tag, status, created_at, updated_at, last_message_at
  ) values (
    v_doubt_id, v_class_code, p_student_id, p_question_id, p_question_title, p_student_answer, p_misconception_tag, 'open', v_now, v_now, v_now
  );

  insert into doubt_messages (
    id, doubt_id, sender_type, sender_id, sender_name, content, flagged, created_at
  ) values (
    v_msg_id, v_doubt_id, 'student', p_student_id, v_student.name, v_content, false, v_now
  );

  select jsonb_build_object(
    'id', d.id,
    'class_code', d.class_code,
    'student_id', d.student_id,
    'student_name', v_student.name,
    'student_avatar', v_student.avatar,
    'question_id', d.question_id,
    'question_title', d.question_title,
    'student_answer', d.student_answer,
    'misconception_tag', d.misconception_tag,
    'status', d.status,
    'created_at', d.created_at,
    'updated_at', d.updated_at,
    'last_message_at', d.last_message_at,
    'messages', jsonb_build_array(
      jsonb_build_object(
        'id', v_msg_id,
        'doubt_id', v_doubt_id,
        'sender_type', 'student',
        'sender_id', p_student_id,
        'sender_name', v_student.name,
        'content', v_content,
        'flagged', false,
        'created_at', v_now
      )
    )
  ) into v_result
  from doubts d
  where d.id = v_doubt_id;

  return v_result;
end;
$$;

/**
 * add_doubt_message(p_doubt_id, p_student_id, p_content, p_message_id)
 * Student adds a message to an existing doubt thread.
 * - Verifies ownership and class membership.
 * - Rate limit: max 20 messages per hour.
 * - Message length: 1 to 500 characters.
 * - Automatically reopens thread to 'open'.
 */
create or replace function add_doubt_message(
  p_doubt_id text,
  p_student_id text,
  p_content text,
  p_message_id text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_doubt record;
  v_student record;
  v_msg_id text;
  v_now bigint;
  v_one_hour_ago bigint;
  v_msg_count int;
  v_content text;
  v_msg_row record;
begin
  v_content := trim(coalesce(p_content, ''));

  -- 1. Validate content length
  if length(v_content) = 0 or length(v_content) > 500 then
    raise exception 'Message must be between 1 and 500 characters' using errcode = 'P0009';
  end if;

  -- 2. Lookup doubt and verify ownership
  select * into v_doubt from doubts where id = p_doubt_id;
  if not found then
    raise exception 'Doubt not found' using errcode = 'P0002';
  end if;

  if v_doubt.student_id != p_student_id then
    raise exception 'Unauthorized: you can only reply to your own doubts' using errcode = 'P0007';
  end if;

  -- 3. Verify student belongs to doubt class
  select * into v_student from students where id = p_student_id and class_code = v_doubt.class_code;
  if not found then
    raise exception 'Student does not belong to this class' using errcode = 'P0007';
  end if;

  -- 4. Rate limit check (max 20 messages per hour)
  v_now := (extract(epoch from now()) * 1000)::bigint;
  v_one_hour_ago := v_now - 3600000;
  select count(*) into v_msg_count
  from doubt_messages
  where sender_id = p_student_id and created_at > v_one_hour_ago;

  if v_msg_count >= 20 then
    raise exception 'Rate limit exceeded: maximum 20 messages per hour allowed' using errcode = 'P0008';
  end if;

  v_msg_id := coalesce(p_message_id, gen_random_uuid()::text);

  insert into doubt_messages (
    id, doubt_id, sender_type, sender_id, sender_name, content, flagged, created_at
  ) values (
    v_msg_id, p_doubt_id, 'student', p_student_id, v_student.name, v_content, false, v_now
  )
  returning * into v_msg_row;

  -- Reopen doubt status and update timestamp
  update doubts
  set status = 'open',
      updated_at = v_now,
      last_message_at = v_now
  where id = p_doubt_id;

  return to_jsonb(v_msg_row);
end;
$$;

/**
 * get_my_doubts(p_class_code, p_student_id)
 * Fetches all doubts for the student with their chronological message history.
 */
create or replace function get_my_doubts(
  p_class_code text,
  p_student_id text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_class_code text;
  v_student record;
  v_result jsonb;
begin
  v_class_code := upper(trim(coalesce(p_class_code, '')));

  select * into v_student
  from students
  where id = p_student_id and class_code = v_class_code;

  if not found then
    raise exception 'Student does not belong to this class' using errcode = 'P0007';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'class_code', d.class_code,
      'student_id', d.student_id,
      'student_name', v_student.name,
      'student_avatar', v_student.avatar,
      'question_id', d.question_id,
      'question_title', d.question_title,
      'student_answer', d.student_answer,
      'misconception_tag', d.misconception_tag,
      'status', d.status,
      'created_at', d.created_at,
      'updated_at', d.updated_at,
      'last_message_at', d.last_message_at,
      'messages', coalesce((
        select jsonb_agg(to_jsonb(m) order by m.created_at asc)
        from doubt_messages m
        where m.doubt_id = d.id
      ), '[]'::jsonb)
    ) order by d.updated_at desc
  ), '[]'::jsonb)
  into v_result
  from doubts d
  where d.student_id = p_student_id and d.class_code = v_class_code;

  return v_result;
end;
$$;

/**
 * get_announcements(p_class_code, p_student_id)
 * Returns class announcements for student. Verifies class membership.
 */
create or replace function get_announcements(
  p_class_code text,
  p_student_id text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_class_code text;
  v_student record;
  v_result jsonb;
begin
  v_class_code := upper(trim(coalesce(p_class_code, '')));

  select * into v_student
  from students
  where id = p_student_id and class_code = v_class_code;

  if not found then
    raise exception 'Student does not belong to this class' using errcode = 'P0007';
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  into v_result
  from announcements a
  where a.class_code = v_class_code;

  return v_result;
end;
$$;

/**
 * get_class_doubts(p_class_code, p_pin)
 * Teacher inbox: returns all doubts in class with messages and student metadata.
 * Ordered with oldest unanswered ("open") first.
 */
create or replace function get_class_doubts(
  p_class_code text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_class_code text;
  v_stored_hash text;
  v_result jsonb;
begin
  v_class_code := upper(trim(coalesce(p_class_code, '')));
  select pin_hash into v_stored_hash from classes where code = v_class_code;
  if not found or v_stored_hash is null or v_stored_hash != extensions.crypt(trim(p_pin), v_stored_hash) then
    raise exception 'Invalid class code or teacher PIN' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'class_code', d.class_code,
      'student_id', d.student_id,
      'student_name', st.name,
      'student_avatar', st.avatar,
      'question_id', d.question_id,
      'question_title', d.question_title,
      'student_answer', d.student_answer,
      'misconception_tag', d.misconception_tag,
      'status', d.status,
      'created_at', d.created_at,
      'updated_at', d.updated_at,
      'last_message_at', d.last_message_at,
      'messages', coalesce((
        select jsonb_agg(to_jsonb(m) order by m.created_at asc)
        from doubt_messages m
        where m.doubt_id = d.id
      ), '[]'::jsonb)
    )
    order by
      case when d.status = 'open' then 0 when d.status = 'answered' then 1 else 2 end asc,
      case when d.status = 'open' then d.created_at end asc,
      d.updated_at desc
  ), '[]'::jsonb)
  into v_result
  from doubts d
  join students st on st.id = d.student_id
  where d.class_code = v_class_code;

  return v_result;
end;
$$;

/**
 * reply_to_doubt(p_class_code, p_pin, p_doubt_id, p_content, p_message_id)
 * Teacher replies to a student doubt.
 * Sets status to 'answered'.
 */
create or replace function reply_to_doubt(
  p_class_code text,
  p_pin text,
  p_doubt_id text,
  p_content text,
  p_message_id text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_class_code text;
  v_stored_hash text;
  v_teacher_name text;
  v_doubt record;
  v_msg_id text;
  v_now bigint;
  v_content text;
  v_msg_row record;
begin
  v_class_code := upper(trim(coalesce(p_class_code, '')));
  select pin_hash, teacher_name into v_stored_hash, v_teacher_name from classes where code = v_class_code;
  if not found or v_stored_hash is null or v_stored_hash != extensions.crypt(trim(p_pin), v_stored_hash) then
    raise exception 'Invalid class code or teacher PIN' using errcode = 'P0001';
  end if;

  v_content := trim(coalesce(p_content, ''));
  if length(v_content) = 0 or length(v_content) > 500 then
    raise exception 'Message must be between 1 and 500 characters' using errcode = 'P0009';
  end if;

  select * into v_doubt from doubts where id = p_doubt_id and class_code = v_class_code;
  if not found then
    raise exception 'Doubt not found in this class' using errcode = 'P0002';
  end if;

  v_now := (extract(epoch from now()) * 1000)::bigint;
  v_msg_id := coalesce(p_message_id, gen_random_uuid()::text);

  insert into doubt_messages (
    id, doubt_id, sender_type, sender_id, sender_name, content, flagged, created_at
  ) values (
    v_msg_id, p_doubt_id, 'teacher', 'teacher', coalesce(v_teacher_name, 'Teacher'), v_content, false, v_now
  )
  returning * into v_msg_row;

  update doubts
  set status = 'answered',
      updated_at = v_now,
      last_message_at = v_now
  where id = p_doubt_id;

  return to_jsonb(v_msg_row);
end;
$$;

/**
 * set_doubt_status(p_class_code, p_pin, p_doubt_id, p_status)
 * Allows teacher to change doubt status ('open', 'answered', 'resolved').
 */
create or replace function set_doubt_status(
  p_class_code text,
  p_pin text,
  p_doubt_id text,
  p_status text
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_class_code text;
  v_stored_hash text;
  v_status text;
begin
  v_class_code := upper(trim(coalesce(p_class_code, '')));
  select pin_hash into v_stored_hash from classes where code = v_class_code;
  if not found or v_stored_hash is null or v_stored_hash != extensions.crypt(trim(p_pin), v_stored_hash) then
    raise exception 'Invalid class code or teacher PIN' using errcode = 'P0001';
  end if;

  v_status := lower(trim(coalesce(p_status, '')));
  if v_status not in ('open', 'answered', 'resolved') then
    raise exception 'Invalid doubt status: must be open, answered, or resolved' using errcode = 'P0010';
  end if;

  update doubts
  set status = v_status,
      updated_at = (extract(epoch from now()) * 1000)::bigint
  where id = p_doubt_id and class_code = v_class_code;

  return true;
end;
$$;

/**
 * post_announcement(p_class_code, p_pin, p_title, p_content, p_announcement_id)
 * Teacher posts a class broadcast announcement.
 */
create or replace function post_announcement(
  p_class_code text,
  p_pin text,
  p_title text,
  p_content text,
  p_announcement_id text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_class_code text;
  v_stored_hash text;
  v_id text;
  v_title text;
  v_content text;
  v_now bigint;
  v_row record;
begin
  v_class_code := upper(trim(coalesce(p_class_code, '')));
  select pin_hash into v_stored_hash from classes where code = v_class_code;
  if not found or v_stored_hash is null or v_stored_hash != extensions.crypt(trim(p_pin), v_stored_hash) then
    raise exception 'Invalid class code or teacher PIN' using errcode = 'P0001';
  end if;

  v_title := trim(coalesce(p_title, ''));
  v_content := trim(coalesce(p_content, ''));
  if length(v_title) = 0 then
    raise exception 'Announcement title is required';
  end if;
  if length(v_content) = 0 then
    raise exception 'Announcement content is required';
  end if;

  v_id := coalesce(p_announcement_id, gen_random_uuid()::text);
  v_now := (extract(epoch from now()) * 1000)::bigint;

  insert into announcements (id, class_code, title, content, created_at)
  values (v_id, v_class_code, v_title, v_content, v_now)
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

/**
 * flag_doubt_message(p_message_id, p_reason)
 * Safety & moderation: flags a doubt message for review.
 */
create or replace function flag_doubt_message(
  p_message_id text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
as $$
begin
  update doubt_messages
  set flagged = true,
      flag_reason = p_reason
  where id = p_message_id;

  return true;
end;
$$;
