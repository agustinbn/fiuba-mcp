import { assignments } from './assignments.ts';
import { upcoming } from './calendar.ts';
import { getCourse, listCourses } from './courses.ts';
import { readFile } from './files.ts';
import { forumDiscussions, readDiscussion } from './forums.ts';
import { grades } from './grades.ts';

export const tools = [
  listCourses,
  getCourse,
  readFile,
  upcoming,
  assignments,
  forumDiscussions,
  readDiscussion,
  grades,
];
