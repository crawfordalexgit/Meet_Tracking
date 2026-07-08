// Contract layer 3: small mutating routes — create, verify, clean up.
import { test, expect } from '@playwright/test';
import { authHeaders } from '../helpers/auth';
import { getServiceClient } from '../helpers/supabase';

const TITLE = `[test-suite] issue ${Date.now()}`;

test.describe.serial('issue lifecycle: log -> upvote -> delete', () => {
  let issueId;

  test('POST /api/log-issue creates an issue', async ({ request }) => {
    const res = await request.post('/api/log-issue', {
      headers: authHeaders(),
      data: { title: TITLE, description: 'created by automated test suite', type: 'bug' },
    });
    expect(res.status()).toBe(200);
    const supabase = getServiceClient();
    const { data } = await supabase.from('user_issues').select('id, title').eq('title', TITLE);
    expect(data).toHaveLength(1);
    issueId = data[0].id;
  });

  test('POST /api/upvote-issue adds a vote', async ({ request }) => {
    const res = await request.post('/api/upvote-issue', {
      headers: authHeaders(),
      data: { issueId },
    });
    expect(res.status()).toBe(200);
    const supabase = getServiceClient();
    // live issue_upvotes table has no `id` column (schema drift from schema.sql)
    const { data, error } = await supabase.from('issue_upvotes').select('issue_id').eq('issue_id', issueId);
    expect(error).toBeNull();
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  test('POST /api/delete-issue removes issue and votes (admin)', async ({ request }) => {
    const res = await request.post('/api/delete-issue', {
      headers: authHeaders('admin'),
      data: { issueId },
    });
    expect(res.status()).toBe(200);
    const supabase = getServiceClient();
    const { data } = await supabase.from('user_issues').select('id').eq('id', issueId);
    expect(data).toHaveLength(0);
  });

  test.afterAll(async () => {
    // Belt & braces: remove the fixture issue even if delete-issue failed.
    const supabase = getServiceClient();
    await supabase.from('user_issues').delete().eq('title', TITLE);
  });
});

test('POST /api/update-squad updates a target and reverts', async ({ request }) => {
  const supabase = getServiceClient();
  const { data: squads } = await supabase.from('squads').select('id, target_meets').limit(1);
  test.skip(!squads?.length, 'no squads in DB');
  const squad = squads[0];
  const newTarget = (squad.target_meets ?? 5) + 1;

  const res = await request.post('/api/update-squad', {
    headers: authHeaders('admin'),
    data: { squadId: squad.id, targetMeets: newTarget },
  });
  expect(res.status()).toBe(200);

  const { data: after } = await supabase.from('squads').select('target_meets').eq('id', squad.id).single();
  expect(after.target_meets).toBe(newTarget);

  // revert
  await supabase.from('squads').update({ target_meets: squad.target_meets }).eq('id', squad.id);
});

test('POST /api/ai/feedback stores coach feedback (then cleaned up)', async ({ request }) => {
  const supabase = getServiceClient();
  const { data: swimmers } = await supabase.from('swimmers').select('id').limit(1);
  test.skip(!swimmers?.length, 'no swimmers in DB');

  const res = await request.post('/api/ai/feedback', {
    headers: authHeaders(),
    data: {
      swimmerId: swimmers[0].id,
      originalInsight: { headline: 'test-suite insight' },
      coachCorrection: '[test-suite] automated feedback',
      isPositive: true,
    },
  });
  expect(res.status()).toBe(200);

  const { data } = await supabase
    .from('swimmer_ai_feedback').select('id')
    .eq('coach_correction', '[test-suite] automated feedback');
  expect(data.length).toBeGreaterThanOrEqual(1);
  await supabase.from('swimmer_ai_feedback').delete().eq('coach_correction', '[test-suite] automated feedback');
});

test('assign-coach: coach user can be assigned to a squad and unassigned', async ({ request }) => {
  const supabase = getServiceClient();
  const { data: squads } = await supabase.from('squads').select('id').limit(1);
  const { data: coachProfile } = await supabase.from('profiles').select('id').eq('email', process.env.TEST_COACH_EMAIL).single();
  test.skip(!squads?.length || !coachProfile, 'missing squad or coach profile');

  const res = await request.post('/api/assign-coach', {
    headers: authHeaders('admin'),
    data: { coachId: coachProfile.id, squadId: squads[0].id, assign: true },
  });
  expect(res.status()).toBe(200);

  const { data: links } = await supabase.from('coach_squads').select('*').eq('coach_id', coachProfile.id);
  expect(links.length).toBeGreaterThanOrEqual(1);

  // unassign via the same API (also covers assign:false branch)
  const res2 = await request.post('/api/assign-coach', {
    headers: authHeaders('admin'),
    data: { coachId: coachProfile.id, squadId: squads[0].id, assign: false },
  });
  expect(res2.status()).toBe(200);
  const { data: after } = await supabase.from('coach_squads').select('*').eq('coach_id', coachProfile.id);
  expect(after).toHaveLength(0);
});
