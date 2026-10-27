-- =========================================================
-- Expanded foul/harsh-word list for gc_has_profanity()
-- Keeps the database check in sync with src/lib/profanity.js (the live highlighter).
-- Safe to re-run. Run once in the Supabase SQL editor.
-- =========================================================

create or replace function public.gc_has_profanity(p_text text)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  s     text;
  v_pat text;
  v_words text[] := array[
    'fuck', 'fucks', 'fucked', 'fucking', 'fucker', 'fuckers', 'motherfucker', 'fuk',
    'fuq', 'fcuk', 'shit', 'shits', 'shitty', 'bullshit', 'shet', 'bitch',
    'bitches', 'bitchy', 'bastard', 'bastards', 'asshole', 'assholes', 'dickhead', 'cunt',
    'pussy', 'slut', 'whore', 'douche', 'douchebag', 'nigger', 'nigga', 'faggot',
    'retard', 'retarded', 'damn', 'dammit', 'goddamn', 'crap', 'cock', 'dumbass',
    'jackass', 'idiot', 'idiots', 'moron', 'morons', 'stupid', 'scumbag', 'wtf',
    'stfu', 'putangina', 'putanginamo', 'tangina', 'tanginamo', 'tanginang', 'puta', 'putang',
    'pota', 'potah', 'gago', 'gagu', 'tarantado', 'tarantada', 'ulol', 'bobo',
    'tanga', 'siraulo', 'kupal', 'punyeta', 'puneta', 'pucha', 'lintik', 'buwisit',
    'bwisit', 'pakyu', 'pakshet', 'pakingshet', 'hindot', 'kantot', 'kantutan', 'pekpek',
    'burat', 'walanghiya', 'gunggong', 'engot', 'tangna', 'putangna', 'potangina', 'potanginamo',
    'pukingina', 'pukinangina', 'amputa', 'amputangina', 'putragis', 'putcha', 'putsa', 'peste',
    'pesteng', 'piste', 'pisti', 'leche', 'lecheng', 'shunga', 'inutil', 'ungas',
    'hinayupak', 'hayup', 'demonyo', 'ogag', 'gaga', 'puki', 'titi', 'jakol',
    'yawa'
  ];
begin
  if p_text is null or btrim(p_text) = '' then return false; end if;

  s := lower(p_text);
  s := regexp_replace(s, '[!|+.,;:?]+(?=\s|$)', '', 'g');         -- trailing punctuation ("shit!")
  s := translate(s, '@$!|+04315789', 'asiitoaeistbg');            -- leetspeak
  s := regexp_replace(s, '(.)\1+', '\1', 'g');                     -- fuuuck -> fuck

  select string_agg(regexp_replace(w, '(.)\1+', '\1', 'g'), '|') into v_pat from unnest(v_words) as w;
  v_pat := v_pat || '|tang\s+ina|putang\s+ina|pak\s+yu|wala\s+ng\s+hiya|walang\s+hiya|pota\s+ng\s+ina';

  return s ~ ('(^|[^a-z])(' || v_pat || ')($|[^a-z])');
end $$;

revoke all on function public.gc_has_profanity(text) from public, anon, authenticated;
