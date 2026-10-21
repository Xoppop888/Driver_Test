-- DrivePrep access, sessions, and static question-bank backend.
-- Browser roles get neither table nor RPC access. The Cloudflare Worker is the
-- only caller and uses the Supabase service_role key over PostgREST.

create extension if not exists pgcrypto;

create table if not exists public.access_code_batches (
  id uuid primary key default gen_random_uuid(),
  note text,
  expires_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  installation_id text not null unique check (pg_catalog.char_length(installation_id) between 8 and 128),
  entitlement text not null default 'free' check (entitlement in ('free', 'premium')),
  premium_activated_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.access_code_batches(id) on delete restrict,
  -- SHA-256 of normalized code plus Worker-held pepper. Plaintext is never stored.
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz,
  redeemed_by_user_id uuid references public.app_users(id) on delete restrict,
  redeemed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  check ((redeemed_by_user_id is null) = (redeemed_at is null))
);
create index if not exists access_codes_redeemable_idx
  on public.access_codes (code_hash) where redeemed_at is null;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  -- SHA-256 of opaque Worker-issued bearer token plus Worker-held pepper.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  last_seen_at timestamptz not null default pg_catalog.now(),
  check (expires_at > created_at)
);
create index if not exists sessions_active_token_idx on public.sessions (token_hash, expires_at);

create table if not exists public.daily_question_usage (
  user_id uuid not null references public.app_users(id) on delete cascade,
  subject smallint not null check (subject in (1, 4)),
  usage_date date not null,
  -- Fixed order of the first response's question IDs. This prevents refreshes
  -- from changing the free user's daily pool or consuming quota again.
  question_ids jsonb not null check (pg_catalog.jsonb_typeof(question_ids) = 'array'),
  remaining smallint not null check (remaining between 0 and 50),
  created_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, subject, usage_date)
);

create table if not exists public.question_bank (
  id text primary key,
  subject smallint not null check (subject in (1, 4)),
  -- Importer assigns deterministic 1..100 rank for each subject.
  selection_rank smallint not null check (selection_rank between 1 and 100),
  type text not null check (type in ('true_false', 'single_choice', 'multiple_choice')),
  question_ru text not null,
  question_en text not null,
  options_ru jsonb not null check (pg_catalog.jsonb_typeof(options_ru) = 'array'),
  options_en jsonb not null check (pg_catalog.jsonb_typeof(options_en) = 'array'),
  correct_index smallint,
  correct_indices jsonb not null default '[]'::jsonb check (pg_catalog.jsonb_typeof(correct_indices) = 'array'),
  explanation_ru text,
  explanation_en text,
  image_url text,
  source jsonb not null default '{}'::jsonb,
  translation_status jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default pg_catalog.now(),
  unique (subject, selection_rank)
);
create index if not exists question_bank_subject_rank_idx on public.question_bank (subject, selection_rank);

comment on table public.question_bank is 'Exactly 100 deterministically selected static questions per supported subject after import.';
comment on column public.daily_question_usage.question_ids is 'Stable 50-or-fewer ID pool first issued on a Shanghai calendar day.';

-- No direct browser table access. RLS is enabled as defence in depth; explicit
-- grants below also prevent accidental anonymous/authenticated REST access.
alter table public.access_code_batches enable row level security;
alter table public.access_codes enable row level security;
alter table public.app_users enable row level security;
alter table public.sessions enable row level security;
alter table public.daily_question_usage enable row level security;
alter table public.question_bank enable row level security;

revoke all on table public.access_code_batches from public, anon, authenticated;
revoke all on table public.access_codes from public, anon, authenticated;
revoke all on table public.app_users from public, anon, authenticated;
revoke all on table public.sessions from public, anon, authenticated;
revoke all on table public.daily_question_usage from public, anon, authenticated;
revoke all on table public.question_bank from public, anon, authenticated;
grant select, insert, update, delete on table public.access_code_batches, public.access_codes, public.app_users, public.sessions, public.daily_question_usage, public.question_bank to service_role;

-- Prevent future objects created by this migration owner in public from
-- silently restoring browser access through PostgreSQL's default ACLs.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;

