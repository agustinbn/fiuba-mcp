import * as z from 'zod/v4';
import { date, stripHtml } from '../moodle/format.ts';
import { ws } from '../moodle/ws.ts';
import { defineTool } from './define.ts';

export const listCourses = defineTool(
  'fiuba_list_courses',
  "Lists the student's courses on the FIUBA virtual campus (Moodle). Start here to get course ids.",
  {},
  async s => {
    const courses = await ws<any[]>(s, 'core_enrol_get_users_courses', { userid: s.userid });
    return courses.map(c => ({
      id: c.id,
      name: stripHtml(c.fullname),
      shortname: c.shortname,
      lastaccess: date(c.lastaccess),
      hidden: c.hidden || undefined,
    }));
  }
);

export const getCourse = defineTool(
  'fiuba_get_course',
  "Shows a course: its sections and modules (resources, assignments, forums, links…) with descriptions, dates and file URLs. Use a forum module's `instance` as forumid, a file `url` with fiuba_read_file. Times are Buenos Aires local.",
  { courseid: z.number().int() },
  async (s, { courseid }) => {
    const sections = await ws<any[]>(s, 'core_course_get_contents', { courseid });
    return sections.map(sec => ({
      section: stripHtml(sec.name),
      summary: stripHtml(sec.summary) || undefined,
      modules: sec.modules
        .filter((m: any) => m.uservisible !== false)
        .map((m: any) => ({
          cmid: m.id,
          instance: m.instance,
          type: m.modname,
          name: stripHtml(m.name),
          description: stripHtml(m.description) || undefined,
          dates: m.dates?.length
            ? m.dates.map((d: any) => `${d.label} ${date(d.timestamp)}`)
            : undefined,
          files: m.contents?.map((f: any) => ({
            name: f.filename,
            url: f.fileurl,
            mimetype: f.mimetype,
          })),
        })),
    }));
  }
);
