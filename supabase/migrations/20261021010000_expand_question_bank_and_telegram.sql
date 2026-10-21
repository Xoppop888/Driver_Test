-- Expands the approved question bank without changing the already-applied access
-- migration. Browser roles continue to have no table or RPC access; all calls
-- below are made by the Worker with the Supabase service_role key.

-- The original migration limited ranks to the initial 100-question subset. The
-- deterministic importer now ranks every question while retaining those first
-- 100 ranks unchanged.
alter table public.question_bank
  drop constraint if exists question_bank_selection_rank_check;
alter table public.question_bank
  add constraint question_bank_selection_rank_check
  check (selection_rank between 1 and 2545);

-- Keep the existing 100-question service behavior through import and Worker
-- rollout. Activate the full-bank entitlement only after the new Worker is live.
create table if not exists public.question_bank_release_state (
  singleton boolean primary key default true check (singleton),
  full_bank_enabled_at timestamptz
);
insert into public.question_bank_release_state (singleton, full_bank_enabled_at)
values (true, null)
on conflict (singleton) do nothing;
alter table public.question_bank_release_state enable row level security;
revoke all on table public.question_bank_release_state from public, anon, authenticated;
grant select, insert, update, delete on table public.question_bank_release_state to service_role;

comment on table public.question_bank is 'Complete deterministic static question bank: Subject 1 has 2545 rows and Subject 4 has 1833 rows after import.';

-- Run manually in the Supabase SQL editor only after the new Worker is deployed.
-- This prevents the old Worker/frontend from observing a partial or oversized
-- bank during the data import and Worker rollout.
create or replace function public.activate_full_question_bank()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject1_count integer;
  v_subject4_count integer;
begin
  select pg_catalog.count(*) filter (where subject = 1),
         pg_catalog.count(*) filter (where subject = 4)
  into v_subject1_count, v_subject4_count
  from public.question_bank;

  if v_subject1_count <> 2545 or v_subject4_count <> 1833 then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'question_bank_incomplete',
      'subject1', v_subject1_count,
      'subject4', v_subject4_count
    );
  end if;

  update public.question_bank_release_state
  set full_bank_enabled_at = coalesce(full_bank_enabled_at, pg_catalog.now())
  where singleton = true;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'subject1', v_subject1_count,
    'subject4', v_subject4_count
  );
end;
$$;

-- Premium and free issuance keep using the legacy first 100 ranks until explicit
-- activation. This preserves the live API while schema and data are rolled out.
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
  v_expected_count integer;
  v_bank_count integer;
  v_full_bank_enabled boolean;
begin
  if p_subject not in (1, 4) or pg_catalog.char_length(pg_catalog.btrim(p_installation_id)) not between 8 and 128 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  select (full_bank_enabled_at is not null) into v_full_bank_enabled
  from public.question_bank_release_state
  where singleton = true;
  v_full_bank_enabled := coalesce(v_full_bank_enabled, false);
  v_expected_count := case
    when v_full_bank_enabled then case p_subject when 1 then 2545 when 4 then 1833 else 0 end
    else 100
  end;

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

    update public.sessions
    set last_seen_at = pg_catalog.now(),
        expires_at = pg_catalog.now() + pg_catalog.make_interval(days => 30)
    where token_hash = p_token_hash;
  else
    insert into public.app_users (installation_id)
    values (pg_catalog.btrim(p_installation_id))
    on conflict (installation_id) do nothing;

    select id into v_user_id
    from public.app_users
    where installation_id = pg_catalog.btrim(p_installation_id)
    for update;
  end if;

  if v_entitlement = 'premium' then
    select pg_catalog.count(*) into v_bank_count
    from public.question_bank
    where subject = p_subject
      and (v_full_bank_enabled or selection_rank <= 100);
    if v_bank_count <> v_expected_count then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'question_bank_unseeded');
    end if;

    select pg_catalog.array_agg(id order by selection_rank) into v_ids
    from public.question_bank
    where subject = p_subject
      and (v_full_bank_enabled or selection_rank <= 100);

    if pg_catalog.cardinality(v_ids) <> v_expected_count then
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

  select pg_catalog.count(*) into v_bank_count
  from public.question_bank
  where subject = p_subject
    and (v_full_bank_enabled or selection_rank <= 100);
  if v_bank_count < 50 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'question_bank_unseeded');
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

  -- Stable date-specific ordering samples all imported IDs. The resulting first
  -- 50 IDs are stored, so refreshes and practice pagination never use more quota.
  select coalesce(pg_catalog.array_agg(id order by daily_order, id), array[]::text[])
  into v_ids
  from (
    select id, pg_catalog.md5(id || ':' || v_day::text) as daily_order
    from public.question_bank
    where subject = p_subject
      and (v_full_bank_enabled or selection_rank <= 100)
    order by pg_catalog.md5(id || ':' || v_day::text), id
    limit 50
  ) selected;

  v_issued := pg_catalog.cardinality(v_ids);
  if v_issued <> 50 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'question_bank_unseeded');
  end if;

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