-- Atomically redeems exactly one unused unexpired code and creates a bearer session.
create or replace function public.redeem_access_code(
  p_code_hash text,
  p_installation_id text,
  p_token_hash text,
  p_session_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_code public.access_codes%rowtype;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$' or p_token_hash !~ '^[0-9a-f]{64}$'
     or pg_catalog.char_length(pg_catalog.btrim(p_installation_id)) not between 8 and 128
     or p_session_expires_at <= pg_catalog.now() or p_session_expires_at > pg_catalog.now() + interval '366 days' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  -- Serialise concurrent redemption attempts from the same installation.
  insert into public.app_users (installation_id)
  values (pg_catalog.btrim(p_installation_id))
  on conflict (installation_id) do nothing;
  select id into v_user_id
  from public.app_users
  where installation_id = pg_catalog.btrim(p_installation_id)
  for update;

  -- Lock makes a code one-time even when two requests arrive simultaneously.
  select * into v_code
  from public.access_codes
  where code_hash = p_code_hash
  for update;

  if not found or v_code.redeemed_at is not null
     or (v_code.expires_at is not null and v_code.expires_at <= pg_catalog.now()) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_code');
  end if;

  update public.access_codes
  set redeemed_by_user_id = v_user_id, redeemed_at = pg_catalog.now()
  where id = v_code.id;

  update public.app_users
  set entitlement = 'premium', premium_activated_at = coalesce(premium_activated_at, pg_catalog.now()), updated_at = pg_catalog.now()
  where id = v_user_id;

  insert into public.sessions (user_id, token_hash, expires_at)
  values (v_user_id, p_token_hash, p_session_expires_at);

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 'premium',
    'expires_at', p_session_expires_at
  );
end;
$$;

-- Validates a bearer token without exposing any user data beyond entitlement.
create or replace function public.get_session_entitlement(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
  v_user public.app_users%rowtype;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('unlocked', false, 'status', 'free', 'expires_at', null);
  end if;

  select s.* into v_session
  from public.sessions s
  join public.app_users u on u.id = s.user_id
  where s.token_hash = p_token_hash and s.expires_at > pg_catalog.now();

  if not found then
    return pg_catalog.jsonb_build_object('unlocked', false, 'status', 'free', 'expires_at', null);
  end if;

  select * into v_user from public.app_users where id = v_session.user_id;
  update public.sessions
  set last_seen_at = pg_catalog.now(),
      expires_at = pg_catalog.now() + pg_catalog.make_interval(days => 30)
  where id = v_session.id
  returning * into v_session;

  return pg_catalog.jsonb_build_object(
    'unlocked', v_user.entitlement = 'premium',
    'status', v_user.entitlement,
    'expires_at', v_session.expires_at,
    'installation_id', v_user.installation_id
  );
end;
$$;

-- Returns a fixed question ID pool. Shanghai date and reset timestamp are
-- calculated inside this transaction, never trusted from the client.
create or replace function public.issue_question_access(
  p_installation_id text,
  p_subject smallint,
  p_token_hash text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_entitlement text := 'free';
  v_usage public.daily_question_usage%rowtype;
  v_day date := (pg_catalog.now() at time zone 'Asia/Shanghai')::date;
  v_reset_at timestamptz := ((pg_catalog.now() at time zone 'Asia/Shanghai')::date + 1)::timestamp at time zone 'Asia/Shanghai';
  v_ids text[];
  v_issued integer;
  v_remaining integer;
begin
  if p_subject not in (1, 4) or pg_catalog.char_length(pg_catalog.btrim(p_installation_id)) not between 8 and 128 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  if p_token_hash is not null then
    select u.id, u.entitlement into v_user_id, v_entitlement
    from public.sessions s
    join public.app_users u on u.id = s.user_id
    where s.token_hash = p_token_hash
      and s.expires_at > pg_catalog.now()
      and u.installation_id = pg_catalog.btrim(p_installation_id)
    for update of u;

    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_session');
    end if;
    -- Keep an actively used premium session alive; idle sessions expire after 30 days.
    update public.sessions
    set last_seen_at = pg_catalog.now(),
        expires_at = pg_catalog.now() + pg_catalog.make_interval(days => 30)
    where token_hash = p_token_hash;
  else
    insert into public.app_users (installation_id)
    values (pg_catalog.btrim(p_installation_id))
    on conflict (installation_id) do nothing;

    -- User row lock serialises first daily issuance and makes retries idempotent.
    -- Installation IDs identify free usage only. A premium entitlement is
    -- returned exclusively through a valid bearer session above.
    select id into v_user_id
    from public.app_users
    where installation_id = pg_catalog.btrim(p_installation_id)
    for update;
  end if;

  if v_entitlement = 'premium' then
    select coalesce(pg_catalog.array_agg(id order by selection_rank), array[]::text[])
    into v_ids
    from public.question_bank
    where subject = p_subject;

    if pg_catalog.cardinality(v_ids) <> 100 then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'question_bank_unseeded');
    end if;

    return pg_catalog.jsonb_build_object(
      'ok', true,
      'question_ids', pg_catalog.to_jsonb(v_ids),
      'remaining', null,
      'reset_at', null,
      'premium', true
    );
  end if;

  select * into v_usage
  from public.daily_question_usage
  where user_id = v_user_id and subject = p_subject and usage_date = v_day
  for update;

  if found then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'question_ids', v_usage.question_ids,
      'remaining', v_usage.remaining,
      'reset_at', v_reset_at,
      'premium', false
    );
  end if;

  -- The first call gets a deterministic, date-specific 50-ID set. It is then
  -- persisted, so subsequent calls cannot reshuffle or consume quota again. The
  -- returned remaining value is the stable pool size available today, not a
  -- second, decrement-on-refresh counter.
  select coalesce(pg_catalog.array_agg(id order by daily_order, id), array[]::text[])
  into v_ids
  from (
    select id, pg_catalog.md5(id || ':' || v_day::text) as daily_order
    from public.question_bank
    where subject = p_subject
    order by pg_catalog.md5(id || ':' || v_day::text), id
    limit 50
  ) selected;

  v_issued := pg_catalog.cardinality(v_ids);
  if v_issued = 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'question_bank_unseeded');
  end if;
  -- One response delivers the whole daily allocation. Keep its availability
  -- visible to clients as 50 (or fewer if the bank is unexpectedly incomplete).
  v_remaining := v_issued;

  insert into public.daily_question_usage (user_id, subject, usage_date, question_ids, remaining)
  values (v_user_id, p_subject, v_day, pg_catalog.to_jsonb(v_ids), v_remaining);

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'question_ids', pg_catalog.to_jsonb(v_ids),
    'remaining', v_remaining,
    'reset_at', v_reset_at,
    'premium', false
  );
