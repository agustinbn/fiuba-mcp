import { SESSION_FILE, saveSession, type Session } from './session.ts';
import { ws } from './ws.ts';

export const DEFAULT_BASE = 'https://campusgrado.fi.uba.ar';

// Functions the tools call; checked at login so a disabled one fails early.
const NEEDED = [
  'core_enrol_get_users_courses',
  'core_course_get_contents',
  'core_calendar_get_action_events_by_timesort',
  'mod_assign_get_assignments',
  'mod_assign_get_submission_status',
  'mod_forum_get_forum_discussions',
  'mod_forum_get_discussion_posts',
  'gradereport_user_get_grade_items',
];

/** Exchanges credentials for a token and stores the session. The password is never kept. */
export async function login(base: string, username: string, password: string) {
  const res = await fetch(`${base}/login/token.php`, {
    method: 'POST',
    body: new URLSearchParams({ username, password, service: 'moodle_mobile_app' }),
    signal: AbortSignal.timeout(30_000),
  });
  const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!data.token) throw new Error(data.error || 'Login fallido');

  const info = await ws({ base, token: data.token, userid: 0 }, 'core_webservice_get_site_info');
  const session: Session = { base, token: data.token, userid: info.userid };
  await saveSession(session);

  const enabled = new Set((info.functions ?? []).map((f: { name: string }) => f.name));
  return {
    fullname: info.fullname as string,
    file: SESSION_FILE,
    missing: NEEDED.filter(f => !enabled.has(f)),
  };
}