-- Both legacy and new Workers may call this RPC. Keep the legacy 100-row cap;
-- new code issues bounded chunks and no client can invoke this RPC directly.
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
    from pg_catalog.unnest(p_question_ids) with ordinality as input(id, ordinality)
    join public.question_bank q on q.id = input.id
  );
end;
$$;

-- Telegram uses a single private administrator binding. Pairing values and
-- access-code values are represented by hashes only; plaintext never enters a
-- Supabase table. update_id claims make bot retries idempotent.
create table if not exists public.telegram_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  check (expires_at > created_at),
  check (used_at is null or used_at >= created_at)
);

create table if not exists public.telegram_admin_bindings (
  singleton boolean primary key default true check (singleton),
  chat_id bigint not null unique check (chat_id > 0),
  user_id bigint not null unique check (user_id > 0),
  paired_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.telegram_update_claims (
  update_id bigint primary key check (update_id > 0),
  command text not null check (command in ('pair', 'generate')),
  claimed_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.telegram_generated_batches (
  update_id bigint primary key references public.telegram_update_claims(update_id) on delete restrict,
  batch_id uuid not null unique references public.access_code_batches(id) on delete restrict,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'delivered', 'failed')),
  delivery_updated_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists telegram_pairing_codes_active_idx
  on public.telegram_pairing_codes (expires_at) where used_at is null;

alter table public.telegram_pairing_codes enable row level security;
alter table public.telegram_admin_bindings enable row level security;
alter table public.telegram_update_claims enable row level security;
alter table public.telegram_generated_batches enable row level security;

revoke all on table public.telegram_pairing_codes from public, anon, authenticated;
revoke all on table public.telegram_admin_bindings from public, anon, authenticated;
revoke all on table public.telegram_update_claims from public, anon, authenticated;
revoke all on table public.telegram_generated_batches from public, anon, authenticated;
grant select, insert, update, delete on table public.telegram_pairing_codes, public.telegram_admin_bindings, public.telegram_update_claims, public.telegram_generated_batches to service_role;

-- Pairing codes are created only by an X-Admin-Key protected Worker route. The
-- expiry check deliberately confines this endpoint to a ten-minute code.
create or replace function public.create_telegram_pairing_code(
  p_code_hash text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at <= pg_catalog.now()
     or p_expires_at > pg_catalog.now() + interval '10 minutes 5 seconds' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  insert into public.telegram_pairing_codes (code_hash, expires_at)
  values (p_code_hash, p_expires_at);

  return pg_catalog.jsonb_build_object('ok', true);
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_request');
end;
$$;

-- A pairing update is claimed before the code is consumed. Retried Telegram
-- deliveries therefore cannot bind a different account with the same update.
create or replace function public.claim_telegram_pairing(
  p_update_id bigint,
  p_chat_id bigint,
  p_user_id bigint,
  p_code_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pairing public.telegram_pairing_codes%rowtype;
  v_inserted boolean;
begin
  if p_update_id <= 0 or p_chat_id <= 0 or p_user_id <= 0 or p_code_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  v_inserted := false;
  insert into public.telegram_update_claims (update_id, command)
  values (p_update_id, 'pair')
  on conflict (update_id) do nothing
  returning true into v_inserted;

  if coalesce(v_inserted, false) = false then
    return pg_catalog.jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  select * into v_pairing
  from public.telegram_pairing_codes
  where code_hash = p_code_hash
  for update;

  if not found or v_pairing.used_at is not null or v_pairing.expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_pairing_code');
  end if;

  v_inserted := false;
  insert into public.telegram_admin_bindings (singleton, chat_id, user_id)
  values (true, p_chat_id, p_user_id)
  on conflict (singleton) do nothing
  returning true into v_inserted;

  if coalesce(v_inserted, false) = false then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'admin_already_paired');
  end if;

  update public.telegram_pairing_codes
  set used_at = pg_catalog.now()
  where id = v_pairing.id;

  return pg_catalog.jsonb_build_object('ok', true, 'paired', true);
end;
$$;

-- Claims the Telegram update and creates the access-code batch in one database
-- transaction. A duplicate update can only observe its original batch; it can
-- never mint a second batch even if delivery is retried.
create or replace function public.claim_telegram_code_batch(
  p_update_id bigint,
  p_chat_id bigint,
  p_user_id bigint,
  p_code_hashes text[],
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_binding public.telegram_admin_bindings%rowtype;
  v_batch_id uuid;
  v_count integer := pg_catalog.cardinality(p_code_hashes);
  v_inserted boolean;
  v_delivery_status text;
begin
  if p_update_id <= 0 or p_chat_id <= 0 or p_user_id <= 0
     or v_count is null or v_count not between 1 and 100
     or exists (select 1 from pg_catalog.unnest(p_code_hashes) as h(code_hash) where h.code_hash !~ '^[0-9a-f]{64}$')
     or (select pg_catalog.count(distinct h.code_hash) from pg_catalog.unnest(p_code_hashes) as h(code_hash)) <> v_count then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  -- Do not claim updates from non-admin private chats: they are ignored and
  -- cannot later receive a retry status message.
  select * into v_binding
  from public.telegram_admin_bindings
  where singleton = true;
  if not found or v_binding.chat_id <> p_chat_id or v_binding.user_id <> p_user_id then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'telegram_not_admin');
  end if;

  v_inserted := false;
  insert into public.telegram_update_claims (update_id, command)
  values (p_update_id, 'generate')
  on conflict (update_id) do nothing
  returning true into v_inserted;

  if coalesce(v_inserted, false) = false then
    select delivery_status into v_delivery_status
    from public.telegram_generated_batches
    where update_id = p_update_id;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'delivery_status', v_delivery_status
    );
  end if;

  insert into public.access_code_batches (note, expires_at)
  values (nullif(pg_catalog.btrim(p_note), ''), null)
  returning id into v_batch_id;

  insert into public.access_codes (batch_id, code_hash, expires_at)
  select v_batch_id, h.code_hash, null
  from pg_catalog.unnest(p_code_hashes) as h(code_hash);

  insert into public.telegram_generated_batches (update_id, batch_id)
  values (p_update_id, v_batch_id);

  return pg_catalog.jsonb_build_object('ok', true, 'duplicate', false, 'batch_id', v_batch_id);
end;
$$;

create or replace function public.mark_telegram_batch_delivery(
  p_update_id bigint,
  p_delivery_status text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_update_id <= 0 or p_delivery_status not in ('delivered', 'failed') then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  update public.telegram_generated_batches
  set delivery_status = p_delivery_status,
      delivery_updated_at = pg_catalog.now()
  where update_id = p_update_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.issue_question_access(text, smallint, text) from public, anon, authenticated;
revoke all on function public.get_question_bank(text[]) from public, anon, authenticated;
revoke all on function public.activate_full_question_bank() from public, anon, authenticated;
revoke all on function public.create_telegram_pairing_code(text, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_telegram_pairing(bigint, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.claim_telegram_code_batch(bigint, bigint, bigint, text[], text) from public, anon, authenticated;
revoke all on function public.mark_telegram_batch_delivery(bigint, text) from public, anon, authenticated;
grant execute on function public.issue_question_access(text, smallint, text) to service_role;
grant execute on function public.get_question_bank(text[]) to service_role;
grant execute on function public.activate_full_question_bank() to service_role;
grant execute on function public.create_telegram_pairing_code(text, timestamptz) to service_role;
grant execute on function public.claim_telegram_pairing(bigint, bigint, bigint, text) to service_role;
grant execute on function public.claim_telegram_code_batch(bigint, bigint, bigint, text[], text) to service_role;
grant execute on function public.mark_telegram_batch_delivery(bigint, text) to service_role;
