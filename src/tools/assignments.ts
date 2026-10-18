import * as z from 'zod/v4';
import { date, stripHtml } from '../moodle/format.ts';
import { ws } from '../moodle/ws.ts';
import { defineTool } from './define.ts';

export const assignments = defineTool(
  'fiuba_assignments',
  "Lists a course's assignments with due dates, the student's submission status, grade and teacher feedback. Times are Buenos Aires local.",
  { courseid: z.number().int() },
  async (s, { courseid }) => {
    const r = await ws(s, 'mod_assign_get_assignments', { courseids: [courseid] });
    const list: any[] = r.courses[0]?.assignments ?? [];
    const statuses = await Promise.allSettled(
      list.map(a => ws(s, 'mod_assign_get_submission_status', { assignid: a.id }))
    );
    return list.map((a, i) => {
      const st =
        statuses[i].status === 'fulfilled'
          ? (statuses[i] as PromiseFulfilledResult<any>).value
          : undefined;
      const attempt = st?.lastattempt;
      const feedback = st?.feedback?.plugins
        ?.flatMap((p: any) => p.editorfields?.map((f: any) => stripHtml(f.text)) ?? [])
        .filter(Boolean)
        .join('\n');
      return {
        id: a.id,
        cmid: a.cmid,
        name: stripHtml(a.name),
        due: date(a.duedate),
        cutoff: date(a.cutoffdate),
        intro: stripHtml(a.intro) || undefined,
        submission: (attempt?.submission ?? attempt?.teamsubmission)?.status,
        grading: attempt?.gradingstatus,
        grade: stripHtml(st?.feedback?.gradefordisplay) || undefined,
        feedback: feedback || undefined,
      };
    });
  }
);
