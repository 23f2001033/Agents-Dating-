// Completion + compliance audit for a demo run.  Usage: npx tsx scripts/audit.ts cohort-25
import "dotenv/config";
import { sql } from "../lib/db";

async function main() {
  const slug = process.argv[2] ?? "cohort-25";
  const [run] = await sql`select id, published, status from runs where slug = ${slug}`;
  const people = await sql`
    select p.slug, p.display_name, p.linkedin_url, p.instagram_url, p.identity->>'status' identity, p.identity->>'review' review,
      (select (s.normalized->>'isPrivate')::boolean from source_snapshots s where s.person_id = p.id and s.platform = 'instagram' and s.status = 'succeeded' order by s.created_at desc limit 1) ig_private,
      pv.quality, pv.model,
      (select count(*) from jsonb_array_elements(pv.profile->'claims') c where c->>'category' = 'interest')::int interests,
      (select count(*) from jsonb_array_elements(pv.profile->'claims') c where c->>'category' = 'hobby')::int hobbies,
      (select count(*) from jsonb_array_elements(pv.profile->'claims') c where c->>'category' = 'need')::int needs,
      (select count(*) from jsonb_array_elements(pv.profile->'claims') c where c->>'category' in ('priority','lifestyle','communication','background'))::int other,
      (pv.profile->>'needsNote') needs_note,
      (select count(*) from evidence e where e.snapshot_id in (pv.linkedin_snapshot_id, pv.instagram_snapshot_id) and e.platform = 'linkedin')::int li_ev,
      (select count(*) from evidence e where e.snapshot_id in (pv.linkedin_snapshot_id, pv.instagram_snapshot_id) and e.platform = 'instagram')::int ig_ev,
      (select count(*) from assessments a where a.run_id = m.run_id and a.evaluator_id = p.id and a.score is not null)::int ranked
    from run_members m join people p on p.id = m.person_id join profile_versions pv on pv.id = m.profile_version_id
    where m.run_id = ${run.id} order by p.display_name`;
  let ok = true;
  const flag = (cond: boolean, msg: string) => {
    if (!cond) {
      ok = false;
      console.log("  ✗", msg);
    }
  };
  console.log(`RUN ${slug}: published=${run.published} status=${run.status}`);
  console.log(`PEOPLE (${people.length})`);
  for (const p of people) {
    console.log(
      `  ${p.display_name.padEnd(22)} id:${(p.identity + (p.review ? "*" : "")).padEnd(14)} igPrivate:${p.ig_private} ${p.quality.padEnd(10)} interests:${p.interests} hobbies:${p.hobbies} needs:${p.needs} other:${p.other} evidence L${p.li_ev}/I${p.ig_ev} ranked:${p.ranked}/24`,
    );
    flag(p.ig_private === false, `${p.slug}: Instagram not confirmed public`);
    flag(["cross_linked", "corroborated"].includes(p.identity), `${p.slug}: identity ${p.identity}`);
    flag(p.interests + p.hobbies > 0, `${p.slug}: no interests/hobbies`);
    flag(p.li_ev > 0 && p.ig_ev > 0, `${p.slug}: missing a source`);
  }
  const [d] = await sql`select count(*)::int dates, count(*) filter (where status='completed')::int done,
      (select count(*)::int from date_turns t join dates x on x.id=t.date_id where x.run_id=${run.id}) turns,
      (select count(*)::int from assessments where run_id=${run.id}) assessments,
      (select count(*)::int from assessments where run_id=${run.id} and score is null) unknown_scores,
      (select count(*)::int from (select person_a_id, person_b_id from dates where run_id=${run.id} group by 1,2 having count(*)>1) dup) duplicate_pairs,
      (select count(*)::int from dates where run_id=${run.id} and person_a_id=person_b_id) self_pairs
    from dates where run_id = ${run.id}`;
  console.log("DATES", d);
  flag(d.dates === 300 && d.done === 300 && d.turns === 1800 && d.assessments === 600, "incomplete dates/turns/assessments");
  flag(d.duplicate_pairs === 0 && d.self_pairs === 0, "duplicate or self pairs");
  const [fs] = await sql`select count(*) filter (where first_speaker='a')::int a, count(*) filter (where first_speaker='b')::int b from dates where run_id=${run.id}`;
  const opens = await sql`select p, count(*)::int n from (select case when first_speaker='a' then person_a_id else person_b_id end p from dates where run_id=${run.id}) x group by p`;
  console.log("FIRST SPEAKER", fs, "opens per person:", [...new Set(opens.map((o) => o.n))].join(","));
  const acts = await sql`select action, count(*)::int n from date_turns t join dates x on x.id=t.date_id where x.run_id=${run.id} group by 1 order by 2 desc`;
  console.log("ACTIONS", acts.map((a) => `${a.action}:${a.n}`).join(" "));
  const second = await sql`select second_date, count(*)::int n from assessments where run_id=${run.id} group by 1`;
  console.log("SECOND DATE VERDICTS", second.map((a) => `${a.second_date}:${a.n}`).join(" "));
  const [sc] = await sql`select round(min(score)::numeric,1) min, round(avg(score)::numeric,1) avg, round(max(score)::numeric,1) max from assessments where run_id=${run.id}`;
  console.log("SCORES", sc);
  const usage = await sql`select model, count(*)::int calls, sum(input_tokens)::bigint inp, sum(output_tokens)::bigint outp from llm_usage where ok group by 1 order by 2 desc`;
  const price: Record<string, [number, number]> = { "Qwen/Qwen3.8-Flash-Next": [0.15, 0.5], "moonshotai/Kimi-K2.6": [0.8, 3.4], "deepseek-ai/DeepSeek-V3.2": [0.264, 0.41] };
  let cost = 0;
  for (const u of usage) {
    const p = price[u.model] ?? [0.5, 1.5];
    const c = (Number(u.inp) / 1e6) * p[0] + (Number(u.outp) / 1e6) * p[1];
    cost += c;
    console.log(`USAGE ${u.model}: ${u.calls} ok calls, ${u.inp} in / ${u.outp} out tokens ≈ $${c.toFixed(2)}`);
  }
  console.log(`ESTIMATED MODEL SPEND ≈ $${cost.toFixed(2)} (successful calls only; failed/retried calls add some)`);
  console.log(ok ? "AUDIT: PASS" : "AUDIT: FAIL");
  await sql.end();
}
main();
