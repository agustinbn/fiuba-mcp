import { date, stripHtml } from '../moodle/format.ts';
import { ws } from '../moodle/ws.ts';
import { defineTool } from './define.ts';

export const upcoming = defineTool(
  'fiuba_upcoming',
  'Upcoming deadlines and pending actions across all courses (assignment due dates, quizzes, etc.), soonest first, including overdue ones from the last 14 days. Already-completed items are not listed. Times are Buenos Aires local.',
  {},
  async s => {
    const now = Math.floor(Date.now() / 1000);
    // look back 14 days like Moodle's timeline, so overdue-but-unsubmitted items show up
    const r = await ws(s, 'core_calendar_get_action_events_by_timesort', {
      timesortfrom: now - 14 * 86400,
      limitnum: 50,
    });
    return {
      now: date(now),
      events: r.events.map((e: any) => ({
        course: e.course?.fullname,
        name: stripHtml(e.name),
        type: e.modulename,
        when: date(e.timesort),
        overdue: e.overdue || undefined,
        url: e.url,
      })),
    };
  }
);