end;
$$;

-- Preserves array order and returns the same question record shape used by the
-- existing practice client. Correct answers deliberately exist only behind this
-- Worker/service-role RPC; this is a practice API, not an exam submission API.
create or replace function public.get_question_bank(p_question_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_question_ids is null or pg_catalog.cardinality(p_question_ids) > 100 then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', q.id,
      'subject', q.subject,
      'type', q.type,
      'question_ru', q.question_ru,
      'question_en', q.question_en,
      'options_ru', q.options_ru,
      'options_en', q.options_en,
      'correct_index', q.correct_index,
      'correct_indices', q.correct_indices,
      'explanation_ru', q.explanation_ru,
      'explanation_en', q.explanation_en,
      'image_url', q.image_url,
      'source', q.source,
      'translation_status', q.translation_status
    ) order by input.ordinality), '[]'::jsonb)
    from unnest(p_question_ids) with ordinality as input(id, ordinality)
    join public.question_bank q on q.id = input.id
  );
end;
$$;

-- Stores hashes only. The Worker generates human-readable codes and returns the
-- plaintext exactly once to the administrator; no plaintext code reaches a table.
create or replace function public.create_access_code_batch(
  p_code_hashes text[],
  p_expires_at timestamptz default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_id uuid;
  v_count integer := pg_catalog.cardinality(p_code_hashes);
begin
  if v_count is null or v_count not between 1 and 100
     or (p_expires_at is not null and p_expires_at <= pg_catalog.now())
     or exists (select 1 from unnest(p_code_hashes) as h(code_hash) where h.code_hash !~ '^[0-9a-f]{64}$')
     or (select pg_catalog.count(distinct h.code_hash) from unnest(p_code_hashes) as h(code_hash)) <> v_count then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  insert into public.access_code_batches (note, expires_at)
  values (nullif(pg_catalog.btrim(p_note), ''), p_expires_at)
  returning id into v_batch_id;

  insert into public.access_codes (batch_id, code_hash, expires_at)
  select v_batch_id, h.code_hash, p_expires_at
  from unnest(p_code_hashes) as h(code_hash);

  return pg_catalog.jsonb_build_object('ok', true, 'batch_id', v_batch_id, 'count', v_count);
end;
$$;

revoke all on function public.redeem_access_code(text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.get_session_entitlement(text) from public, anon, authenticated;
revoke all on function public.issue_question_access(text, smallint, text) from public, anon, authenticated;
revoke all on function public.get_question_bank(text[]) from public, anon, authenticated;
revoke all on function public.create_access_code_batch(text[], timestamptz, text) from public, anon, authenticated;
grant execute on function public.redeem_access_code(text, text, text, timestamptz) to service_role;
grant execute on function public.get_session_entitlement(text) to service_role;
grant execute on function public.issue_question_access(text, smallint, text) to service_role;
grant execute on function public.get_question_bank(text[]) to service_role;
grant execute on function public.create_access_code_batch(text[], timestamptz, text) to service_role;
