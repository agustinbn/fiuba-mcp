import * as z from 'zod/v4';
import { stripHtml } from '../moodle/format.ts';
import { ws } from '../moodle/ws.ts';
import { defineTool } from './define.ts';

export const grades = defineTool(
  'fiuba_grades',
  "The student's grade report for a course: each graded item with grade, range, percentage and feedback.",
  { courseid: z.number().int() },
  async (s, { courseid }) => {
    const r = await ws(s, 'gradereport_user_get_grade_items', { courseid, userid: s.userid });
    return (r.usergrades[0]?.gradeitems ?? []).map((g: any) => ({
      item: g.itemname ?? (g.itemtype === 'course' ? 'Total del curso' : g.itemtype),
      grade: stripHtml(g.gradeformatted) || undefined,
      range: stripHtml(g.rangeformatted) || undefined,
      percentage: stripHtml(g.percentageformatted) || undefined,
      feedback: stripHtml(g.feedback) || undefined,
    }));
  }
);
